'use client';

// Admin: recurring cleaning plans – GET /admin/series, PATCH /admin/series/:id
import { Suspense, useId, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CirclePause, CirclePlay, CircleStop, Repeat } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Tabs, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { api, qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { AdminBookingSeries, AdminWorker, Pagination, SeriesAction, SeriesStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ConfirmAction } from '../_components/confirm-action';
import { EmptyState, ErrorState, ListSkeleton, NativeSelect, PageHeader } from '../_components/states';
import { useApi, useErrorText, useQueryParams } from '../_components/use-api';
import messages from './_messages';

const KEYS = ['status'] as const;
const STATUSES: SeriesStatus[] = ['active', 'paused', 'ended'];

const STATUS_TONE: Record<SeriesStatus, string> = {
  active: 'border-sage bg-mint text-pine-dark',
  paused: 'border-amber-200 bg-amber-50 text-amber-900',
  ended: 'border-border bg-cream text-muted-grey',
};

interface ActionResponse {
  message: string;
  cancelled: string[];
  kept: string[];
  series: AdminBookingSeries;
}

const customerOf = (s: AdminBookingSeries) => (typeof s.customer === 'object' && s.customer ? s.customer : null);

function PreferredCleaner({ series, workers, onChanged }: { series: AdminBookingSeries; workers: AdminWorker[]; onChanged: (next: AdminBookingSeries) => void }) {
  const t = useMessages(messages);
  const errorText = useErrorText();
  const [selected, setSelected] = useState(series.preferredWorker?._id ?? '');
  const [pending, setPending] = useState(false);
  const id = useId();
  const dirty = selected !== (series.preferredWorker?._id ?? '');

  const save = async () => {
    setPending(true);
    try {
      const res = await api.patch<ActionResponse>(`/admin/series/${encodeURIComponent(series._id)}`, { preferredWorker: selected || null });
      onChanged(res.series);
      toast.success(t.cleanerSaved);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-end gap-2">
      <div className="min-w-[160px] space-y-1">
        <Label htmlFor={id} className="sr-only">
          {t.cleanerLabel}
        </Label>
        <NativeSelect id={id} value={selected} onChange={(e) => setSelected(e.target.value)} disabled={pending || series.status === 'ended'} className="h-9">
          <option value="">{t.cleanerNone}</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
          {series.preferredWorker && !workers.some((w) => w.id === series.preferredWorker?._id) && (
            <option value={series.preferredWorker._id}>{series.preferredWorker.name ?? series.preferredWorker._id}</option>
          )}
        </NativeSelect>
      </div>
      {dirty && (
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {t.cleanerSave}
        </Button>
      )}
    </div>
  );
}

function PlanActions({ series, onChanged }: { series: AdminBookingSeries; onChanged: (next: AdminBookingSeries) => void }) {
  const t = useMessages(messages);
  const [pausedUntil, setPausedUntil] = useState('');
  const untilId = useId();

  const run = async (action: SeriesAction) => {
    const res = await api.patch<ActionResponse>(`/admin/series/${encodeURIComponent(series._id)}`, {
      action,
      ...(action === 'pause' && pausedUntil ? { pausedUntil } : {}),
    });
    onChanged(res.series);
    toast.success(t.done(res.cancelled.length, res.kept.length));
  };

  if (series.status === 'ended') return null;
  return (
    <div className="flex flex-wrap gap-2">
      {series.status === 'active' ? (
        <ConfirmAction
          trigger={
            <>
              <CirclePause className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t.pause}
            </>
          }
          triggerSize="sm"
          title={t.pauseTitle}
          description={t.pauseText}
          confirmLabel={t.pause}
          onOpenChange={(open) => !open && setPausedUntil('')}
          onConfirm={() => run('pause')}
        >
          <div className="space-y-1.5">
            <Label htmlFor={untilId}>{t.pauseUntil}</Label>
            <Input id={untilId} type="date" value={pausedUntil} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} onChange={(e) => setPausedUntil(e.target.value)} />
          </div>
        </ConfirmAction>
      ) : (
        <ConfirmAction
          trigger={
            <>
              <CirclePlay className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t.resume}
            </>
          }
          triggerSize="sm"
          title={t.resumeTitle}
          description={t.resumeText}
          confirmLabel={t.resume}
          onConfirm={() => run('resume')}
        />
      )}
      <ConfirmAction
        trigger={
          <>
            <CircleStop className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t.end}
          </>
        }
        triggerSize="sm"
        destructive
        title={t.endTitle}
        description={t.endText}
        confirmLabel={t.end}
        onConfirm={() => run('end')}
      />
    </div>
  );
}

