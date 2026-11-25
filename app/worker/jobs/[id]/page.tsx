'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  Car,
  CheckCircle2,
  Circle,
  Clock,
  Info,
  KeyRound,
  ListChecks,
  Loader2,
  MapPin,
  Navigation,
  PawPrint,
  Phone,
  Play,
  Plus,
  StickyNote,
  Undo2,
  Wallet,
  XCircle,
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
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Skeleton } from '@/componets/ui/skeleton';
import { Textarea } from '@/componets/ui/tesxtarea';
import { MessageThread } from '@/componets/site/message-thread';
import { RequireRole } from '@/lib/auth';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import catalogue from '@/lib/i18n/messages/catalogue';
import common from '@/lib/i18n/messages/common';
import { cn } from '@/lib/utils';
import { ErrorState } from '@/app/admin/_components/states';
import { useApi } from '@/app/admin/_components/use-api';

import cashMessages from '../../_cash-messages';
import messages from '../../_messages';
import portalMessages from '../../_portal-messages';
import { PayoutStatusBadge, payoutDisplayStatus } from '../../_components/portal-ui';
import { centsToInput, parseEuroToCents, useJobTime } from '../../_components/cash';
import { JobStatusBadge, type WorkerJobWithSlot } from '../../_components/job-card';
import { ExtraTimePanel, WorkerFeedbackDialog } from '../../_components/job-feedback';
import { ConfirmLatePanel } from '../../_components/job-confirmation';
import { EmergencyPanel, isAutoMode } from '../../_components/auto-assign';
import { useWorkerOverview } from '../../_components/worker-context';
import type { FeedbackPendingItem } from '@/lib/types';
import { ISSUE_TYPES, type IssueType, mapsUrl } from '../../_components/labels';
import {
  RELEASE_CUTOFF_HOURS,
  berlinToday,
  calendarDay,
  canReleaseNow,
  clearChecklist,
  loadChecklist,
  saveChecklist,
  useWorkerErrorText as useErrorText,
} from '../../_components/job-flow';

