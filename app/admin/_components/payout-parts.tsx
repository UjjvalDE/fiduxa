'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Banknote, Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminPayoutRecord, Booking, PayoutStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

import cashMessages from '../_cash-messages';
import payoutMessages from '../auszahlungen/_messages';
import { InfoList, SectionCard } from './states';
import { useErrorText } from './use-api';

const STATUS_CLASSES: Record<PayoutStatus, string> = {
  pending: 'bg-sky-50 text-sky-800 border-sky-200',
  due: 'bg-amber-50 text-amber-800 border-amber-200',
  on_hold: 'bg-red-50 text-red-700 border-red-200',
  paid: 'bg-mint text-pine border-sage',
};

/** Mirrors displayPayoutStatus() in server/src/services/payout.service.js */
export const payoutDisplayStatus = (p: NonNullable<Booking['workerPayout']>): PayoutStatus =>
  p.status === 'pending' && new Date(p.dueAt).getTime() <= Date.now() ? 'due' : p.status;

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const t = useMessages(payoutMessages);
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        STATUS_CLASSES[status] ?? STATUS_CLASSES.pending
      )}
    >
      {t.status[status] ?? status}
    </span>
  );
}

/** "Anhalten" / "Freigeben" for one open job payout */
export function PayoutHoldButton({
  bookingId,
  status,
  onChanged,
}: {
  bookingId: string;
  status: PayoutStatus;
  onChanged: () => void;
}) {
  const t = useMessages(payoutMessages);
  const errorText = useErrorText();
  const [pending, setPending] = useState(false);
  if (status === 'paid') return null;
  const onHold = status === 'on_hold';

  const toggle = async () => {
    setPending(true);
    try {
      await api.patch(`/admin/bookings/${bookingId}/payout`, { status: onHold ? 'pending' : 'on_hold' });
      toast.success(onHold ? t.released : t.held);
      onChanged();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={toggle}
      disabled={pending}
      className={onHold ? undefined : 'border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800'}
    >
      {pending ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
      ) : onHold ? (
        <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />
      ) : (
        <Pause className="mr-1.5 h-4 w-4" aria-hidden="true" />
      )}
      {onHold ? t.release : t.hold}
    </Button>
  );
}

/** Table of recorded payouts (GET /admin/payouts) */
export function PayoutHistoryTable({ payouts, showWorker = true }: { payouts: AdminPayoutRecord[]; showWorker?: boolean }) {
  const t = useMessages(payoutMessages);
  const f = useFormat();
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white">
      <table className="w-full min-w-[760px] text-sm">
        <caption className="sr-only">{t.historyCaption}</caption>
        <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">{t.hReference}</th>
            {showWorker && <th scope="col" className="px-4 py-3 font-semibold">{t.hWorker}</th>}
            <th scope="col" className="px-4 py-3 font-semibold">{t.hPaidAt}</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">{t.hAmount}</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">{t.hJobs}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{t.hIban}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{t.hBy}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{t.hNote}</th>
          </tr>
        </thead>
        <tbody>
          {payouts.map((p) => (
            <tr key={p._id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-mono font-semibold text-pine-dark">{p.reference}</td>
              {showWorker && (
                <td className="px-4 py-3">
                  {p.worker ? (
                    <Link href={`/admin/reinigungskraefte/${p.worker._id}`} className="font-medium text-pine hover:underline">
                      {p.worker.name}
                    </Link>
                  ) : (
                    '–'
                  )}
                </td>
              )}
              <td className="px-4 py-3 text-muted-grey">{f.dateTime(p.paidAt)}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{f.euro(p.amountCents)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{p.jobCount}</td>
              <td className="px-4 py-3 font-mono text-muted-grey">{p.bankAccountLast4 ? t.ibanEnding(p.bankAccountLast4) : '–'}</td>
              <td className="px-4 py-3 text-muted-grey">{p.createdBy?.name ?? '–'}</td>
              <td className="max-w-[16rem] break-words px-4 py-3 text-muted-grey">{p.note || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Vergütung Reinigungskraft" card on the admin booking detail page */
export function WorkerPayoutCard({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const t = useMessages(payoutMessages);
  const cash = useMessages(cashMessages);
  const f = useFormat();
  const p = booking.workerPayout;
  if (!p) return null;
  const status = payoutDisplayStatus(p);
  const items: [string, React.ReactNode][] = [
    [t.card.amount, <span key="a" className="font-semibold">{f.euro(p.amountCents)}</span>],
    [t.card.calculation, t.card.calc(f.hours(p.minutes), f.euro(p.rateCents))],
    ...(p.cashHeldCents
      ? ([
          [cash.colCash, `− ${f.euro(p.cashHeldCents)}`],
          [
            cash.colNet,
            <span key="n" className={cn('font-semibold', p.amountCents - p.cashHeldCents < 0 && 'text-red-700')}>
              {f.euro(p.amountCents - p.cashHeldCents)}
            </span>,
          ],
        ] as [string, React.ReactNode][])
      : []),
    [t.card.earnedAt, f.dateTime(p.earnedAt)],
    status === 'paid' ? [t.card.paidAt, f.dateTime(p.paidAt)] : [t.card.dueAt, f.dateTime(p.dueAt)],
  ];
  return (
    <SectionCard
      id="verguetung"
      title={
        <span className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-pine" aria-hidden="true" /> {t.card.title}
        </span>
      }
      actions={<PayoutStatusBadge status={status} />}
    >
      <InfoList className="sm:grid-cols-1" items={items} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/admin/auszahlungen"
          className="inline-flex rounded text-sm font-semibold text-pine underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.card.toPayouts}
        </Link>
        <PayoutHoldButton bookingId={booking._id} status={status} onChanged={onChanged} />
      </div>
    </SectionCard>
  );
}
