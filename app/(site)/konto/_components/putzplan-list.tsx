'use client';

// "Mein Putzplan": GET /customer/series – every recurring plan with its next
// date, cleaner and upcoming occurrences; pause / resume / end / skip with confirm.
import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { CirclePause, CirclePlay, CircleStop, LoaderCircle, Repeat, SkipForward, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError, translateApiMessage } from '@/lib/i18n/api-errors';
import common from '@/lib/i18n/messages/common';
import type { BookingSeries, SeriesAction, SeriesOccurrence } from '@/lib/types';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/componets/site/status-badge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/componets/ui/alert-dialog';
import { ErrorBox } from '../../buchung/_components/form-field';
import { slotRange } from '../../_shared/slot-range';
import messages from '../_putzplan-messages';
import { paymentHref } from './booking-helpers';

const STATUS_TONE: Record<BookingSeries['status'], string> = {
  active: 'border-sage bg-mint text-pine-dark',
  paused: 'border-amber-200 bg-amber-50 text-amber-900',
  ended: 'border-border bg-cream text-muted-grey',
};

interface ActionResponse {
  message: string;
  cancelled?: string[];
  kept?: string[];
  series: BookingSeries;
}

/** Small confirm dialog used by every plan action */
function Confirm({
  open,
  onOpenChange,
  title,
  text,
  confirmLabel,
  destructive,
  pending,
  error,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  text: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  const t = useMessages(messages);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error && (
          <p role="alert" className="m-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t.actions.cancel}</AlertDialogCancel>
          <button type="button" onClick={onConfirm} disabled={pending} className={cn('button min-h-[44px]', destructive && 'border-red-700 bg-red-700 hover:bg-red-800')}>
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null} {pending ? t.actions.working : confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Occurrence({ item, onSkip }: { item: SeriesOccurrence; onSkip: (item: SeriesOccurrence) => void }) {
  const t = useMessages(messages);
  const f = useFormat();
  const needsPayment = item.status === 'payment_pending' && item.paymentStatus !== 'paid';
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-cream/50 px-4 py-3">
      <div className="min-w-0">
        <p className="m-0 text-sm font-bold text-pine-dark">
          {f.dateLong(item.preferredDate)} · <span className="tabular-nums">{slotRange(f, item.slot, item.slotEnd)}</span>
        </p>
        <p className="m-0 mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-grey">
          <StatusBadge kind="booking" status={item.status} />
          <span>{item.reference}</span>
          {item.cleaner && (
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3 w-3" aria-hidden="true" /> {item.cleaner.name}
            </span>
          )}
          {item.totalCents != null && <span className="tabular-nums">{f.euro(item.totalCents)}</span>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {needsPayment && (
          <Link href={paymentHref(item._id)} className="button button-small min-h-[40px]">
            {t.labels.payNow}
          </Link>
        )}
        <Link href={`/konto/buchungen/${encodeURIComponent(item._id)}`} className="button button-quiet button-small min-h-[40px]">
          {t.labels.details}
        </Link>
        {item.cancellable ? (
          <button type="button" onClick={() => onSkip(item)} className="button button-quiet button-small min-h-[40px]">
            <SkipForward className="h-4 w-4" aria-hidden="true" /> {t.actions.skip}
          </button>
        ) : (
          <span className="text-xs text-muted-grey">{t.labels.cutoffPassed}</span>
        )}
      </div>
    </li>
  );
}

function SeriesCard({ series, onChanged }: { series: BookingSeries; onChanged: (next: BookingSeries) => void }) {
  const t = useMessages(messages);
  const tc = useMessages(common);
  const f = useFormat();
  const { locale } = useLocale();
  const [dialog, setDialog] = useState<SeriesAction | { skip: string } | null>(null);
  const [pausedUntil, setPausedUntil] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const untilId = useId();

  const close = (open: boolean) => {
    if (!open) {
      setDialog(null);
      setError(null);
      setPausedUntil('');
    }
  };

  const run = async (fn: () => Promise<ActionResponse>) => {
    setPending(true);
    setError(null);
    try {
      const res = await fn();
      onChanged(res.series);
      toast.success(translateApiMessage(res.message, locale));
      if (res.kept?.length) toast.message(t.toasts.kept(res.kept.length));
      close(false);
    } catch (e) {
      setError(translateApiError(e, locale));
    } finally {
      setPending(false);
    }
  };

  const act = (action: SeriesAction) =>
    run(() => api.patch<ActionResponse>(`/customer/series/${encodeURIComponent(series._id)}`, { action, ...(action === 'pause' && pausedUntil ? { pausedUntil } : {}) }));
  const skip = (date: string) => run(() => api.post<ActionResponse>(`/customer/series/${encodeURIComponent(series._id)}/skip`, { date }));

  const skipDate = dialog && typeof dialog === 'object' ? dialog.skip : null;
  const nextSkippable = series.upcoming.find((o) => o.cancellable);
  const nextDate = nextSkippable && new Date(nextSkippable.preferredDate) < new Date(series.nextDate) ? nextSkippable.preferredDate : series.nextDate;
  const planned = series.upcoming.length;

  return (
    <li className="grid gap-5 rounded-2xl border border-border bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="!m-0 !text-xl !leading-tight">{tc.services[series.serviceId] ?? series.serviceId}</h2>
            <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold', STATUS_TONE[series.status])}>{t.status[series.status]}</span>
          </div>
          <p className="m-0 mt-1 flex items-center gap-1.5 text-sm text-muted-grey">
            <Repeat className="h-4 w-4 text-pine" aria-hidden="true" /> {tc.frequencies[series.frequency]} · {t.labels.stats(series.counters.completed, planned)}
          </p>
        </div>
        {series.status !== 'ended' && (
          <div className="flex flex-wrap gap-2">
            {series.status === 'active' && (
              <>
                <button type="button" onClick={() => setDialog({ skip: nextDate.slice(0, 10) })} className="button button-quiet button-small min-h-[40px]">
                  <SkipForward className="h-4 w-4" aria-hidden="true" /> {t.actions.skipNext}
                </button>
                <button type="button" onClick={() => setDialog('pause')} className="button button-quiet button-small min-h-[40px]">
                  <CirclePause className="h-4 w-4" aria-hidden="true" /> {t.actions.pause}
                </button>
              </>
            )}
            {series.status === 'paused' && (
              <button type="button" onClick={() => setDialog('resume')} className="button button-small min-h-[40px]">
                <CirclePlay className="h-4 w-4" aria-hidden="true" /> {t.actions.resume}
              </button>
            )}
            <button type="button" onClick={() => setDialog('end')} className="button button-quiet button-small min-h-[40px] text-red-700">
              <CircleStop className="h-4 w-4" aria-hidden="true" /> {t.actions.end}
            </button>
          </div>
        )}
      </div>

      <dl className="m-0 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted-grey">{t.labels.next}</dt>
          <dd className="m-0 font-bold text-pine-dark">
            {series.status === 'ended'
              ? t.labels.endedAt(f.date(series.endedAt))
              : series.status === 'paused'
                ? series.pausedUntil
                  ? t.labels.pausedUntil(f.date(series.pausedUntil))
                  : t.labels.pausedOpen
                : f.dateLong(series.nextDate)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted-grey">{t.labels.time}</dt>
          <dd className="m-0 tabular-nums text-charcoal">
            {slotRange(f, series.startTime, undefined, series.durationMinutes)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted-grey">{t.labels.address}</dt>
          <dd className="m-0 text-charcoal">
            {series.address.address}, {series.address.postcode} Berlin
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted-grey">{t.labels.payment}</dt>
          <dd className="m-0 text-charcoal">{t.payment[series.paymentMethod]}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-bold uppercase tracking-wide text-muted-grey">{t.labels.cleaner}</dt>
          <dd className="m-0 flex items-center gap-1.5 text-charcoal">
            <UserRound className="h-4 w-4 text-pine" aria-hidden="true" />
            {series.preferredWorker?.name ? t.labels.cleanerPreferred(series.preferredWorker.name.split(/\s+/)[0]) : t.labels.cleanerAuto}
          </dd>
        </div>
      </dl>

      <div className="border-t border-border pt-4">
        <h3 className="mb-2 mt-0 text-sm font-bold text-pine-dark">{t.labels.upcoming}</h3>
        {series.upcoming.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {series.upcoming.map((item) => (
              <Occurrence key={item._id} item={item} onSkip={(o) => setDialog({ skip: o.preferredDate.slice(0, 10) })} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted-grey">{series.status === 'active' ? t.labels.noUpcoming : '–'}</p>
        )}
      </div>

      <Confirm
        open={skipDate !== null}
        onOpenChange={close}
        title={t.dialogs.skipTitle}
        text={t.dialogs.skipText(f.dateLong(skipDate ?? undefined))}
        confirmLabel={t.actions.skip}
        pending={pending}
        error={error}
        onConfirm={() => skipDate && skip(skipDate)}
      />
      <Confirm
        open={dialog === 'pause'}
        onOpenChange={close}
        title={t.dialogs.pauseTitle}
        text={t.dialogs.pauseText}
        confirmLabel={t.actions.pause}
        pending={pending}
        error={error}
        onConfirm={() => act('pause')}
      >
        <div className="grid gap-1.5">
          <label htmlFor={untilId} className="text-sm font-bold text-pine-dark">
            {t.dialogs.pauseUntilLabel}
          </label>
          <input
            id={untilId}
            type="date"
            value={pausedUntil}
            min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
            onChange={(e) => setPausedUntil(e.target.value)}
            className="h-11 rounded-[10px] border border-border bg-white px-3 text-sm"
          />
          <p className="m-0 text-xs text-muted-grey">{t.dialogs.pauseUntilHint}</p>
        </div>
      </Confirm>
      <Confirm
        open={dialog === 'resume'}
        onOpenChange={close}
        title={t.dialogs.resumeTitle}
        text={t.dialogs.resumeText}
        confirmLabel={t.actions.resume}
        pending={pending}
        error={error}
        onConfirm={() => act('resume')}
      />
      <Confirm
        open={dialog === 'end'}
        onOpenChange={close}
        title={t.dialogs.endTitle}
        text={t.dialogs.endText}
        confirmLabel={t.actions.end}
        destructive
        pending={pending}
        error={error}
        onConfirm={() => act('end')}
      />
    </li>
  );
}

export function PutzplanList() {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const [series, setSeries] = useState<BookingSeries[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ series: BookingSeries[] }>('/customer/series');
      setSeries(res.series);
    } catch (e) {
      setError(e ?? new Error('unknown'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const replace = (next: BookingSeries) => setSeries((prev) => (prev ? prev.map((s) => (s._id === next._id ? next : s)) : prev));

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="!m-0 !text-2xl !leading-tight sm:!text-3xl">{t.title}</h1>
        <p className="mb-0 mt-2 max-w-2xl text-sm text-muted-grey">{t.intro}</p>
      </header>

      {loading && !series ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-grey" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.loading}
        </p>
      ) : error && !series ? (
        <ErrorBox message={translateApiError(error, locale)} onRetry={load} />
      ) : !series || series.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-2xl border border-dashed border-border bg-white p-6 sm:p-8">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-mint text-pine">
            <Repeat className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="m-0 text-lg font-bold text-pine-dark">{t.emptyTitle}</p>
          <p className="m-0 max-w-md text-sm text-muted-grey">{t.emptyText}</p>
          <Link href="/buchung?frequency=weekly" className="button min-h-[44px]">
            {t.bookCta}
          </Link>
        </div>
      ) : (
        <ul className="m-0 grid list-none gap-5 p-0" aria-busy={loading}>
          {series.map((s) => (
            <SeriesCard key={s._id} series={s} onChanged={replace} />
          ))}
        </ul>
      )}
    </div>
  );
}
