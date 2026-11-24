'use client';

// Review of a completed booking (#bewertung – review emails link here).
import { useRef, useState } from 'react';
import { CircleCheck, LoaderCircle, Star } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import profileMessages from '@/lib/i18n/messages/profile';
import type { CustomerReview } from '@/lib/types';
import { cn } from '@/lib/utils';
import { StarDisplay, StarInput } from '@/componets/site/star-rating';
import { StructuredFeedbackFields, emptyStructured, structuredPayload, type StructuredFeedback } from './account-prompts';
import { Textarea } from '@/componets/ui/tesxtarea';
import { ErrorBox, FieldError, inputClass, textareaClass } from '../../buchung/_components/form-field';
import feedbackMessages from './feedback-messages';

const MAX_COMMENT = 1000;
type Detail = 'punctuality' | 'quality' | 'friendliness';
const DETAILS: Detail[] = ['punctuality', 'quality', 'friendliness'];

export function ReviewSection({
  bookingId,
  cleanerName,
  review,
  canReview,
  plannedDurationMinutes,
  recurring,
  cash,
  onSaved,
}: {
  bookingId: string;
  cleanerName: string;
  review: CustomerReview | null;
  canReview: boolean;
  /** Booked duration – prefill for "how long did it actually take?" */
  plannedDurationMinutes?: number | null;
  /** Recurring booking → ask who should clean next time */
  recurring?: boolean;
  /** Cash booking: amount the cleaner reported (null = not recorded yet) */
  cash?: { reportedCents: number | null } | null;
  onSaved: (review: CustomerReview) => void;
}) {
  const t = useMessages(feedbackMessages).review;
  const [justSaved, setJustSaved] = useState(false);

  if (!review && !canReview) return null;

  return (
    <section id="bewertung" aria-labelledby="review-title" className="scroll-mt-28 rounded-2xl border border-border bg-white p-5 sm:p-6">
      <h2 id="review-title" className="m-0 flex items-center gap-2 text-lg font-bold tracking-tight text-pine-dark">
        <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true" /> {t.title}
      </h2>
      {review ? (
        <>
          {justSaved && (
            <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-sage bg-mint p-4 text-sm text-pine-dark">
              <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="m-0 font-bold">{t.thanksTitle}</p>
                <p className="m-0 mt-1">{t.thanksText}</p>
              </div>
            </div>
          )}
          <SavedReview review={review} />
        </>
      ) : (
        <ReviewForm
          bookingId={bookingId}
          cleanerName={cleanerName}
          plannedDurationMinutes={plannedDurationMinutes ?? null}
          recurring={Boolean(recurring)}
          cash={cash ?? null}
          onSaved={(r) => {
            setJustSaved(true);
            onSaved(r);
          }}
        />
      )}
    </section>
  );
}

function SavedReview({ review }: { review: CustomerReview }) {
  const t = useMessages(feedbackMessages).review;
  const tp = useMessages(profileMessages);
  const f = useFormat();
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <StarDisplay value={review.rating} size={22} />
        <span className="text-sm font-bold text-pine-dark">{review.rating}/5</span>
        {review.createdAt && <span className="text-xs text-muted-grey">{t.savedAt(f.dateTime(review.createdAt))}</span>}
      </div>
      {DETAILS.some((d) => review[d]) && (
        <dl className="m-0 mt-3 grid gap-2 sm:grid-cols-3">
          {DETAILS.map((d) =>
            review[d] ? (
              <div key={d} className="rounded-xl bg-cream px-3 py-2">
                <dt className="text-xs font-bold text-muted-grey">{tp[d]}</dt>
                <dd className="m-0 mt-1">
                  <StarDisplay value={review[d] as number} size={14} />
                </dd>
              </div>
            ) : null
          )}
        </dl>
      )}
      {review.comment && <p className="mb-0 mt-3 whitespace-pre-line rounded-xl border border-border p-3 text-sm text-charcoal">{review.comment}</p>}
    </div>
  );
}

type KeepCleaner = 'same' | 'different' | 'auto';
const KEEP_OPTIONS: KeepCleaner[] = ['same', 'different', 'auto'];
const MIN_ACTUAL_MINUTES = 15;
const MAX_ACTUAL_MINUTES = 1440;

