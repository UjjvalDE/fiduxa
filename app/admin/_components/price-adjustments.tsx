'use client';

import { useState } from 'react';
import { BadgeEuro, Clock, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { Booking, BookingWithMoney, PriceAdjustment } from '@/lib/types';
import { cn } from '@/lib/utils';

import moneyMessages from '../_money-messages';
import { ConfirmAction } from './confirm-action';
import { NativeSelect, SectionCard } from './states';
import { useErrorText } from './use-api';

const STATUS_CLASSES: Record<PriceAdjustment['status'], string> = {
  proposed: 'bg-sky-50 text-sky-800 border-sky-200',
  open: 'bg-amber-50 text-amber-800 border-amber-200',
  paid: 'bg-mint text-pine border-sage',
  refunded: 'bg-gray-100 text-gray-700 border-gray-200',
  waived: 'bg-gray-100 text-gray-600 border-gray-200',
  declined: 'bg-red-50 text-red-700 border-red-200',
  expired: 'bg-gray-100 text-gray-600 border-gray-200',
};

/** Hourly rate the booking was priced with (estimate snapshot, fallback 25 €) */
const bookingRateCents = (booking: Booking) => (booking.estimate as { hourlyRateCents?: number } | undefined)?.hourlyRateCents ?? 2500;

function ProposeDurationAdjustment({ booking, onChanged }: { booking: Booking; onChanged?: () => void }) {
  const t = useMessages(moneyMessages).adjustments;
  const f = useFormat();
  const errorText = useErrorText();
  const [minutes, setMinutes] = useState('30');
  const [minutesError, setMinutesError] = useState<string | null>(null);
  const rate = bookingRateCents(booking);
  const parsed = Number(minutes.trim().replace('+', ''));
  const valid = Number.isInteger(parsed) && parsed !== 0 && Math.abs(parsed) <= 720;
  const preview = valid ? Math.round((parsed / 60) * rate) : null;

  const submit = async (note: string) => {
    if (!valid) {
      setMinutesError(t.proposeMinutesError);
      throw new Error(t.proposeMinutesError);
    }
    try {
      await api.post(`/admin/bookings/${booking._id}/duration-adjustment`, { minutes: parsed, note: note.trim() });
      toast.success(t.proposeDone);
      onChanged?.();
    } catch (err) {
      throw new Error(errorText(err));
    }
  };

  return (
    <ConfirmAction
      trigger={
        <>
          <Clock className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t.propose}
        </>
      }
      triggerSize="sm"
      title={t.proposeTitle}
      description={t.proposeText(f.euro(rate))}
      confirmLabel={t.proposeConfirm}
      withNote
      noteLabel={t.proposeNote}
      noteMaxLength={500}
      onOpenChange={(open) => {
        if (open) {
          setMinutes('30');
          setMinutesError(null);
        }
      }}
      onConfirm={submit}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`adj-minutes-${booking._id}`}>{t.proposeMinutes}</Label>
        <Input
          id={`adj-minutes-${booking._id}`}
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          aria-invalid={minutesError ? true : undefined}
          aria-describedby={`adj-minutes-${booking._id}-hint`}
        />
        <p id={`adj-minutes-${booking._id}-hint`} className={minutesError ? 'text-xs font-medium text-red-700' : 'text-xs text-muted-grey'}>
          {minutesError ?? (preview !== null ? t.proposePreview(`${preview > 0 ? '+' : '−'}${f.euro(Math.abs(preview))}`) : '')}
        </p>
      </div>
    </ConfirmAction>
  );
}

