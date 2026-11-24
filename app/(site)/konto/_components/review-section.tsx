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
import { StarDisplay, StarInput } from '@/componets/site/star-rating';
import { Textarea } from '@/componets/ui/tesxtarea';
import { ErrorBox, FieldError, textareaClass } from '../../buchung/_components/form-field';
import feedbackMessages from './feedback-messages';

const MAX_COMMENT = 1000;
type Detail = 'punctuality' | 'quality' | 'friendliness';
const DETAILS: Detail[] = ['punctuality', 'quality', 'friendliness'];

export function ReviewSection({
  bookingId,
  cleanerName,
  review,
  canReview,
  onSaved,
}: {
  bookingId: string;
  cleanerName: string;
  review: CustomerReview | null;
  canReview: boolean;
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

function ReviewForm({ bookingId, cleanerName, onSaved }: { bookingId: string; cleanerName: string; onSaved: (review: CustomerReview) => void }) {
  const t = useMessages(feedbackMessages).review;
  const tp = useMessages(profileMessages);
  const { locale } = useLocale();
  const [rating, setRating] = useState(0);
  const [details, setDetails] = useState<Record<Detail, number>>({ punctuality: 0, quality: 0, friendliness: 0 });
  const [comment, setComment] = useState('');
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
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { rating, comment: comment.trim() };
      DETAILS.forEach((d) => {
        if (details[d] > 0) body[d] = details[d];
      });
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