function PlanRow({ series, workers, onChanged }: { series: AdminBookingSeries; workers: AdminWorker[]; onChanged: (next: AdminBookingSeries) => void }) {
  const t = useMessages(messages);
  const tc = useMessages(common);
  const f = useFormat();
  const customer = customerOf(series);
  const next =
    series.status === 'ended'
      ? t.endedAt(f.date(series.endedAt))
      : series.status === 'paused'
        ? series.pausedUntil
          ? t.pausedUntil(f.date(series.pausedUntil))
          : t.pausedOpen
        : f.dateShort(series.nextDate);

  return (
    <li className="grid gap-4 rounded-2xl border border-border bg-white p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="m-0 truncate font-semibold text-pine-dark">{customer?.name ?? series.customerDetails.name}</p>
        <p className="m-0 truncate text-xs text-muted-grey">{customer?.email ?? series.customerDetails.email}</p>
        <p className="m-0 mt-1 text-xs text-muted-grey">
          {series.customerDetails.address}, {series.customerDetails.postcode}
        </p>
        <Link href={`/admin/buchungen/${encodeURIComponent(series.createdFrom)}`} className="mt-1 inline-block text-xs font-medium text-pine underline underline-offset-2">
          {t.openBooking}
        </Link>
      </div>
      <div className="min-w-0 text-sm">
        <p className="m-0 flex flex-wrap items-center gap-2 font-medium text-charcoal">
          <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', STATUS_TONE[series.status])}>{t.status[series.status]}</span>
          {tc.services[series.serviceId] ?? series.serviceId} · {tc.frequencies[series.frequency]}
        </p>
        <p className="m-0 mt-1 text-xs text-muted-grey">
          {f.slot(series.startTime)} · {f.hours(series.durationMinutes)} · {series.areaM2} m² · {t.payment[series.paymentMethod]}
        </p>
        <p className="m-0 mt-1 text-xs text-muted-grey">
          {t.stats(series.counters.completed, series.counters.generated)} · {t.upcoming(series.upcoming.length)}
        </p>
        {series.lastProblem && series.status === 'active' && (
          <p className="m-0 mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900" role="status">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {t.problemAt(f.date(series.lastProblem.date))} {t.problem[series.lastProblem.reason]}
              {series.lastProblem.message ? ` (${series.lastProblem.message})` : ''}
            </span>
          </p>
        )}
      </div>
      <div className="min-w-0 text-sm">
        <p className="m-0 text-xs font-medium uppercase tracking-wide text-muted-grey">{t.colNext}</p>
        <p className="m-0 font-semibold text-charcoal">{next}</p>
        <p className="m-0 mt-2 text-xs font-medium uppercase tracking-wide text-muted-grey">{t.colCleaner}</p>
        <div className="mt-1">
          <PreferredCleaner series={series} workers={workers} onChanged={onChanged} />
        </div>
      </div>
      <div className="flex items-start">
        <PlanActions series={series} onChanged={onChanged} />
      </div>
    </li>
  );
}

function PlansInner() {
  const t = useMessages(messages);
  const { values, setParams } = useQueryParams(KEYS);
  const status = (STATUSES as string[]).includes(values.status) ? (values.status as SeriesStatus) : '';
  const { data, error, loading, reload, setData } = useApi<{ series: AdminBookingSeries[] }>(`/admin/series${qs({ status })}`);
  const workers = useApi<{ workers: AdminWorker[]; pagination: Pagination }>('/admin/workers?status=approved&limit=50');

  const update = (next: AdminBookingSeries) => setData((prev) => (prev ? { series: prev.series.map((s) => (s._id === next._id ? next : s)) } : prev));

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <Tabs value={status} onValueChange={(value) => setParams({ status: value })} className="mb-4">
        <TabsList aria-label={t.tabsLabel} className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="">{t.tabAll}</TabsTrigger>
          {STATUSES.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t.status[value]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading && !data ? (
        <ListSkeleton label={t.loading} />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.series.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyText} icon={Repeat} />
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0" aria-busy={loading}>
          {data.series.map((s) => (
            <PlanRow key={s._id} series={s} workers={workers.data?.workers ?? []} onChanged={update} />
          ))}
        </ul>
      )}
    </>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <PlansInner />
    </Suspense>
  );
}
