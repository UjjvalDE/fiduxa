'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Banknote,
  CalendarDays,
  Check,
  Clock,
  Home,
  Inbox,
  Loader2,
  MapPin,
  PawPrint,
  Plus,
  Repeat,
  RefreshCw,
  Ruler,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/componets/ui/dialog';
import { Skeleton } from '@/componets/ui/skeleton';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import catalogue from '@/lib/i18n/messages/catalogue';
import common from '@/lib/i18n/messages/common';
import type { OpenJob } from '@/lib/types';
import { ErrorState } from '@/app/admin/_components/states';
import type { ApiState } from '@/app/admin/_components/use-api';

import messages from '../_messages';
import portalMessages from '../_portal-messages';
import cashMessages from '../_cash-messages';
import { CashBadge, useJobTime } from './cash';
import { isConflict, useWorkerErrorText } from './job-flow';

export interface OpenJobsResponse {
  count: number;
  jobs: OpenJob[];
}

/** Facts of an open job – shared by the card and the accept dialog */
function OpenJobFacts({ job }: { job: OpenJob }) {
  const t = useMessages(messages);
  const p = useMessages(portalMessages).jobExtra;
  const c = useMessages(common);
  const cat = useMessages(catalogue);
  const f = useFormat();
  const jobTime = useJobTime();
  const cash = useMessages(cashMessages);
  const extraText = cat.extras as Record<string, { label: string } | undefined>;
  const extras = job.estimate?.extras?.length
    ? job.estimate.extras.map((x) => extraText[x.id]?.label ?? x.label)
    : job.extras.map((id) => extraText[id]?.label ?? id);
  const iconClass = 'h-5 w-5 shrink-0 text-pine';

  return (
    <ul className="space-y-2 text-base text-charcoal">
      <li className="flex items-center gap-3">
        <CalendarDays className={iconClass} aria-hidden="true" />
        <span className="font-semibold">{f.dateLong(job.preferredDate)}</span>
      </li>
      <li className="flex items-center gap-3">
        <Clock className={iconClass} aria-hidden="true" />
        <span>{jobTime(job.slot, job.slotEnd, job.estimate?.durationMinutes)}</span>
      </li>
      <li className="flex items-center gap-3">
        <Ruler className={iconClass} aria-hidden="true" />
        <span>
          {job.areaM2} m² · {t.open.condition(c.conditions[job.condition]?.label ?? job.condition)}
        </span>
      </li>
      <li className="flex items-center gap-3">
        <MapPin className={iconClass} aria-hidden="true" />
        <span>{t.open.location(job.postcode)}</span>
      </li>
      <li className="flex items-center gap-3">
        <Repeat className={iconClass} aria-hidden="true" />
        <span>{c.frequencies[job.frequency] ?? job.frequency}</span>
      </li>
      {job.cash && (
        <li className="flex items-center gap-3">
          <Banknote className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-900">
            {cash.badge} · {cash.openHint}
          </span>
        </li>
      )}
      {job.pets && (
        <li className="flex items-center gap-3">
          <PawPrint className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-sm font-semibold text-amber-900">
            {p.pets}
          </span>
        </li>
      )}
      {extras.length > 0 && (
        <li className="flex items-start gap-3">
          <Plus className={`mt-0.5 ${iconClass}`} aria-hidden="true" />
          <span>
            <span className="sr-only">{t.open.extras}: </span>
            <span className="flex flex-wrap gap-1.5">
              {extras.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-border bg-cream px-2.5 py-0.5 text-sm text-charcoal"
                >
                  {label}
                </span>
              ))}
            </span>
          </span>
        </li>
      )}
    </ul>
  );
}

