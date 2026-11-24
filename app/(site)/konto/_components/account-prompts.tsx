'use client';

// Account-wide prompts shown on every visit to /konto:
//  · post-service feedback pop-up (until submitted or dismissed)
//  · banner when a cleaner asks for extra time on a running job
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import type { Booking, CustomerPriceAdjustment, PendingFeedback } from '@/lib/types';
import { cn } from '@/lib/utils';
import { StarInput } from '@/componets/site/star-rating';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/componets/ui/dialog';
import { ErrorBox } from '../../buchung/_components/form-field';
import messages, { type IssueTag } from '../_service-messages';

export const ISSUE_TAGS: IssueTag[] = ['late', 'missed_areas', 'not_thorough', 'damage', 'communication', 'unfriendly', 'left_early', 'supplies', 'other'];

export type StructuredFeedback = {
  overallExperience: number;
  professionalPunctual: number;
  completedAsExpected: '' | 'yes' | 'partly' | 'no';
  issueTags: IssueTag[];
  issueText: string;
};
export const emptyStructured = (): StructuredFeedback => ({ overallExperience: 0, professionalPunctual: 0, completedAsExpected: '', issueTags: [], issueText: '' });

/** The structured questions (shared by the pop-up and the review form) */
export function StructuredFeedbackFields({ value, onChange, idPrefix }: { value: StructuredFeedback; onChange: (v: StructuredFeedback) => void; idPrefix: string }) {
  const t = useMessages(messages).feedback;
  const set = (patch: Partial<StructuredFeedback>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-4">
      <StarInput name={`${idPrefix}-overall`} label={t.overall} value={value.overallExperience} onChange={(n) => set({ overallExperience: n })} size={28} />
      <StarInput name={`${idPrefix}-professional`} label={t.professional} value={value.professionalPunctual} onChange={(n) => set({ professionalPunctual: n })} size={28} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-charcoal">{t.asExpected}</legend>
        <div className="flex flex-wrap gap-2">
          {(['yes', 'partly', 'no'] as const).map((o) => (
            <label key={o} className={cn('cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-semibold', value.completedAsExpected === o ? 'border-pine bg-mint text-pine-dark' : 'border-border bg-white text-charcoal')}>
              <input type="radio" name={`${idPrefix}-expected`} className="sr-only" checked={value.completedAsExpected === o} onChange={() => set({ completedAsExpected: o })} />
              {t.asExpectedOptions[o]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-charcoal">{t.unhappy}</legend>
        <div className="flex flex-wrap gap-2">
          {ISSUE_TAGS.map((tag) => {
            const on = value.issueTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => set({ issueTags: on ? value.issueTags.filter((x) => x !== tag) : [...value.issueTags, tag] })}
                className={cn('rounded-full border px-3 py-1 text-xs font-semibold', on ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-border bg-white text-muted-grey')}
              >
                {t.tags[tag]}
              </button>
            );
          })}
        </div>
        <label className="mt-2 block text-sm text-charcoal">
          <span className="sr-only">{t.issueText}</span>
          <textarea value={value.issueText} onChange={(e) => set({ issueText: e.target.value })} maxLength={1000} rows={2} placeholder={t.issueText} className="mt-1 w-full rounded-lg border border-border p-2 text-sm" />
        </label>
      </fieldset>
    </div>
  );
}

/** Structured answers → API fields (empty ones omitted) */
export const structuredPayload = (v: StructuredFeedback) => ({
  ...(v.overallExperience > 0 && { overallExperience: v.overallExperience }),
  ...(v.professionalPunctual > 0 && { professionalPunctual: v.professionalPunctual }),
  ...(v.completedAsExpected && { completedAsExpected: v.completedAsExpected }),
  ...(v.issueTags.length > 0 && { issueTags: v.issueTags }),
  ...(v.issueText.trim() && { issueText: v.issueText.trim() }),
});

function FeedbackModal({ item, onDone }: { item: PendingFeedback; onDone: () => void }) {
  const t = useMessages(messages).feedback;
  const { locale } = useLocale();
  const [rating, setRating] = useState(0);
  const [answers, setAnswers] = useState<StructuredFeedback>(emptyStructured);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dismiss = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/customer/bookings/${item.bookingId}/feedback/dismiss`);
    } catch {
      /* closing must never block the account */
    }
    setBusy(false);
    onDone();
  };

  const submit = async () => {
    if (!rating || !answers.overallExperience || !answers.professionalPunctual || !answers.completedAsExpected) {
      setError(t.required);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/customer/bookings/${item.bookingId}/review`, { rating, ...(comment.trim() && { comment: comment.trim() }), ...structuredPayload(answers) });
      toast.success(t.thanks);
      onDone();
    } catch (e) {
      setError(translateApiError(e, locale));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && dismiss()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle className="text-lg font-bold text-pine-dark">{t.title}</DialogTitle>
        <DialogDescription>{t.intro(item.reference, item.cleanerName ?? '')}</DialogDescription>
        <div className="mt-2 grid gap-4">
          <StarInput name="fb-cleaner" label={t.cleaner} value={rating} onChange={setRating} size={28} />
          <StructuredFeedbackFields value={answers} onChange={setAnswers} idPrefix="fb" />
          <label className="block text-sm font-medium text-charcoal">
            {t.comment}
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-border p-2 text-sm font-normal" />
          </label>
          {error && <ErrorBox message={error} />}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={dismiss} disabled={busy} className="button button-quiet button-small">
              {t.later}
            </button>
            <button type="button" onClick={submit} disabled={busy} className="button button-small">
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t.submit}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const pendingCleanerRequest = (b: Booking) =>
  ((b as Booking & { priceAdjustments?: CustomerPriceAdjustment[] }).priceAdjustments ?? []).some(
    (a) => a.origin === 'cleaner' && a.status === 'proposed' && (!a.expiresAt || new Date(a.expiresAt).getTime() > Date.now())
  );

export function AccountPrompts() {
  const t = useMessages(messages).extraTime;
  const pathname = usePathname() ?? '';
  const [pending, setPending] = useState<PendingFeedback[]>([]);
  const [extraTimeBooking, setExtraTimeBooking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [fb, list] = await Promise.all([
        api.get<{ pending: PendingFeedback[] }>('/customer/bookings/feedback/pending'),
        api.get<{ bookings: Booking[] }>('/bookings/my-bookings?scope=upcoming'),
      ]);
      setPending(fb.pending ?? []);
      setExtraTimeBooking(list.bookings?.find(pendingCleanerRequest)?._id ?? null);
    } catch {
      /* prompts are optional */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, pathname]);

  const onBookingPage = extraTimeBooking && pathname.startsWith(`/konto/buchungen/${extraTimeBooking}`);

  return (
    <>
      {extraTimeBooking && !onBookingPage && (
        <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <span className="flex items-center gap-2 font-semibold">
            <Clock className="h-4 w-4" aria-hidden="true" /> {t.banner}
          </span>
          <Link href={`/konto/buchungen/${extraTimeBooking}#preisanpassung`} className="button button-small">
            {t.bannerCta}
          </Link>
        </div>
      )}
      {pending[0] && <FeedbackModal key={pending[0].bookingId} item={pending[0]} onDone={() => setPending([])} />}
    </>
  );
}