function Section({
  title,
  icon: Icon,
  children,
  id,
}: {
  title: string;
  icon: typeof MapPin;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <h2 id={id} className="mb-3 flex items-center gap-2 text-base font-semibold text-pine-dark">
        <Icon className="h-5 w-5 text-pine" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

interface ChecklistItem {
  key: string;
  label: string;
  extra: boolean;
}

function CompleteDialog({
  open,
  onOpenChange,
  jobId,
  items,
  ticked,
  cashDueCents,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  items: ChecklistItem[];
  ticked: string[];
  /** Cash job not yet collected: the price to collect (else null) */
  cashDueCents: number | null;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();
  const cashId = useId();
  const t = useMessages(messages).completeDialog;
  const cm = useMessages(cashMessages).complete;
  const f = useFormat();
  const errorText = useErrorText();

  // Cash: amount received (prefilled with the price) + confirmation
  const [cashInput, setCashInput] = useState('');
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [cashErrors, setCashErrors] = useState<{ amount?: string; confirm?: string }>({});
  useEffect(() => {
    if (open && cashDueCents != null) {
      setCashInput(centsToInput(cashDueCents, f.locale));
      setCashConfirmed(false);
      setCashErrors({});
    }
  }, [open, cashDueCents, f.locale]);
  const cashCents = cashDueCents != null ? parseEuroToCents(cashInput) : null;
  const cashDiffers = cashDueCents != null && cashCents != null && cashCents !== cashDueCents;

  const done = items.filter((item) => ticked.includes(item.key));
  const unticked = items.length - done.length;

  const submit = async () => {
    if (pending) return;
    if (cashDueCents != null) {
      const next: typeof cashErrors = {};
      if (cashCents == null) next.amount = cm.errAmount;
      if (!cashConfirmed) next.confirm = cm.errConfirm;
      setCashErrors(next);
      if (next.amount || next.confirm) return;
    }
    setPending(true);
    setError(null);
    try {
      const body: { note?: string; checklistDone: string[]; cashCollectedCents?: number } = {
        checklistDone: done.map((item) => item.key),
      };
      if (note.trim()) body.note = note.trim();
      if (cashDueCents != null && cashCents != null) body.cashCollectedCents = cashCents;
      await api.post(`/worker/jobs/${jobId}/complete`, body);
      toast.success(t.success);
      clearChecklist(jobId);
      onOpenChange(false);
      setNote('');
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        onOpenChange(o);
        if (!o) setError(null);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        {items.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-charcoal">{t.checklistSummary(done.length, items.length)}</p>
            {unticked > 0 ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {t.unticked(unticked)}
              </p>
            ) : (
              <p className="flex items-center gap-2 rounded-lg border border-sage bg-mint px-3 py-2 text-sm text-pine-dark">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t.allDone}
              </p>
            )}
            {unticked > 0 && (
              <ul className="space-y-1 text-sm text-muted-grey">
                {items
                  .filter((item) => !ticked.includes(item.key))
                  .map((item) => (
                    <li key={item.key} className="flex items-start gap-2">
                      <Circle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
        {cashDueCents != null && (
          <fieldset className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-amber-900">
              <Banknote className="h-5 w-5" aria-hidden="true" />
              {cm.legend}
            </legend>
            <p className="text-base font-semibold text-amber-950">{cm.expected(f.euro(cashDueCents))}</p>
            <div className="space-y-1.5">
              <Label htmlFor={cashId} className="text-charcoal">
                {cm.amount} <span aria-hidden="true">*</span>
              </Label>
              <Input
                id={cashId}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                required
                value={cashInput}
                onChange={(e) => {
                  setCashInput(e.target.value);
                  if (cashErrors.amount) setCashErrors((prev) => ({ ...prev, amount: undefined }));
                }}
                disabled={pending}
                aria-invalid={Boolean(cashErrors.amount)}
                aria-describedby={`${cashId}-hint${cashErrors.amount ? ` ${cashId}-err` : ''}${cashDiffers ? ` ${cashId}-diff` : ''}`}
                className="h-12 bg-white text-lg font-semibold"
              />
              <p id={`${cashId}-hint`} className="text-xs text-amber-900/80">
                {cm.amountHint}
              </p>
              {cashErrors.amount && (
                <p id={`${cashId}-err`} className="text-sm text-red-700">
                  {cashErrors.amount}
                </p>
              )}
              {cashDiffers && (
                <p
                  id={`${cashId}-diff`}
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900"
                >
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {cm.differs(f.euro(cashDueCents))}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor={`${cashId}-confirm`}
                className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border border-amber-300 bg-white px-3 py-2 text-base text-charcoal focus-within:ring-2 focus-within:ring-ring"
              >
                <input
                  id={`${cashId}-confirm`}
                  type="checkbox"
                  checked={cashConfirmed}
                  onChange={(e) => {
                    setCashConfirmed(e.target.checked);
                    if (cashErrors.confirm) setCashErrors((prev) => ({ ...prev, confirm: undefined }));
                  }}
                  disabled={pending}
                  aria-invalid={Boolean(cashErrors.confirm)}
                  aria-describedby={cashErrors.confirm ? `${cashId}-confirm-err` : undefined}
                  className="h-6 w-6 shrink-0 accent-[#174D3A]"
                />
                {cm.confirm}
              </label>
              {cashErrors.confirm && (
                <p id={`${cashId}-confirm-err`} className="mt-1 text-sm text-red-700">
                  {cashErrors.confirm}
                </p>
              )}
            </div>
          </fieldset>
        )}
        <div className="space-y-2">
          <Label htmlFor={noteId}>{t.note}</Label>
          <Textarea
            id={noteId}
            rows={4}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.notePlaceholder}
            disabled={pending}
            className="text-base"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={pending}>
            {t.back}
          </Button>
          <Button type="button" className="h-12 text-base" onClick={submit} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden="true" />
            )}
            {unticked > 0 ? t.submitAnyway : t.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseDialog({
  open,
  onOpenChange,
  jobId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();
  const t = useMessages(messages).releaseDialog;
  const errorText = useErrorText();

  const reset = () => {
    setReason('');
    setFieldError(null);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setFieldError(t.errReason);
      return;
    }
    setFieldError(null);
    setPending(true);
    setError(null);
    try {
      await api.post(`/worker/jobs/${jobId}/release`, { reason: trimmed });
      toast.success(t.success);
      clearChecklist(jobId);
      onOpenChange(false);
      reset();
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={reasonId}>
              {t.reason} <span aria-hidden="true">*</span>
            </Label>
            <Textarea
              id={reasonId}
              rows={3}
              maxLength={500}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={`${reasonId}-hint${fieldError ? ` ${reasonId}-err` : ''}`}
              className="text-base"
            />
            <p id={`${reasonId}-hint`} className="text-xs text-muted-grey">
              {t.reasonHint} ({reason.trim().length}/500)
            </p>
            {fieldError && (
              <p id={`${reasonId}-err`} className="text-sm text-red-700">
                {fieldError}
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={pending}>
              {t.cancel}
            </Button>
            <Button type="submit" variant="destructive" className="h-12 text-base" disabled={pending}>
              {pending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Undo2 className="mr-2 h-5 w-5" aria-hidden="true" />
              )}
              {t.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Vertical progress: Angenommen → Unterwegs → Gestartet → Abgeschlossen */
function StepList({ job }: { job: WorkerJobWithSlot }) {
  const t = useMessages(messages).job.steps;
  const f = useFormat();
  const started = Boolean(job.job?.startedAt) || job.status === 'in_progress' || job.status === 'completed';
  const completed = Boolean(job.job?.completedAt) || job.status === 'completed';
  const steps = [
    { key: 'accepted', label: t.accepted, done: true, at: job.assignedAt },
    { key: 'onTheWay', label: t.onTheWay, done: Boolean(job.job?.onTheWayAt) || started, at: job.job?.onTheWayAt },
    { key: 'started', label: t.started, done: started, at: job.job?.startedAt },
    { key: 'completed', label: t.completed, done: completed, at: job.job?.completedAt },
  ];
  const currentIndex = steps.findIndex((step) => !step.done);

  return (
    <Section title={t.title} icon={ListChecks} id="job-steps">
      <ol className="relative space-y-0" aria-live="polite">
        {steps.map((step, i) => {
          const current = i === currentIndex;
          const last = i === steps.length - 1;
          return (
            <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0" aria-current={current ? 'step' : undefined}>
              {!last && (
                <span
                  className={cn('absolute left-[13px] top-7 h-[calc(100%-24px)] w-0.5', step.done ? 'bg-pine' : 'bg-border')}
                  aria-hidden="true"
                />
              )}
              {step.done ? (
                <CheckCircle2 className="relative h-7 w-7 shrink-0 text-pine" aria-hidden="true" />
              ) : (
                <Circle
                  className={cn('relative h-7 w-7 shrink-0', current ? 'text-pine' : 'text-sage')}
                  strokeWidth={current ? 2.5 : 2}
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 pt-0.5">
                <p
                  className={cn(
                    'text-base',
                    step.done ? 'font-medium text-charcoal' : current ? 'font-semibold text-pine-dark' : 'text-muted-grey'
                  )}
                >
                  {step.label}
                  <span className="sr-only"> {step.done ? t.done : t.open}</span>
                </p>
                {step.done && step.at && <p className="text-sm text-muted-grey">{f.dateTime(step.at)}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function Checklist({
  items,
  ticked,
  onToggle,
}: {
  items: ChecklistItem[];
  ticked: string[];
  onToggle: (key: string) => void;
}) {
  const t = useMessages(messages).job;
  const groupId = useId();
  const done = items.filter((item) => ticked.includes(item.key)).length;
  const tasks = items.filter((item) => !item.extra);
  const extras = items.filter((item) => item.extra);

  const renderItems = (list: ChecklistItem[]) => (
    <ul className="space-y-2">
      {list.map((item) => {
        const checked = ticked.includes(item.key);
        const inputId = `${groupId}-${item.key}`;
        return (
          <li key={item.key}>
            <label
              htmlFor={inputId}
              className={cn(
                'flex min-h-[52px] cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-base transition focus-within:ring-2 focus-within:ring-ring',
                checked ? 'border-sage bg-mint text-pine-dark' : 'border-border bg-white text-charcoal'
              )}
            >
              <input
                id={inputId}
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(item.key)}
                className="mt-0.5 h-6 w-6 shrink-0 accent-[#174D3A] focus-visible:outline-none"
              />
              <span className={checked ? 'line-through decoration-sage' : undefined}>{item.label}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-grey">{t.checklistHint}</p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-cream" aria-hidden="true">
          <div
            className="h-full rounded-full bg-pine transition-all"
            style={{ width: items.length ? `${(done / items.length) * 100}%` : '0%' }}
          />
        </div>
        <p className="mt-1 text-sm font-medium text-pine-dark" aria-live="polite" aria-atomic="true">
          {t.checklistProgress(done, items.length)}
        </p>
      </div>
      {tasks.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-pine-dark">{t.checklistTasks}</legend>
          {renderItems(tasks)}
        </fieldset>
      )}
      {extras.length > 0 && (
        <fieldset>
          <legend className="mb-2 flex items-center gap-2 text-sm font-semibold text-pine-dark">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t.checklistExtras}
          </legend>
          {renderItems(extras)}
        </fieldset>
      )}
    </div>
  );
}

function IssueDialog({
  open,
  onOpenChange,
  jobId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onDone: () => void;
}) {
  const [type, setType] = useState<IssueType | ''>('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<{ type?: string; message?: string }>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const msgId = useId();
  const typeName = useId();
  const t = useMessages(messages).issueDialog;
  const errorText = useErrorText();

  const reset = () => {
    setType('');
    setMessage('');
    setErrors({});
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const next: typeof errors = {};
    if (!type) next.type = t.errType;
    if (message.trim().length < 5) next.message = t.errMessage;
    setErrors(next);
    if (Object.keys(next).length || !type) return;

    setPending(true);
    setError(null);
    try {
      await api.post(`/worker/jobs/${jobId}/report-issue`, { type, message: message.trim() });
      toast.success(t.success);
      onOpenChange(false);
      reset();
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <fieldset aria-describedby={errors.type ? `${typeName}-err` : undefined}>
            <legend className="mb-2 text-sm font-medium">{t.typeLegend}</legend>
            <div className="grid gap-2">
              {ISSUE_TYPES.map((value) => (
                <label
                  key={value}
                  className={cn(
                    'flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-4 text-base transition focus-within:ring-2 focus-within:ring-ring',
                    type === value ? 'border-pine bg-mint text-pine-dark' : 'border-border bg-white'
                  )}
                >
                  <input
                    type="radio"
                    name={typeName}
                    value={value}
                    checked={type === value}
                    onChange={() => setType(value)}
                    disabled={pending}
                    className="h-4 w-4 accent-[#174D3A]"
                  />
                  {t.types[value]}
                </label>
              ))}
            </div>
            {errors.type && (
              <p id={`${typeName}-err`} className="mt-1 text-sm text-red-700">
                {errors.type}
              </p>
            )}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor={msgId}>{t.message}</Label>
            <Textarea
              id={msgId}
              rows={4}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={pending}
              aria-invalid={Boolean(errors.message)}
              aria-describedby={errors.message ? `${msgId}-err` : undefined}
              className="text-base"
            />
            {errors.message && (
              <p id={`${msgId}-err`} className="text-sm text-red-700">
                {errors.message}
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={pending}>
              {t.cancel}
            </Button>
            <Button type="submit" variant="destructive" className="h-12 text-base" disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <AlertTriangle className="mr-2 h-5 w-5" aria-hidden="true" />}
              {t.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Prominent "collect cash" card for cash jobs (from acceptance on); after collection "Bar kassiert: X €" */
function CashCard({ cash }: { cash: NonNullable<WorkerJobWithSlot['cash']> }) {
  const t = useMessages(cashMessages).card;
  const f = useFormat();
  if (cash.collected) {
    return (
      <p className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base font-semibold text-amber-900">
        <Banknote className="h-6 w-6 shrink-0" aria-hidden="true" />
        {t.collected(f.euro(cash.collectedCents ?? cash.amountCents))}
      </p>
    );
  }
  return (
    <section
      aria-labelledby="job-cash"
      className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900">
          <Banknote className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="job-cash" className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            {t.title}
          </h2>
          <p className="mt-0.5 text-lg font-bold leading-snug">{t.collect(f.euro(cash.amountCents))}</p>
          <p className="mt-1 text-sm text-amber-900">{t.hint}</p>
        </div>
      </div>
    </section>
  );
}

/** Pay − cash kept = net payout for one job */
function PayBreakdown({ payout }: { payout: NonNullable<WorkerJobWithSlot['workerPayout']> }) {
  const t = useMessages(cashMessages).pay;
  const f = useFormat();
  const cash = payout.cashHeldCents ?? 0;
  const net = payout.amountCents - cash;
  if (cash <= 0) {
    return (
      <div>
        <p className="text-2xl font-bold text-pine-dark">{f.euro(payout.amountCents)}</p>
        <p className="text-sm text-muted-grey">
          {f.hours(payout.minutes)} × {f.euro(payout.rateCents)}
        </p>
      </div>
    );
  }
  return (
    <div className="w-full space-y-3">
      <dl className="space-y-1.5 text-base">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-charcoal">
            {t.gross}
            <span className="block text-xs text-muted-grey">
              {f.hours(payout.minutes)} × {f.euro(payout.rateCents)}
            </span>
          </dt>
          <dd className="font-semibold text-charcoal">{f.euro(payout.amountCents)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-charcoal">− {t.cashKept}</dt>
          <dd className="font-semibold text-amber-800">− {f.euro(cash)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5">
          <dt className="font-semibold text-pine-dark">= {t.net}</dt>
          <dd className={cn('text-xl font-bold', net < 0 ? 'text-red-700' : 'text-pine-dark')}>
            {net < 0 ? t.owed(f.euro(-net)) : f.euro(net)}
          </dd>
        </div>
      </dl>
      {net < 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t.negative}
        </p>
      )}
    </div>
  );
}

function JobDetail({ id }: { id: string }) {
  const { data, error, errorStatus, reload } = useApi<{ job: WorkerJobWithSlot }>(`/worker/jobs/${id}`);
  const t = useMessages(messages).job;
  const p = useMessages(portalMessages).jobExtra;
  const c = useMessages(common);
  const cat = useMessages(catalogue);
  const f = useFormat();
  const jobTime = useJobTime();
  const cm = useMessages(cashMessages);
  const router = useRouter();
  const errorText = useErrorText();
  const [action, setAction] = useState<'onTheWay' | 'start' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionRef = useRef(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const auto = isAutoMode(useWorkerOverview().data);
  const [issueOpen, setIssueOpen] = useState(false);
  const [feedbackItem, setFeedbackItem] = useState<FeedbackPendingItem | null>(null);

  // Checklist progress lives in sessionStorage per job
  const [ticked, setTicked] = useState<string[]>([]);
  const [checklistLoaded, setChecklistLoaded] = useState(false);
  useEffect(() => {
    setTicked(loadChecklist(id));
    setChecklistLoaded(true);
  }, [id]);
  useEffect(() => {
    if (checklistLoaded) saveChecklist(id, ticked);
  }, [id, ticked, checklistLoaded]);
  const toggle = (key: string) =>
    setTicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const back = (
    <Link
      href="/worker"
      className="mb-4 inline-flex min-h-[44px] items-center gap-2 rounded-md text-sm font-medium text-muted-grey hover:text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t.allJobs}
    </Link>
  );

  if (error && !data) {
    return (
      <>
        {back}
        <ErrorState message={error} onRetry={errorStatus === 404 || errorStatus === 400 ? undefined : reload} />
      </>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4" role="status" aria-label={t.loading}>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  const job = data.job;
  const customer = job.customerDetails;
  const serviceText = cat.services[job.serviceId];
  const serviceName = c.services[job.serviceId] ?? job.serviceId;
  const conditionLabel = c.conditions[job.condition]?.label ?? job.condition;
  const extraText = cat.extras as Record<string, { label: string; description: string } | undefined>;

  const day = calendarDay(job.preferredDate);
  const todayDay = berlinToday();
  const isToday = day === todayDay;
  const isFuture = day > todayDay;
  const onTheWayAt = job.job?.onTheWayAt;
  const releasable = job.status === 'confirmed' && isFuture && canReleaseNow(job.preferredDate, job.slot);

  const checklistItems: ChecklistItem[] = [
    ...(serviceText?.included ?? []).map((label, i) => ({ key: `task-${i}`, label, extra: false })),
    ...(job.estimate?.extras ?? []).map((x) => ({ key: x.id, label: extraText[x.id]?.label ?? x.label, extra: true })),
  ];

  const post = async (kind: 'onTheWay' | 'start') => {
    if (actionRef.current) return;
    actionRef.current = true;
    setAction(kind);
    setActionError(null);
    try {
      if (kind === 'onTheWay') {
        await api.post(`/worker/jobs/${job._id}/on-the-way`);
        toast.success(t.onTheWaySuccess);
      } else {
        await api.post(`/worker/jobs/${job._id}/start`);
        toast.success(t.started);
      }
      reload();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      actionRef.current = false;
      setAction(null);
    }
  };

  const needsLateConfirm = Boolean(job.confirmation?.needed || (job.job as { notHappened?: { decision?: string } } | undefined)?.notHappened?.decision === 'pending');
  const canReport = job.status === 'confirmed' || job.status === 'in_progress' || job.status === 'completed';
  const showSteps = job.status === 'confirmed' || job.status === 'in_progress' || job.status === 'completed';

  const startButton = (primary: boolean) => (
    <Button
      type="button"
      variant={primary ? 'default' : 'outline'}
      onClick={() => post('start')}
      disabled={action !== null}
      className={cn('w-full', primary ? 'h-14 text-lg' : 'h-12 text-base')}
    >
      {action === 'start' ? (
        <Loader2 className={cn('mr-2 animate-spin', primary ? 'h-6 w-6' : 'h-5 w-5')} aria-hidden="true" />
      ) : (
        <Play className={cn('mr-2', primary ? 'h-6 w-6' : 'h-5 w-5')} aria-hidden="true" />
      )}
      {t.start}
    </Button>
  );

  const startedMs = job.job?.startedAt ? new Date(job.job.startedAt).getTime() : null;
  const completedMs = job.job?.completedAt ? new Date(job.job.completedAt).getTime() : null;
  const minutesOnSite =
    startedMs && completedMs && completedMs > startedMs ? Math.round((completedMs - startedMs) / 60000) : null;
  const checklistDone = job.job?.checklistDone ?? [];

  const todoSection = (
    <Section title={job.status === 'in_progress' ? t.checklist : t.todo} icon={ListChecks} id="job-todo">
      {job.status === 'in_progress' ? (
        <Checklist items={checklistItems} ticked={ticked} onToggle={toggle} />
      ) : (
        <>
          {serviceText && (
            <ul className="space-y-2">
              {serviceText.included.map((task) => (
                <li key={task} className="flex items-start gap-3 text-base text-charcoal">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sage" aria-hidden="true" />
                  {task}
                </li>
              ))}
            </ul>
          )}

          {job.estimate?.extras?.length ? (
            <div className="mt-5">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-pine-dark">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t.extras}
              </h3>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {job.estimate.extras.map((x) => {
                  const extra = extraText[x.id];
                  return (
                    <li key={x.id} className="flex items-start justify-between gap-3 px-4 py-3 text-base">
                      <span className="min-w-0">
                        <span className="block text-charcoal">{extra?.label ?? x.label}</span>
                        {extra?.description && <span className="block text-sm text-muted-grey">{extra.description}</span>}
                      </span>
                      <span className="whitespace-nowrap text-sm text-muted-grey">{t.approxMinutes(x.minutes)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {serviceText?.excluded?.length ? (
        <details className="mt-5 rounded-xl border border-border">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-sm font-semibold text-pine-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t.notIncluded}
          </summary>
          <ul className="space-y-1.5 border-t border-border px-4 py-3">
            {serviceText.excluded.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-charcoal">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-grey" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="mt-4 rounded-xl bg-cream px-4 py-3 text-sm text-charcoal">
        {t.totalDuration} <strong>{f.hours(job.estimate?.durationMinutes)}</strong>
      </p>
    </Section>
  );

  return (
    <div className="space-y-4 pb-4">
      {back}

      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-pine-dark">{serviceName}</h1>
            <p className="font-mono text-xs text-muted-grey">{job.reference}</p>
          </div>
          <JobStatusBadge status={job.status} />
        </div>
        <ul className="mt-4 space-y-2 text-base text-charcoal">
          <li className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 shrink-0 text-pine" aria-hidden="true" />
            {f.dateLong(job.preferredDate)}
          </li>
          <li className="flex items-center gap-3">
            <Clock className="h-5 w-5 shrink-0 text-pine" aria-hidden="true" />
            {jobTime(job.slot, job.slotEnd, job.estimate?.durationMinutes)}
          </li>
          <li className="flex items-center gap-3">
            <ListChecks className="h-5 w-5 shrink-0 text-pine" aria-hidden="true" />
            {t.approxSummary(f.hours(job.estimate?.durationMinutes), job.areaM2, conditionLabel)}
          </li>
        </ul>
      </div>

      {job.pets && (
        <p className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          <PawPrint className="h-5 w-5 shrink-0" aria-hidden="true" />
          {p.pets}
        </p>
      )}

      {job.cash && job.status !== 'cancelled' && <CashCard cash={job.cash} />}

      {showSteps && <StepList job={job} />}

      {/* Past job not confirmed on the day: late confirmation / did not happen */}
      {needsLateConfirm && (
        <ConfirmLatePanel
          job={job}
          onDone={(item) => {
            reload();
            if (item) setFeedbackItem(item);
          }}
        />
      )}

      {/* Actions by state – one primary button at a time */}
      {job.status === 'confirmed' && isToday && !onTheWayAt && (
        <div className="space-y-2">
          <Button type="button" onClick={() => post('onTheWay')} disabled={action !== null} className="h-14 w-full text-lg">
            {action === 'onTheWay' ? (
              <Loader2 className="mr-2 h-6 w-6 animate-spin" aria-hidden="true" />
            ) : (
              <Car className="mr-2 h-6 w-6" aria-hidden="true" />
            )}
            {t.onTheWay}
          </Button>
          <p className="flex items-start gap-2 px-1 text-sm text-muted-grey">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t.onTheWayHint}
          </p>
          {startButton(false)}
        </div>
      )}
      {job.status === 'confirmed' && isToday && onTheWayAt && (
        <div className="space-y-2">
          <p role="status" className="flex items-start gap-2 rounded-2xl border border-sage bg-mint p-4 text-sm text-pine-dark">
            <Car className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            {t.onTheWaySince(f.dateTime(onTheWayAt))}
          </p>
          {startButton(true)}
        </div>
      )}
      {/* Same day, before the start: "I can't make it" stays possible (auto mode) */}
      {auto && job.status === 'confirmed' && isToday && job.canReportEmergency && (
        <EmergencyPanel jobId={job._id} noStrikeHours={job.emergencyNoStrikeHours ?? 24} onDone={() => router.push('/worker')} />
      )}
      {job.status === 'confirmed' && !isToday && (
        <div className="space-y-3">
          {isFuture && (
            <p className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              {t.startOn(f.dateLong(job.preferredDate))}
            </p>
          )}
          {auto ? (
            job.canReportEmergency && <EmergencyPanel jobId={job._id} noStrikeHours={job.emergencyNoStrikeHours ?? 24} onDone={() => router.push('/worker')} />
          ) : releasable ? (
            <div className="space-y-1">
              <Button type="button" variant="outline" onClick={() => setReleaseOpen(true)} className="h-12 w-full text-base">
                <Undo2 className="mr-2 h-5 w-5" aria-hidden="true" />
                {t.release}
              </Button>
              <p className="px-1 text-xs text-muted-grey">{t.releaseHint(RELEASE_CUTOFF_HOURS)}</p>
            </div>
          ) : (
            isFuture && (
              <p className="flex items-start gap-2 rounded-xl border border-border bg-cream px-4 py-3 text-sm text-charcoal">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
                {t.releaseTooLate(RELEASE_CUTOFF_HOURS)}
              </p>
            )
          )}
        </div>
      )}
      {actionError && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {actionError}
        </p>
      )}

      {job.status === 'in_progress' && !needsLateConfirm && (
        <>
          {todoSection}
          <ExtraTimePanel jobId={job._id} inProgress requests={job.extraTimeRequests ?? []} onChange={reload} />
          <Button type="button" onClick={() => setCompleteOpen(true)} className="h-14 w-full text-lg">
            <CheckCircle2 className="mr-2 h-6 w-6" aria-hidden="true" />
            {t.complete}
          </Button>
        </>
      )}

      {job.status === 'completed' && (
        <>
          {(job.extraTimeRequests?.length ?? 0) > 0 && (
            <ExtraTimePanel jobId={job._id} inProgress={false} requests={job.extraTimeRequests ?? []} onChange={reload} />
          )}
          <div role="status" className="flex items-center gap-3 rounded-2xl border border-sage bg-mint p-4 text-pine-dark">
            <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden="true" />
            <span className="font-semibold">{t.doneBanner}</span>
          </div>
          <Section title={t.summaryTitle} icon={StickyNote} id="job-summary">
            <ul className="space-y-1.5 text-base text-charcoal">
              {job.job?.startedAt && <li>{t.startedAt(f.dateTime(job.job.startedAt))}</li>}
              {job.job?.completedAt && <li>{t.completedAt(f.dateTime(job.job.completedAt))}</li>}
              {minutesOnSite !== null && <li>{t.summaryDuration(f.hours(minutesOnSite))}</li>}
              {job.cash?.collected && (
                <li className="flex items-center gap-2 font-semibold text-amber-900">
                  <Banknote className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {cm.card.collected(f.euro(job.cash.collectedCents ?? job.cash.amountCents))}
                </li>
              )}
              {checklistItems.length > 0 && (
                <li>{t.summaryChecklist(Math.min(checklistDone.length, checklistItems.length), checklistItems.length)}</li>
              )}
            </ul>
            {job.job?.workerNote && (
              <div className="mt-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.completionNote}</h3>
                <p className="mt-1 whitespace-pre-line text-base text-charcoal">{job.job.workerNote}</p>
              </div>
            )}
          </Section>
          {job.workerPayout && (
            <Section title={p.earnedTitle} icon={Wallet} id="job-earnings">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <PayBreakdown payout={job.workerPayout} />
                <PayoutStatusBadge
                  status={payoutDisplayStatus(job.workerPayout)}
                  dueAt={job.workerPayout.dueAt}
                  paidAt={job.workerPayout.paidAt}
                />
              </div>
              <Link
                href="/worker/verdienst"
                className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-pine hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {p.toEarnings}
              </Link>
            </Section>
          )}
        </>
      )}
      {job.status === 'accepted' && (
        <p className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">{t.notConfirmed}</p>
      )}
      {job.status === 'cancelled' && (
        <p role="status" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {t.cancelledBanner}
        </p>
      )}

      <Section title={t.address} icon={MapPin} id="job-address">
        <p className="text-base font-medium text-charcoal">{customer.name}</p>
        <p className="text-base text-charcoal">
          {customer.address}, {customer.postcode} Berlin
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button asChild variant="outline" className="h-12 text-base">
            <a href={mapsUrl(customer.address, customer.postcode)} target="_blank" rel="noopener noreferrer">
              <Navigation className="mr-2 h-5 w-5" aria-hidden="true" />
              {t.route}
              <span className="sr-only">{t.newWindow}</span>
            </a>
          </Button>
          <Button asChild variant="outline" className="h-12 text-base">
            <a href={`tel:${customer.phone}`} aria-label={t.call(customer.phone)}>
              <Phone className="mr-2 h-5 w-5" aria-hidden="true" />
              {customer.phone}
            </a>
          </Button>
        </div>
      </Section>

      {(customer.accessNotes || job.notes) && (
        <Section title={t.notes} icon={KeyRound} id="job-notes">
          {customer.accessNotes && (
            <div className="mb-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.access}</h3>
              <p className="mt-1 whitespace-pre-line text-base text-charcoal">{customer.accessNotes}</p>
            </div>
          )}
          {job.notes && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.customerNotes}</h3>
              <p className="mt-1 whitespace-pre-line text-base text-charcoal">{job.notes}</p>
            </div>
          )}
        </Section>
      )}

      {job.status !== 'in_progress' && todoSection}

      {((job.job?.workerNote && job.status !== 'completed') || job.job?.issueReported) && (
        <Section title={t.yourReports} icon={StickyNote} id="job-reports">
          {job.job?.workerNote && job.status !== 'completed' && (
            <div className="mb-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.completionNote}</h3>
              <p className="mt-1 whitespace-pre-line text-base text-charcoal">{job.job.workerNote}</p>
            </div>
          )}
          {job.job?.issueReported && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.reportedIssues}</h3>
              <p className="mt-1 whitespace-pre-line break-words text-sm text-red-800">{job.job.issueReported}</p>
            </div>
          )}
        </Section>
      )}

      {job.status !== 'cancelled' && (
        <MessageThread path={`/worker/jobs/${job._id}/messages`} viewer="worker" />
      )}

      {canReport && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setIssueOpen(true)}
          className="h-12 w-full border-red-200 text-base text-red-700 hover:bg-red-50 hover:text-red-800"
        >
          <AlertTriangle className="mr-2 h-5 w-5" aria-hidden="true" />
          {t.reportIssue}
        </Button>
      )}

      <CompleteDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        jobId={job._id}
        items={checklistItems}
        ticked={ticked}
        cashDueCents={job.cash && !job.cash.collected ? job.cash.amountCents : null}
        onDone={() => {
          setTicked([]);
          reload();
          // Completion → internal feedback pop-up right away
          setFeedbackItem({ bookingId: job._id, reference: job.reference, serviceId: job.serviceId, preferredDate: job.preferredDate, completedAt: null });
        }}
      />
      <WorkerFeedbackDialog item={feedbackItem} onClose={() => setFeedbackItem(null)} />
      <ReleaseDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        jobId={job._id}
        onDone={() => {
          setTicked([]);
          router.push('/worker');
        }}
      />
      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} jobId={job._id} onDone={reload} />
    </div>
  );
}

export default function WorkerJobPage({ params }: { params: { id: string } }) {
  return (
    <RequireRole roles={['worker']}>
      <JobDetail id={params.id} />
    </RequireRole>
  );
}
