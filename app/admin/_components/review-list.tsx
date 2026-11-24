'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { toast } from 'sonner';

import { StarDisplay } from '@/componets/site/star-rating';
import { Button } from '@/componets/ui/button';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import profileMessages from '@/lib/i18n/messages/profile';
import type { AdminReview } from '@/lib/types';
import { cn } from '@/lib/utils';

import reviewMessages from '../bewertungen/_messages';
import { ConfirmAction } from './confirm-action';
import { useErrorText } from './use-api';

/** Cleaner dispute attached to a review (GET /admin/reviews) */
export interface ReviewDispute {
  status: 'open' | 'approved' | 'rejected';
  message: string;
  openedAt?: string;
  adminNote?: string;
}

export type DisputedAdminReview = AdminReview & { dispute?: ReviewDispute | null };

function HiddenToggle({ review, onChanged }: { review: DisputedAdminReview; onChanged: (review: DisputedAdminReview) => void }) {
  const t = useMessages(reviewMessages);
  const errorText = useErrorText();
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    setPending(true);
    try {
      const hidden = !review.hidden;
      await api.patch(`/admin/reviews/${review._id}`, { hidden });
      toast.success(hidden ? t.hiddenToast : t.shownToast);
      onChanged({ ...review, hidden });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Button type="button" size="sm" variant="outline" onClick={toggle} disabled={pending}>
      {pending ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
      ) : review.hidden ? (
        <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" />
      ) : (
        <EyeOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
      )}
      {review.hidden ? t.show : t.hide}
    </Button>
  );
}

function DisputeBadge({ status }: { status: ReviewDispute['status'] }) {
  const t = useMessages(reviewMessages);
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        status === 'open'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : status === 'approved'
            ? 'border-sage bg-mint text-pine'
            : 'border-border bg-cream text-charcoal'
      )}
    >
      {status === 'open' ? t.disputeOpenBadge : status === 'approved' ? t.disputeApprovedBadge : t.disputeRejectedBadge}
    </span>
  );
}

/** Cleaner dispute of a review: message + approve/reject while open, outcome afterwards */
function DisputeBlock({
  review,
  onChanged,
}: {
  review: DisputedAdminReview;
  onChanged: (review: DisputedAdminReview) => void;
}) {
  const t = useMessages(reviewMessages);
  const f = useFormat();
  const dispute = review.dispute;
  if (!dispute) return null;

  const resolve = (resolution: 'approved' | 'rejected') => async (note: string) => {
    await api.patch(`/admin/reviews/${review._id}/dispute`, { resolution, ...(note ? { note } : {}) });
    toast.success(resolution === 'approved' ? t.disputeApprovedToast : t.disputeRejectedToast);
    onChanged({
      ...review,
      hidden: resolution === 'approved' ? true : review.hidden,
      dispute: { ...dispute, status: resolution, adminNote: note || dispute.adminNote },
    });
  };

  return (
    <div
      className={cn(
        'mt-3 rounded-xl border p-3 text-sm',
        dispute.status === 'open' ? 'border-amber-200 bg-amber-50' : 'border-border bg-cream/50'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <DisputeBadge status={dispute.status} />
        {dispute.openedAt && <span className="text-xs text-muted-grey">{t.disputeOpenedAt(f.dateTime(dispute.openedAt))}</span>}
      </div>
      {dispute.message && (
        <p className="mt-2 whitespace-pre-line break-words text-charcoal">
          <span className="font-medium">{t.disputeMessage}:</span> {dispute.message}
        </p>
      )}
      {dispute.status === 'open' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <ConfirmAction
            trigger={
              <>
                <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t.approveDispute}
              </>
            }
            triggerVariant="default"
            triggerSize="sm"
            title={t.approveTitle}
            description={t.approveText}
            confirmLabel={t.approveDispute}
            withNote
            onConfirm={resolve('approved')}
          />
          <ConfirmAction
            trigger={
              <>
                <ShieldX className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t.rejectDispute}
              </>
            }
            triggerSize="sm"
            title={t.rejectTitle}
            description={t.rejectText}
            confirmLabel={t.rejectDispute}
            withNote
            onConfirm={resolve('rejected')}
          />
        </div>
      ) : (
        dispute.adminNote && (
          <p className="mt-2 text-xs text-muted-grey">
            {t.disputeAdminNote}: <span className="text-charcoal">{dispute.adminNote}</span>
          </p>
        )
      )}
    </div>
  );
}

/** Review cards with hide/show moderation */
export function ReviewList({
  reviews,
  onChanged,
  showWorker = true,
}: {
  reviews: DisputedAdminReview[];
  onChanged: (review: DisputedAdminReview) => void;
  showWorker?: boolean;
}) {
  const t = useMessages(reviewMessages);
  const p = useMessages(profileMessages);
  const f = useFormat();

  return (
    <ul className="space-y-3">
      {reviews.map((r) => {
        const details = (
          [
            [p.punctuality, r.punctuality],
            [p.quality, r.quality],
            [p.friendliness, r.friendliness],
          ] as [string, number | undefined][]
        ).filter(([, v]) => typeof v === 'number' && v > 0);
        return (
          <li
            key={r._id}
            className={cn(
              'rounded-2xl border p-4 sm:p-5',
              r.hidden ? 'border-dashed border-border bg-cream/60' : 'border-border bg-white'
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StarDisplay value={r.rating} />
                  <span className="text-sm font-semibold text-charcoal">{r.rating}/5</span>
                  {r.hidden && (
                    <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                      {t.hiddenBadge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-grey">
                  {f.dateTime(r.createdAt)}
                  {r.customer && (
                    <>
                      {' · '}
                      {t.by}{' '}
                      <Link href={`/admin/kunden/${r.customer._id}`} className="text-pine hover:underline">
                        {r.customer.name}
                      </Link>
                    </>
                  )}
                  {showWorker && r.worker && (
                    <>
                      {' · '}
                      {t.forWorker}{' '}
                      <Link href={`/admin/reinigungskraefte/${r.worker._id}`} className="text-pine hover:underline">
                        {r.worker.name}
                      </Link>
                    </>
                  )}
                  {r.booking && (
                    <>
                      {' · '}
                      {t.booking}{' '}
                      <Link href={`/admin/buchungen/${r.booking._id}`} className="font-mono text-pine hover:underline">
                        {r.booking.reference}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <HiddenToggle review={r} onChanged={onChanged} />
            </div>
            <p className={cn('mt-3 whitespace-pre-line break-words text-sm', r.comment ? 'text-charcoal' : 'italic text-muted-grey')}>
              {r.comment || t.noComment}
            </p>
            {details.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-grey">
                {details.map(([label, value]) => (
                  <span key={label}>
                    {label}: <span className="font-semibold text-charcoal">{value}/5</span>
                  </span>
                ))}
              </p>
            )}
            <DisputeBlock review={r} onChanged={onChanged} />
          </li>
        );
      })}
    </ul>
  );
}
