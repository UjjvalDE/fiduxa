'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Banknote, Loader2, Pause, Play, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminPayoutRecord, Booking, PayoutStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

import cashMessages from '../_cash-messages';
import payoutMessages from '../auszahlungen/_messages';
import { ConfirmAction } from './confirm-action';
import { InfoList, SectionCard } from './states';
import { useErrorText } from './use-api';

const STATUS_CLASSES: Record<PayoutStatus, string> = {
  pending: 'bg-sky-50 text-sky-800 border-sky-200',
  due: 'bg-amber-50 text-amber-800 border-amber-200',
  on_hold: 'bg-red-50 text-red-700 border-red-200',
  processing: 'bg-amber-50 text-amber-800 border-amber-200',
  paid: 'bg-mint text-pine border-sage',
};

/** Status of a recorded payout (records without a status are paid) */
export type PayoutRecordStatus = NonNullable<AdminPayoutRecord['status']>;

const RECORD_STATUS_CLASSES: Record<PayoutRecordStatus, string> = {
  processing: 'bg-amber-50 text-amber-800 border-amber-200',
  paid: 'bg-mint text-pine border-sage',
  failed: 'bg-red-50 text-red-700 border-red-200',
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

/** Badge for a recorded payout (AdminPayoutRecord); records without status count as paid */
export function PayoutRecordStatusBadge({ status }: { status?: PayoutRecordStatus }) {
  const t = useMessages(payoutMessages);
  const s: PayoutRecordStatus = status ?? 'paid';
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        RECORD_STATUS_CLASSES[s] ?? RECORD_STATUS_CLASSES.paid
      )}
    >
      {t.recordStatus[s] ?? s}
    </span>
  );
}

/** Provider ("Bank"/"PayPal"), payout target and provider references of a payout record */
export function PayoutMethodCell({ payout }: { payout: AdminPayoutRecord }) {
  const t = useMessages(payoutMessages);
  const provider = payout.provider ?? 'bank';
  const target =
    provider === 'paypal'
      ? payout.paypalEmail || '–'
      : payout.bankAccountLast4
        ? t.ibanEnding(payout.bankAccountLast4)
        : '–';
  const refs = [payout.providerBatchId, payout.providerItemId].filter(Boolean) as string[];
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="whitespace-nowrap">
        <span className="font-medium text-charcoal">{provider === 'paypal' ? t.providerPaypal : t.providerBank}</span>{' '}
        <span className={cn('text-muted-grey', provider === 'bank' && 'font-mono')}>{target}</span>
      </p>
      {refs.length > 0 && (
        <p className="break-all font-mono text-[11px] leading-tight text-muted-grey">{refs.join(' · ')}</p>
      )}
      {payout.status === 'failed' && payout.failureReason && (
        <p className="max-w-[18rem] text-xs text-red-700">
          {t.failureLabel}: {payout.failureReason}
        </p>
      )}
    </div>
  );
}

/** "Status aktualisieren" + "Als fehlgeschlagen markieren" for a processing payout */
export function PayoutRefreshActions({ payout, onChanged }: { payout: AdminPayoutRecord; onChanged: () => void }) {
  const t = useMessages(payoutMessages);
  const errorText = useErrorText();
  const [pending, setPending] = useState(false);
  if (payout.status !== 'processing') return null;

  const refresh = async () => {
    setPending(true);
    try {
      const res = await api.post<{ payout: AdminPayoutRecord }>(`/admin/payouts/${payout._id}/refresh`);
      if (res.payout.status === 'paid') toast.success(t.refreshPaid);
      else if (res.payout.status === 'failed') toast.error(t.refreshFailed(res.payout.failureReason || '–'));
      else toast.info(t.refreshProcessing);
      onChanged();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPending(false);
    }
  };

  const forceFail = async () => {
    const res = await api.post<{ payout: AdminPayoutRecord }>(`/admin/payouts/${payout._id}/refresh`, {
      forceFail: true,
    });
    if (res.payout.status === 'failed') toast.success(t.markFailedDone);
    else if (res.payout.status === 'paid') toast.success(t.refreshPaid);
    onChanged();
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button type="button" size="sm" variant="outline" onClick={refresh} disabled={pending}>
        {pending ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
        )}
        {t.refresh}
      </Button>
      <ConfirmAction
        trigger={
          <>
            <XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t.markFailed}
          </>
        }
        triggerSize="sm"
        triggerClassName="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
        disabled={pending}
        title={t.markFailedTitle(payout.reference)}
        description={t.markFailedText}
        confirmLabel={t.markFailed}
        destructive
        onConfirm={forceFail}
      />
    </div>
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
  if (status === 'paid' || status === 'processing') return null;
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
export function PayoutHistoryTable({
  payouts,
  showWorker = true,
  onChanged,
}: {
  payouts: AdminPayoutRecord[];
  showWorker?: boolean;
  /** Reload callback; enables the refresh actions for processing payouts */
  onChanged?: () => void;
}) {
  const t = useMessages(payoutMessages);
  const f = useFormat();
  const hasProcessing = Boolean(onChanged) && payouts.some((p) => p.status === 'processing');
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white">
      <table className="w-full min-w-[920px] text-sm">
        <caption className="sr-only">{t.historyCaption}</caption>
        <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">{t.hReference}</th>
            {showWorker && <th scope="col" className="px-4 py-3 font-semibold">{t.hWorker}</th>}
            <th scope="col" className="px-4 py-3 font-semibold">{t.hStatus}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{t.hPaidAt}</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">{t.hAmount}</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">{t.hJobs}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{t.hMethod}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{t.hBy}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{t.hNote}</th>
            {hasProcessing && (
              <th scope="col" className="px-4 py-3 font-semibold">
                <span className="sr-only">{t.hActions}</span>
              </th>
            )}
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
              <td className="px-4 py-3">
                <PayoutRecordStatusBadge status={p.status} />
              </td>
              <td className="px-4 py-3 text-muted-grey">
                {p.paidAt ? (
                  f.dateTime(p.paidAt)
                ) : p.initiatedAt ? (
                  <span title={t.initiatedAt(f.dateTime(p.initiatedAt))}>{f.dateTime(p.initiatedAt)}</span>
                ) : (
                  '–'
                )}
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{f.euro(p.amountCents)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{p.jobCount}</td>
              <td className="px-4 py-3">
                <PayoutMethodCell payout={p} />
              </td>
              <td className="px-4 py-3 text-muted-grey">{p.createdBy?.name ?? '–'}</td>
              <td className="max-w-[16rem] break-words px-4 py-3 text-muted-grey">{p.note || '–'}</td>
              {hasProcessing && (
                <td className="px-4 py-3 text-right">
                  {onChanged && <PayoutRefreshActions payout={p} onChanged={onChanged} />}
                </td>
              )}
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
    ...(p.grossCents != null && p.commissionCents != null
      ? ([
          [t.card.gross, f.euro(p.grossCents)],
          [
            t.card.commission,
            <span key="c" title={t.commissionHint}>
              {f.euro(p.commissionCents)}
              <span className="ml-2 text-xs text-muted-grey">({t.commissionHint})</span>
            </span>,
          ],
        ] as [string, React.ReactNode][])
      : []),
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
