'use client';

// Price adjustments on a customer's booking: proposals after a duration
// review (approve / decline), open additional payments (pay link) and the
// history of paid / refunded / waived adjustments.
import { useRef, useState } from 'react';
import { BadgeEuro, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError, api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import type { Booking, BookingWithMoney, CustomerPriceAdjustment } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ErrorBox } from '../../buchung/_components/form-field';
import messages from '../_messages';
import serviceMessages from '../_service-messages';

type PriceAdjustment = CustomerPriceAdjustment;

const TONE: Record<PriceAdjustment['status'], string> = {
  proposed: 'border-sage bg-mint text-pine-dark',
  open: 'border-amber-200 bg-amber-50 text-amber-900',
  paid: 'border-border bg-white text-charcoal',
  refunded: 'border-border bg-white text-charcoal',
  waived: 'border-border bg-white text-muted-grey',
  declined: 'border-border bg-white text-muted-grey',
  expired: 'border-border bg-white text-muted-grey',
};

export function CustomerAdjustments({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const t = useMessages(messages).adjustments;
  const tx = useMessages(serviceMessages).extraTime;
  const [result, setResult] = useState<Record<string, string>>({});
  const f = useFormat();
  const { locale } = useLocale();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const adjustments = ((booking as BookingWithMoney).priceAdjustments ?? []) as PriceAdjustment[];
  const isExpired = (a: PriceAdjustment) => a.status === 'expired' || (a.status === 'proposed' && !!a.expiresAt && new Date(a.expiresAt).getTime() <= Date.now());
  if (adjustments.length === 0) return null;

  const run = async (adjustment: PriceAdjustment, action: 'approve' | 'decline' | 'pay') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(adjustment._id);
    setError(null);
    try {
      if (action === 'pay') {
        const res = await api.post<{ url: string }>(`/customer/bookings/${booking._id}/adjustments/${adjustment._id}/pay`);
        window.location.assign(res.url);
        return;
      }
      const res = await api.post<{ adjustment: PriceAdjustment; slotEnd?: string; totalCents?: number }>(`/customer/bookings/${booking._id}/adjustments/${adjustment._id}`, { decision: action });
      if (adjustment.origin === 'cleaner') {
        // Extra time: show new end + final price; the pay link stays one tap away
        toast.success(action === 'approve' ? tx.approvedToast : tx.declinedToast);
        setResult((r) => ({ ...r, [adjustment._id]: action === 'approve' ? tx.approvedText(res.slotEnd || '–', f.euro(res.totalCents ?? null)) : tx.declinedText }));
        onChanged();
        return;
      }
      if (action === 'decline') toast.success(t.declinedToast);
      else toast.success(adjustment.deltaCents > 0 ? t.approvedPayToast : t.approvedRefundToast);
      if (action === 'approve' && res.adjustment?.status === 'open' && res.adjustment.checkoutUrl) {
        window.location.assign(res.adjustment.checkoutUrl);
        return;
      }
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EXTRA_TIME_EXPIRED') {
        toast.error(tx.expiredToast);
        onChanged();
        return;
      }
      setError(translateApiError(e, locale));
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  const amount = (a: PriceAdjustment) => `${a.deltaCents > 0 ? '+' : '−'}${f.euro(Math.abs(a.deltaCents))}`;

  return (
    <section id="preisanpassung" aria-labelledby="adjustments-title" className="scroll-mt-28 rounded-2xl border border-border bg-white p-5 sm:p-6">
      <h2 id="adjustments-title" className="m-0 flex items-center gap-2 text-lg font-bold tracking-tight text-pine-dark">
        <BadgeEuro className="h-5 w-5 text-pine" aria-hidden="true" /> {t.title}
      </h2>
      <ul className="m-0 mt-4 grid list-none gap-3 p-0">
        {adjustments.map((a) => {
          const busy = busyId === a._id;
          if (a.origin === 'cleaner') {
            const expired = isExpired(a);
            return (
              <li key={a._id} className={cn('rounded-xl border p-4 text-sm', a.status === 'proposed' && !expired ? 'border-amber-300 bg-amber-50 text-amber-950' : TONE[a.status])}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-base font-bold">{tx.title(a.minutes ?? 0)}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide">{expired ? tx.statusExpired : t.status[a.status as keyof typeof t.status]}</span>
                </div>
                <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-muted-grey">{tx.reason}</dt>
                  <dd className="m-0">{a.reason}</dd>
                  <dt className="text-muted-grey">{tx.price}</dt>
                  <dd className="m-0 font-semibold tabular-nums">+{f.euro(a.deltaCents)}</dd>
                  {a.newSlotEnd && (
                    <>
                      <dt className="text-muted-grey">{tx.newEnd}</dt>
                      <dd className="m-0">{a.newSlotEnd}</dd>
                    </>
                  )}
                </dl>
                {result[a._id] && <p className="m-0 mt-2 font-semibold">{result[a._id]}</p>}
                {a.status === 'proposed' && !expired && (
                  <>
                    {a.expiresAt && <p className="m-0 mt-2 text-xs">{tx.answerBy(f.dateTime(a.expiresAt))} {t.noConsent}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => run(a, 'approve')} disabled={busy} className="button button-small">
                        {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        {tx.approve}
                      </button>
                      <button type="button" onClick={() => run(a, 'decline')} disabled={busy} className="button button-quiet button-small">
                        {tx.decline}
                      </button>
                    </div>
                  </>
                )}
                {expired && <p className="m-0 mt-2 text-xs text-muted-grey">{tx.expired}</p>}
                {a.status === 'open' && a.deltaCents > 0 && (
                  <button type="button" onClick={() => run(a, 'pay')} disabled={busy} className="button button-small mt-3 bg-[#FFC439] text-[#003087] hover:bg-[#f2b92f]">
                    {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {tx.payPaypal}
                  </button>
                )}
              </li>
            );
          }
          return (
            <li key={a._id} className={cn('rounded-xl border p-4 text-sm', TONE[a.status])}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-base font-bold tabular-nums">{amount(a)}</span>
                <span className="text-xs font-semibold uppercase tracking-wide">{a.status === 'expired' ? tx.statusExpired : t.status[a.status]}</span>
              </div>
              <p className="m-0 mt-1">
                {a.status === 'proposed'
                  ? a.kind === 'duration' && a.minutes
                    ? t.proposedDuration(a.minutes, f.euro(Math.abs(a.deltaCents)), a.deltaCents > 0)
                    : t.proposedGeneric(amount(a))
                  : a.status === 'open'
                    ? t.openText(f.euro(a.deltaCents))
                    : a.reason || ''}
              </p>
              {a.status === 'proposed' && <p className="m-0 mt-1 text-xs text-muted-grey">{t.noConsent}</p>}
              {(a.status === 'proposed' || (a.status === 'open' && a.deltaCents > 0)) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.status === 'proposed' ? (
                    <>
                      <button type="button" onClick={() => run(a, 'approve')} disabled={busy} className="button button-small">
                        {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        {a.deltaCents > 0 ? t.approvePay : t.approveRefund}
                      </button>
                      <button type="button" onClick={() => run(a, 'decline')} disabled={busy} className="button button-quiet button-small">
                        {t.decline}
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => run(a, 'pay')} disabled={busy} className="button button-small">
                      {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {tx.payPaypal}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <div className="mt-3">
          <ErrorBox message={error} />
        </div>
      )}
    </section>
  );
}