function OpenJobCard({
  job,
  busy,
  onAccept,
  onDecline,
}: {
  job: OpenJob;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const t = useMessages(messages).open;
  const c = useMessages(common);
  const f = useFormat();
  const service = c.services[job.serviceId] ?? job.serviceId;
  const when = f.dateShort(job.preferredDate);
  const time = useJobTime()(job.slot, job.slotEnd, job.estimate?.durationMinutes);
  const titleId = `open-job-${job._id}`;

  return (
    <article aria-labelledby={titleId} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 id={titleId} className="flex items-center gap-2 text-lg font-semibold text-pine-dark">
          <Home className="h-5 w-5 text-pine" aria-hidden="true" />
          {service}
        </h3>
        <span className="flex flex-col items-end gap-1">
          <span className="font-mono text-xs text-muted-grey">{job.reference}</span>
          {job.cash && <CashBadge />}
        </span>
      </div>
      <OpenJobFacts job={job} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-14 text-base"
          onClick={onDecline}
          disabled={busy}
          aria-label={t.declineAria(when, time)}
        >
          <X className="mr-2 h-5 w-5" aria-hidden="true" />
          {t.decline}
        </Button>
        <Button
          type="button"
          className="h-14 text-base"
          onClick={onAccept}
          disabled={busy}
          aria-label={t.acceptAria(when, time)}
        >
          <Check className="mr-2 h-5 w-5" aria-hidden="true" />
          {t.accept}
        </Button>
      </div>
    </article>
  );
}

export function OpenJobsPanel({
  state,
  onAccepted,
}: {
  state: ApiState<OpenJobsResponse>;
  onAccepted: () => void;
}) {
  const t = useMessages(messages);
  const c = useMessages(common);
  const errorText = useWorkerErrorText();
  const { data, error, loading, reload, setData } = state;
  const [confirmJob, setConfirmJob] = useState<OpenJob | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState<string | null>(null);
  const pendingRef = useRef(false);

  // Announce the count after each (re)load, but not on the very first render
  const [announcement, setAnnouncement] = useState('');
  const firstLoad = useRef(true);
  const count = data?.jobs.length;
  useEffect(() => {
    if (count === undefined) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    setAnnouncement(t.home.openCount(count));
  }, [count, t.home]);

  const removeJob = (id: string) =>
    setData((prev) =>
      prev ? { ...prev, count: Math.max(0, prev.count - 1), jobs: prev.jobs.filter((j) => j._id !== id) } : prev
    );

  const accept = async () => {
    if (!confirmJob || pendingRef.current) return;
    pendingRef.current = true;
    setAccepting(true);
    const job = confirmJob;
    try {
      await api.post(`/worker/jobs/${job._id}/accept`);
      removeJob(job._id);
      setConfirmJob(null);
      toast.success(t.open.accepted, { description: t.open.acceptedText });
      onAccepted();
    } catch (err) {
      toast.error(errorText(err));
      if (isConflict(err)) {
        setConfirmJob(null);
        reload();
      }
    } finally {
      pendingRef.current = false;
      setAccepting(false);
    }
  };

  const decline = async (job: OpenJob) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setDeclining(job._id);
    try {
      await api.post(`/worker/jobs/${job._id}/decline`);
      removeJob(job._id);
      toast.success(t.open.declined);
    } catch (err) {
      toast.error(errorText(err));
      if (isConflict(err)) reload();
    } finally {
      pendingRef.current = false;
      setDeclining(null);
    }
  };

  let body: React.ReactNode;
  if (error && !data) {
    body = <ErrorState message={error} onRetry={reload} />;
  } else if (!data) {
    body = (
      <div className="space-y-3" role="status" aria-label={t.open.loading}>
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  } else if (data.jobs.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-white px-6 py-10 text-center">
        <Inbox className="h-6 w-6 text-sage" aria-hidden="true" />
        <p className="text-sm text-muted-grey">{t.open.empty}</p>
      </div>
    );
  } else {
    body = (
      <ul className="space-y-3">
        {data.jobs.map((job) => (
          <li key={job._id}>
            <OpenJobCard
              job={job}
              busy={accepting || declining !== null}
              onAccept={() => setConfirmJob(job)}
              onDecline={() => decline(job)}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <p className="font-medium">{t.open.intro}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-sky-800">{t.open.autoRefresh}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 bg-white px-4 text-sm"
            onClick={reload}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} aria-hidden="true" />
            {loading ? t.open.refreshing : t.open.refresh}
          </Button>
        </div>
      </div>

      {error && data && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {body}

      <Dialog
        open={confirmJob !== null}
        onOpenChange={(open) => {
          if (!open && !accepting) setConfirmJob(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.open.confirmTitle}</DialogTitle>
            <DialogDescription>{t.open.confirmDescription}</DialogDescription>
          </DialogHeader>
          {confirmJob && (
            <div className="rounded-xl border border-border bg-cream/60 p-4">
              <p className="mb-2 font-semibold text-pine-dark">
                {c.services[confirmJob.serviceId] ?? confirmJob.serviceId}
                <span className="ml-2 font-mono text-xs font-normal text-muted-grey">{confirmJob.reference}</span>
              </p>
              <OpenJobFacts job={confirmJob} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => setConfirmJob(null)}
              disabled={accepting}
            >
              {t.open.cancel}
            </Button>
            <Button type="button" className="h-12 text-base" onClick={accept} disabled={accepting}>
              {accepting ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="mr-2 h-5 w-5" aria-hidden="true" />
              )}
              {t.open.confirmButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
