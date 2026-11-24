'use client';

// Late confirmation of a past job ("Job erledigt bestätigen") and the
// "did not take place" report – used on the dashboard ("Bitte bestätigen")
// and on the job detail page.
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Textarea } from '@/componets/ui/tesxtarea';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { FeedbackPendingItem } from '@/lib/types';
import { useApi } from '@/app/admin/_components/use-api';

import confirmMessages from '../_confirm-messages';
import { parseEuroToCents } from './cash';
import { JobCard, type WorkerJobWithSlot } from './job-card';
import { WorkerFeedbackDialog } from './job-feedback';
import { useWorkerErrorText } from './job-flow';

type Reason = 'customer_absent' | 'no_access' | 'other';
const REASONS: Reason[] = ['customer_absent', 'no_access', 'other'];

const notHappenedOf = (job: WorkerJobWithSlot) =>
  (job.job as { notHappened?: { reportedAt?: string; decision?: string } } | undefined)?.notHappened;

export function ConfirmLatePanel({ job, onDone }: { job: WorkerJobWithSlot; onDone: (feedback: FeedbackPendingItem | null) => void }) {
  const t = useMessages(confirmMessages);
  const f = useFormat();
  const errorText = useWorkerErrorText();
  const info = job.confirmation;
  const [start, setStart] = useState(info?.defaults.startTime ?? '08:00');
  const [end, setEnd] = useState(info?.defaults.endTime ?? '10:00');
  const [note, setNote] = useState('');
  const [cash, setCash] = useState('');
  const [mode, setMode] = useState<'confirm' | 'report'>('confirm');
  const [reason, setReason] = useState<Reason>('customer_absent');
  const [reasonNote, setReasonNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reported = notHappenedOf(job);
  if (reported?.reportedAt && reported.decision === 'pending') {
    return (
      <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {t.reportedState}
      </p>
    );
  }
  if (!info?.needed) return null;
  if (!info.possible) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {t.windowClosed}
      </p>
    );
  }

  const cashDue = job.cash && !job.cash.collected;
  const id = job._id;

  const confirm = async () => {
    if (pending) return;
    if (!(end > start)) return setError(t.errEnd);
    const cashCents = cashDue ? parseEuroToCents(cash) : null;
    if (cashDue && cashCents == null) return setError(t.errCash);
    setPending(true);
    setError(null);
    try {
      const res = await api.post<{ feedbackPending?: boolean }>(`/worker/jobs/${id}/confirm-late`, {
        startTime: start,
        endTime: end,
        ...(note.trim() && { note: note.trim() }),
        ...(cashCents != null && { cashCollectedCents: cashCents }),
      });
      toast.success(t.confirmed);
      onDone(
        res.feedbackPending
          ? { bookingId: id, reference: job.reference, serviceId: job.serviceId, preferredDate: job.preferredDate, completedAt: null }
          : null
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  const report = async () => {
    if (pending) return;
    if (reason === 'other' && reasonNote.trim().length < 5) return setError(t.errNote);
    setPending(true);
    setError(null);
    try {
      await api.post(`/worker/jobs/${id}/not-happened`, { reason, ...(reasonNote.trim() && { note: reasonNote.trim() }) });
      toast.success(t.reported);
      onDone(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-4">
      {mode === 'confirm' ? (
        <>
          <p className="text-base font-semibold text-pine-dark">{t.title}</p>
          <p className="text-sm text-charcoal">{t.intro(f.dateLong(info.deadline))}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`start-${id}`}>{t.start}</Label>
              <Input id={`start-${id}`} type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-12 text-base" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`end-${id}`}>{t.end}</Label>
              <Input id={`end-${id}`} type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-12 text-base" />
            </div>
          </div>
          {cashDue && (
            <div className="space-y-1">
              <Label htmlFor={`cash-${id}`}>{t.cash}</Label>
              <Input id={`cash-${id}`} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} className="h-12 text-base" />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor={`note-${id}`}>{t.note}</Label>
            <Textarea id={`note-${id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <Button type="button" onClick={confirm} disabled={pending} className="h-14 w-full text-lg">
            {pending ? <Loader2 className="mr-2 h-6 w-6 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="mr-2 h-6 w-6" aria-hidden="true" />}
            {t.confirm}
          </Button>
          <Button type="button" variant="outline" onClick={() => { setMode('report'); setError(null); }} disabled={pending} className="h-12 w-full">
            <XCircle className="mr-2 h-5 w-5" aria-hidden="true" /> {t.notHappened}
          </Button>
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-pine-dark">{t.notHappenedTitle}</p>
          <fieldset className="space-y-2">
            {REASONS.map((r) => (
              <label key={r} className="flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-white px-3 text-sm">
                <input type="radio" name={`reason-${id}`} value={r} checked={reason === r} onChange={() => setReason(r)} />
                {t.reasons[r]}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor={`rnote-${id}`}>{t.reasonNote}</Label>
            <Textarea id={`rnote-${id}`} value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} maxLength={1000} rows={3} />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => { setMode('confirm'); setError(null); }} disabled={pending} className="h-12">
              {t.cancel}
            </Button>
            <Button type="button" onClick={report} disabled={pending} className="h-12">
              {pending && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />}
              {t.send}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Dashboard: past jobs waiting for my confirmation – shown on top, hidden when empty */
export function NeedsConfirmationList() {
  const t = useMessages(confirmMessages);
  const { data, reload } = useApi<{ jobs: WorkerJobWithSlot[] }>('/worker/jobs?scope=confirm');
  const [feedback, setFeedback] = useState<FeedbackPendingItem | null>(null);
  const jobs = data?.jobs ?? [];
  if (jobs.length === 0) return <WorkerFeedbackDialog item={feedback} onClose={() => setFeedback(null)} />;
  return (
    <section aria-labelledby="confirm-title" className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <h2 id="confirm-title" className="flex items-center gap-2 text-lg font-semibold text-amber-900">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" /> {t.listTitle} ({jobs.length})
      </h2>
      <p className="text-sm text-amber-900">{t.listIntro}</p>
      <ul className="space-y-4">
        {jobs.map((job) => (
          <li key={job._id} className="space-y-2">
            <JobCard job={job} />
            <ConfirmLatePanel
              job={job}
              onDone={(item) => {
                setFeedback(item);
                reload();
              }}
            />
          </li>
        ))}
      </ul>
      <WorkerFeedbackDialog item={feedback} onClose={() => setFeedback(null)} />
    </section>
  );
}