function ResolveActions({ booking, adjustment, onChanged }: { booking: Booking; adjustment: PriceAdjustment; onChanged?: () => void }) {
  const t = useMessages(moneyMessages).adjustments;
  const f = useFormat();
  const errorText = useErrorText();
  const [via, setVia] = useState<'cash' | 'invoice'>('invoice');
  const amount = `${adjustment.deltaCents > 0 ? '+' : '−'}${f.euro(Math.abs(adjustment.deltaCents))}`;

  const resolve = async (action: 'mark_paid' | 'waive') => {
    try {
      await api.patch(`/admin/bookings/${booking._id}/adjustments/${adjustment._id}`, action === 'waive' ? { action } : { action, via });
      toast.success(t.done);
      onChanged?.();
    } catch (err) {
      throw new Error(errorText(err));
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {adjustment.status === 'open' && adjustment.checkoutUrl && (
        <a
          href={adjustment.checkoutUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-pine underline-offset-4 hover:underline"
        >
          {t.payLink}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
      {adjustment.deltaCents > 0 && (
        <ConfirmAction
          trigger={t.markPaid}
          triggerSize="sm"
          title={t.markPaidTitle(amount)}
          description={t.markPaidText}
          confirmLabel={t.confirm}
          onOpenChange={(open) => open && setVia('invoice')}
          onConfirm={() => resolve('mark_paid')}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`adj-via-${adjustment._id}`}>{t.via}</Label>
            <NativeSelect id={`adj-via-${adjustment._id}`} value={via} onChange={(e) => setVia(e.target.value === 'cash' ? 'cash' : 'invoice')}>
              <option value="invoice">{t.viaInvoice}</option>
              {/* PayPal-only: "cash" only for bookings that already are cash bookings */}
              {booking.payment?.method === 'cash' && <option value="cash">{t.viaCash}</option>}
            </NativeSelect>
          </div>
        </ConfirmAction>
      )}
      <ConfirmAction
        trigger={t.waive}
        triggerSize="sm"
        triggerVariant="ghost"
        title={t.waiveTitle(amount)}
        description={t.waiveText}
        confirmLabel={t.confirm}
        onConfirm={() => resolve('waive')}
      />
    </div>
  );
}

/**
 * Admin booking detail: cancellation fee, cash mismatch, price adjustments
 * (status, actions) and the duration-adjustment proposal for completed jobs.
 */
export function PriceAdjustmentsCard({ booking, onChanged }: { booking: Booking; onChanged?: () => void }) {
  const t = useMessages(moneyMessages).adjustments;
  const f = useFormat();
  const b = booking as BookingWithMoney;
  const adjustments = b.priceAdjustments ?? [];
  const fee = b.cancellation?.feeCents ?? 0;
  const canPropose = booking.status === 'completed';
  const mismatch = Boolean(b.feedback?.durationMismatch);

  if (adjustments.length === 0 && !canPropose && fee === 0 && !b.feedback?.cashMismatch) return null;

  return (
    <SectionCard
      id="preisanpassungen"
      title={
        <span className="flex items-center gap-2">
          <BadgeEuro className="h-4 w-4 text-pine" aria-hidden="true" /> {t.title}
        </span>
      }
      description={t.description}
      actions={canPropose ? <ProposeDurationAdjustment booking={booking} onChanged={onChanged} /> : undefined}
    >
      {mismatch && canPropose && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          {t.mismatchHint}
        </p>
      )}
      {b.feedback?.cashMismatch && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="status">
          {t.cashMismatch}
        </p>
      )}
      {fee > 0 && (
        <p className="mb-3 text-sm text-charcoal">
          <span className="font-semibold">{t.cancellationFee}:</span>{' '}
          {t.cancellationFeeText(f.euro(fee), b.cancellation?.feePct ?? 0, f.euro(b.cancellation?.cleanerCents ?? 0))} ·{' '}
          <span className="text-muted-grey">{b.cancellation?.charged ? t.feeCharged : t.feeOutstanding}</span>
        </p>
      )}
      {adjustments.length === 0 ? (
        <p className="text-sm text-muted-grey">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {adjustments.map((a) => (
            <li key={a._id} className="px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold tabular-nums text-pine-dark">
                  {a.deltaCents > 0 ? '+' : '−'}
                  {f.euro(Math.abs(a.deltaCents))}
                </span>
                <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', STATUS_CLASSES[a.status])}>
                  {t.status[a.status]}
                  {a.status === 'paid' && a.paidVia ? ` (${t.paidVia[a.paidVia]})` : ''}
                </span>
              </div>
              <p className="m-0 mt-1 text-xs text-muted-grey">
                {a.origin === 'cleaner' ? t.kindCleaner : a.kind === 'duration' ? t.kindDuration : t.kindEdit}
                {a.minutes ? ` · ${t.minutes(a.minutes)}` : ''} · {f.dateTime(a.at)}
                {a.reason ? ` · ${a.reason}` : ''}
                {a.origin === 'cleaner' && a.status === 'proposed' && a.expiresAt ? ` · ${t.expiresAt(f.dateTime(a.expiresAt))}` : ''}
                {a.origin === 'cleaner' && a.newSlotEnd && ['open', 'paid'].includes(a.status) ? ` · ${t.newEnd(a.newSlotEnd)}` : ''}
              </p>
              {(a.status === 'open' || a.status === 'proposed') && <ResolveActions booking={booking} adjustment={a} onChanged={onChanged} />}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
