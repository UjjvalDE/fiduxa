'use client';

// Extra-time request panel (running job) and the internal post-job feedback
// pop-up for cleaners. Cleaner answers are internal – never shown to customers.
import { useEffect, useId, useState } from 'react';
import { Clock, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componets/ui/dialog';
import { Label } from '@/componets/ui/lable';
import { Textarea } from '@/componets/ui/tesxtarea';
import { api, errorMessage } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { FeedbackPendingItem, WorkerExtraTimeRequest } from '@/lib/types';
import { cn } from '@/lib/utils';

import feedbackMessages from '../_feedback-messages';

const MINUTE_OPTIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * 15);
const DIFFICULTY_TAGS = ['no_access', 'missing_supplies', 'very_dirty', 'more_rooms_than_booked', 'pets', 'time_too_short', 'customer_absent', 'safety', 'other'];
const CONDITION_TAGS = ['clutter', 'hoarding', 'mould', 'pests', 'no_water_or_power', 'strong_odour', 'smoking', 'aggressive_pet', 'other'];

/** "Mehr Zeit anfragen" + own request history for a job in progress */
export function ExtraTimePanel({
  jobId,
  inProgress,
  requests,
  onChange,
}: {
  jobId: string;
  inProgress: boolean;
  requests: WorkerExtraTimeRequest[];
  onChange: () => void;
}) {
  const t = useMessages(feedbackMessages).extra;
  const f = useFormat();
  const id = useId();
  const [minutes, setMinutes] = useState(30);
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const waiting = requests.some((r) => r.status === 'proposed' && (!r.expiresAt || new Date(r.expiresAt) > new Date()));

  // While the customer decides: refresh every 30 s
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(onChange, 30_000);
    return () => clearInterval(timer);
  }, [waiting, onChange]);

  if (!inProgress && requests.length === 0) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setFieldError(t.reasonError);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.post(`/worker/jobs/${jobId}/extra-time`, { minutes, reason: reason.trim() });
      toast.success(t.sent);
      setReason('');
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const statusText = (r: WorkerExtraTimeRequest) => {
    switch (r.status) {
      case 'proposed':
        return t.status.proposed(r.expiresAt ? f.dateTime(r.expiresAt) : '–');
      case 'open':
      case 'paid':
        return t.status.paid(r.newSlotEnd || '–');
      case 'declined':
        return t.status.declined;
      case 'expired':
        return t.status.expired;
      default:
        return t.status.other;
    }
  };

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-base font-semibold text-pine-dark">
        <Clock className="h-5 w-5" aria-hidden="true" />
        {t.title}
      </h2>
      {requests.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.history}</h3>
          <ul className="mt-1 space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className={cn(
                  'rounded-xl border px-3 py-2 text-sm',
                  r.status === 'declined' || r.status === 'expired' ? 'border-amber-200 bg-amber-50 text-amber-900' : r.status === 'proposed' ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-sage bg-mint text-pine-dark'
                )}
              >
                <span className="font-semibold">{t.minutesLabel(r.minutes)}</span> · {statusText(r)}
                <span className="block text-xs opacity-80">{r.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {inProgress && !waiting && (
        <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
          <p className="text-sm text-muted-grey">{t.intro}</p>
          <div className="space-y-1">
            <Label htmlFor={`${id}-min`}>{t.minutes}</Label>
            <select
              id={`${id}-min`}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="h-12 w-full rounded-md border border-input bg-white px-3 text-base"
            >
              {MINUTE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {t.minutesOption(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-reason`}>{t.reason}</Label>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              maxLength={500}
              onChange={(e) => {
                setReason(e.target.value);
                if (fieldError) setFieldError(null);
              }}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={`${id}-hint`}
            />
            <p id={`${id}-hint`} className="text-xs text-muted-grey">
              {t.reasonHint}
            </p>
            {fieldError && <p className="text-sm text-red-700">{fieldError}</p>}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" variant="outline" disabled={pending} className="h-12 w-full text-base">
            {pending && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />}
            {t.submit}
          </Button>
        </form>
      )}
    </section>
  );
}

function Scale({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-charcoal">{label}</legend>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={cn(
              'h-11 w-11 rounded-lg border text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              value === n ? 'border-pine bg-pine text-white' : 'border-border bg-white text-charcoal hover:bg-cream'
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Tags({ label, options, value, onChange, names }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; names: Record<string, string> }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-charcoal">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((tag) => {
          const on = value.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== tag) : [...value, tag])}
              className={cn('rounded-full border px-3 py-1.5 text-sm', on ? 'border-pine bg-mint text-pine-dark' : 'border-border bg-white text-charcoal')}
            >
              {names[tag] ?? tag}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

type Scores = { experience: number | null; customerRating: number | null; homeCondition: number | null; cooperative: number | null; jobDifficulty: number | null };
const EMPTY: Scores = { experience: null, customerRating: null, homeCondition: null, cooperative: null, jobDifficulty: null };

/** Internal feedback pop-up for one completed job */
export function WorkerFeedbackDialog({ item, onClose }: { item: FeedbackPendingItem | null; onClose: () => void }) {
  const t = useMessages(feedbackMessages).feedback;
  const [scores, setScores] = useState<Scores>(EMPTY);
  const [had, setHad] = useState<boolean | null>(null);
  const [diffTags, setDiffTags] = useState<string[]>([]);
  const [diffText, setDiffText] = useState('');
  const [condTags, setCondTags] = useState<string[]>([]);
  const [condText, setCondText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setScores(EMPTY);
    setHad(null);
    setDiffTags([]);
    setDiffText('');
    setCondTags([]);
    setCondText('');
    setError(null);
  }, [item?.bookingId]);

  if (!item) return null;
  const set = (k: keyof Scores) => (v: number) => setScores((s) => ({ ...s, [k]: v }));

  const dismiss = async () => {
    try {
      await api.post(`/worker/jobs/${item.bookingId}/feedback/dismiss`);
    } catch {
      /* closing never fails for the cleaner */
    }
    onClose();
  };

  const submit = async () => {
    if (Object.values(scores).some((v) => v == null) || had == null) {
      setError(t.required);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.post(`/worker/jobs/${item.bookingId}/feedback`, {
        ...scores,
        hadDifficulties: had,
        difficultyTags: had ? diffTags : [],
        difficultyText: had ? diffText.trim() : '',
        conditionTags: condTags,
        conditionText: condText.trim(),
      });
      toast.success(t.thanks);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && dismiss()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>
            {t.job(item.reference)} ·{' '}
            <span className="inline-flex items-center gap-1 font-medium">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {t.internal}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-grey">
            {t.scaleLow} · {t.scaleHigh}
          </p>
          <Scale label={t.experience} value={scores.experience} onChange={set('experience')} />
          <Scale label={t.customerRating} value={scores.customerRating} onChange={set('customerRating')} />
          <Scale label={t.homeCondition} value={scores.homeCondition} onChange={set('homeCondition')} />
          <Scale label={t.cooperative} value={scores.cooperative} onChange={set('cooperative')} />
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-charcoal">{t.hadDifficulties}</legend>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={had === v}
                  onClick={() => setHad(v)}
                  className={cn('h-11 rounded-lg border px-5 text-base', had === v ? 'border-pine bg-pine text-white' : 'border-border bg-white')}
                >
                  {v ? t.yes : t.no}
                </button>
              ))}
            </div>
          </fieldset>
          {had && (
            <>
              <Tags label={t.difficultyTags} options={DIFFICULTY_TAGS} value={diffTags} onChange={setDiffTags} names={t.tags} />
              <div className="space-y-1">
                <Label htmlFor="fb-diff">{t.difficultyText}</Label>
                <Textarea id="fb-diff" value={diffText} maxLength={1000} onChange={(e) => setDiffText(e.target.value)} />
              </div>
            </>
          )}
          <Tags label={t.conditionTags} options={CONDITION_TAGS} value={condTags} onChange={setCondTags} names={t.tags} />
          {condTags.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="fb-cond">{t.conditionText}</Label>
              <Textarea id="fb-cond" value={condText} maxLength={1000} onChange={(e) => setCondText(e.target.value)} />
            </div>
          )}
          <Scale label={t.jobDifficulty} value={scores.jobDifficulty} onChange={set('jobDifficulty')} />
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={dismiss} disabled={pending}>
            {t.later}
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dashboard: open the pop-up for the newest job still waiting for feedback */
export function PendingWorkerFeedback() {
  const [queue, setQueue] = useState<FeedbackPendingItem[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .get<{ pending: FeedbackPendingItem[] }>('/worker/jobs/feedback/pending')
      .then((r) => alive && setQueue(r.pending ?? []))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return <WorkerFeedbackDialog item={queue[0] ?? null} onClose={() => setQueue([])} />;
}