function ReviewForm({
  bookingId,
  cleanerName,
  plannedDurationMinutes,
  recurring,
  cash,
  onSaved,
}: {
  bookingId: string;
  cleanerName: string;
  plannedDurationMinutes: number | null;
  recurring: boolean;
  cash: { reportedCents: number | null } | null;
  onSaved: (review: CustomerReview) => void;
}) {
  const t = useMessages(feedbackMessages).review;
  const tp = useMessages(profileMessages);
  const { locale } = useLocale();
  const f = useFormat();
  const [rating, setRating] = useState(0);
  const [details, setDetails] = useState<Record<Detail, number>>({ punctuality: 0, quality: 0, friendliness: 0 });
  const [comment, setComment] = useState('');
  // Optional follow-up questions (actual duration prefilled with the plan)
  const [durH, setDurH] = useState(() => (plannedDurationMinutes != null ? String(Math.floor(plannedDurationMinutes / 60)) : ''));
  const [durM, setDurM] = useState(() => (plannedDurationMinutes != null ? String(plannedDurationMinutes % 60) : ''));
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [structured, setStructured] = useState<StructuredFeedback>(emptyStructured);
  // Cash bookings: confirm the amount handed over (prefilled with the cleaner's report)
  const [cashAmount, setCashAmount] = useState(() => (cash?.reportedCents != null ? (cash.reportedCents / 100).toFixed(2).replace('.', ',') : ''));
  const [keepCleaner, setKeepCleaner] = useState<KeepCleaner | ''>('');
  const [ratingError, setRatingError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    if (rating < 1) {
      setRatingError(true);
      document.getElementById('review-overall')?.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    if (comment.trim().length > MAX_COMMENT) {
      setError(t.tooLong);
      return;
    }
    // Optional actual duration – validated only when the customer filled it in
    let actualDurationMinutes: number | null = null;
    if (durH.trim() !== '' || durM.trim() !== '') {
      const h = Number(durH.trim() || 0);
      const m = Number(durM.trim() || 0);
      const total = h * 60 + m;
      if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59 || total < MIN_ACTUAL_MINUTES || total > MAX_ACTUAL_MINUTES) {
        setError(t.durationInvalid);
        document.getElementById('review-duration-hours')?.focus();
        return;
      }
      actualDurationMinutes = total;
    }
    // Cash bookings: optional confirmation of the amount handed over
    let actualCashCents: number | null = null;
    if (cash && cashAmount.trim() !== '') {
      const normalized = cashAmount.trim().replace(/\s/g, '').replace(',', '.');
      const euros = /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : NaN;
      if (!Number.isFinite(euros) || euros < 0 || euros > 10000) {
        setError(t.cashInvalid);
        document.getElementById('review-cash')?.focus();
        return;
      }
      actualCashCents = Math.round(euros * 100);
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { rating, comment: comment.trim() };
      DETAILS.forEach((d) => {
        if (details[d] > 0) body[d] = details[d];
      });
      if (actualDurationMinutes != null) body.actualDurationMinutes = actualDurationMinutes;
      if (recommend != null) body.recommend = recommend;
      if (actualCashCents != null) body.actualCashCents = actualCashCents;
      if (recurring && keepCleaner) body.keepCleaner = keepCleaner;
      Object.assign(body, structuredPayload(structured));
      const res = await api.post<{ review?: CustomerReview; message?: string }>(`/customer/bookings/${encodeURIComponent(bookingId)}/review`, body);
      const saved: CustomerReview = res.review ?? {
        rating,
        ...Object.fromEntries(DETAILS.filter((d) => details[d] > 0).map((d) => [d, details[d]])),
        comment: comment.trim(),
        createdAt: new Date().toISOString(),
      };
      toast.success(t.thanksTitle);
      onSaved(saved);
    } catch (e) {
      setError(translateApiError(e, locale));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-2 grid gap-5">
      <p className="m-0 text-sm leading-relaxed text-muted-grey">{t.intro(cleanerName)}</p>

      <div id="review-overall" aria-describedby={ratingError ? 'review-rating-error' : undefined}>
        <StarInput
          name="review-rating"
          label={t.overall}
          value={rating}
          size={36}
          onChange={(v) => {
            setRating(v);
            setRatingError(false);
          }}
        />
        {ratingError && (
          <div className="mt-2">
            <FieldError id="review-rating-error">{t.ratingRequired}</FieldError>
          </div>
        )}
      </div>

      <fieldset className="m-0 min-w-0 border-0 border-t border-border p-0 pt-4">
        <legend className="sr-only">{t.detailsLegend}</legend>
        <p className="mb-3 mt-0 text-sm font-bold text-pine-dark" aria-hidden="true">
          {t.detailsLegend}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {DETAILS.map((d) => (
            <StarInput
              key={d}
              name={`review-${d}`}
              label={tp[d]}
              value={details[d]}
              size={24}
              onChange={(v) => setDetails((prev) => ({ ...prev, [d]: v }))}
            />
          ))}
        </div>
      </fieldset>

      {/* Follow-up questions (all optional, sent with the same review POST) */}
      <fieldset className="m-0 min-w-0 border-0 border-t border-border p-0 pt-4">
        <legend className="sr-only">{t.moreLegend}</legend>
        <p className="mb-3 mt-0 text-sm font-bold text-pine-dark" aria-hidden="true">
          {t.moreLegend}
        </p>
        <div className="grid gap-5">
          <div className="grid gap-1.5">
            <span id="review-duration-label" className="text-sm font-semibold text-charcoal">
              {t.durationQuestion}
            </span>
            <div role="group" aria-labelledby="review-duration-label" className="flex flex-wrap items-center gap-2">
              <input
                id="review-duration-hours"
                type="number"
                inputMode="numeric"
                min={0}
                max={24}
                step={1}
                value={durH}
                onChange={(e) => setDurH(e.target.value)}
                aria-label={t.durationHours}
                className={cn(inputClass, 'w-20 border px-3 text-center')}
              />
              <span className="text-sm text-muted-grey">{t.durationHours}</span>
              <input
                id="review-duration-minutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                step={5}
                value={durM}
                onChange={(e) => setDurM(e.target.value)}
                aria-label={t.durationMinutes}
                className={cn(inputClass, 'w-20 border px-3 text-center')}
              />
              <span className="text-sm text-muted-grey">{t.durationMinutes}</span>
            </div>
            {plannedDurationMinutes != null && <p className="m-0 text-xs text-muted-grey">{t.durationPlanned(f.hours(plannedDurationMinutes))}</p>}
          </div>

          <StructuredFeedbackFields value={structured} onChange={setStructured} idPrefix="review" />

          <div className="grid gap-1.5">
            <span id="review-recommend-label" className="text-sm font-semibold text-charcoal">
              {t.recommendQuestion}
            </span>
            <div role="group" aria-labelledby="review-recommend-label" className="flex gap-2">
              {([true, false] as const).map((value) => {
                const active = recommend === value;
                return (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRecommend(active ? null : value)}
                    className={cn(
                      'min-h-[44px] rounded-full border px-5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine',
                      active ? 'border-pine bg-pine text-white' : 'border-border bg-white text-pine-dark hover:border-sage hover:bg-mint'
                    )}
                  >
                    {value ? t.yes : t.no}
                  </button>
                );
              })}
            </div>
          </div>

          {cash && (
            <div className="grid gap-1.5">
              <label htmlFor="review-cash" className="text-sm font-semibold text-charcoal">
                {t.cashQuestion}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="review-cash"
                  type="text"
                  inputMode="decimal"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className={cn(inputClass, 'w-32 border px-3 text-right tabular-nums')}
                  aria-describedby="review-cash-hint"
                />
                <span className="text-sm text-muted-grey">€</span>
              </div>
              <p id="review-cash-hint" className="m-0 text-xs text-muted-grey">
                {cash.reportedCents != null ? t.cashHint(f.euro(cash.reportedCents)) : t.cashHintNone}
              </p>
            </div>
          )}

          {recurring && (
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="p-0 text-sm font-semibold text-charcoal">{t.keepCleanerQuestion}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {KEEP_OPTIONS.map((value) => {
                  const checked = keepCleaner === value;
                  const label = value === 'same' ? t.keepSame : value === 'different' ? t.keepDifferent : t.keepAuto;
                  return (
                    <label
                      key={value}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-[12px] border p-3 text-sm transition-colors',
                        checked ? 'border-pine bg-mint font-semibold text-pine-dark' : 'border-border bg-white text-charcoal hover:border-sage'
                      )}
                    >
                      <input
                        type="radio"
                        name="review-keep-cleaner"
                        value={value}
                        checked={checked}
                        onChange={() => setKeepCleaner(value)}
                        className="h-4 w-4 shrink-0 accent-pine"
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <label htmlFor="review-comment" className="text-sm font-bold text-pine-dark">
          {t.comment} <span className="font-normal text-muted-grey">{t.optional}</span>
        </label>
        <Textarea
          id="review-comment"
          rows={4}
          maxLength={MAX_COMMENT}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t.commentPlaceholder}
          className={textareaClass}
          aria-describedby="review-comment-count review-public-note"
        />
        <div className="flex justify-between gap-3 text-xs text-muted-grey">
          <span id="review-public-note">{t.publicNote}</span>
          <span id="review-comment-count" className="shrink-0 tabular-nums">
            {t.counter(comment.length, MAX_COMMENT)}
          </span>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      <button type="submit" disabled={busy} className="button w-full justify-center disabled:cursor-wait disabled:opacity-70 sm:w-auto">
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {busy ? t.sending : t.submit}
      </button>
    </form>
  );
}
