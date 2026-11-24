'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Ban, CheckCircle2, Copy, Loader2, Mail, ScrollText, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/componets/ui/dialog';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Textarea } from '@/componets/ui/tesxtarea';
import { api } from '@/lib/api';
import { LOCALE_NAMES } from '@/lib/i18n/config';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminGiftCard, GiftCardTransaction } from '@/lib/types';
import { cn } from '@/lib/utils';

import adminMessages from '../../_messages';
import { ConfirmAction } from '../../_components/confirm-action';
import { parseEuroToCents } from '../../_components/labels';
import { GIFT_CARD_STATUS_CLASSES } from '../../_components/promo-utils';
import { DetailSkeleton, ErrorState, InfoList, PageHeader, SectionCard } from '../../_components/states';
import { useApi, useErrorText } from '../../_components/use-api';
import giftCardMessages from '../_messages';

interface GiftCardPayment {
  _id: string;
  provider: 'stripe' | 'paypal' | 'cash';
  amountCents: number;
  status: string;
  paidAt?: string;
  refundedAt?: string;
  createdAt: string;
}

interface DetailResponse {
  giftCard: AdminGiftCard;
  transactions: GiftCardTransaction[];
  payments: GiftCardPayment[];
}

/** Dialog with a required reason (and optionally a signed amount) */
function ReasonDialog({
  trigger,
  triggerVariant = 'outline',
  title,
  description,
  reasonLabel,
  minReason,
  reasonError,
  confirmLabel,
  destructive,
  amount,
  onConfirm,
}: {
  trigger: React.ReactNode;
  triggerVariant?: 'outline' | 'default';
  title: string;
  description: string;
  reasonLabel: string;
  minReason: number;
  reasonError: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Show a signed euro amount input */
  amount?: { label: string; validate: (cents: number | null) => string | null; preview: (cents: number) => string };
  onConfirm: (reason: string, cents: number | null) => Promise<void>;
}) {
  const a = useMessages(adminMessages);
  const errorText = useErrorText();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [rawAmount, setRawAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const negative = rawAmount.trim().startsWith('-') || rawAmount.trim().startsWith('−');
  const abs = parseEuroToCents(rawAmount.trim().replace(/^[-−+]\s*/, ''));
  const cents = abs === null ? null : negative ? -abs : abs;

  const submit = async () => {
    if (amount) {
      const amountError = amount.validate(cents);
      if (amountError) return setError(amountError);
    }
    if (reason.trim().length < minReason) return setError(reasonError);
    setPending(true);
    setError(null);
    try {
      await onConfirm(reason.trim(), cents);
      setOpen(false);
      setReason('');
      setRawAmount('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) {
          setReason('');
          setRawAmount('');
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} className="w-full justify-start">
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          id={`${id}-form`}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) void submit();
          }}
        >
          {amount && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-amount`}>{amount.label}</Label>
              <Input id={`${id}-amount`} inputMode="decimal" value={rawAmount} onChange={(e) => setRawAmount(e.target.value)} disabled={pending} />
              {cents !== null && cents !== 0 && <p className="text-xs text-muted-grey">{amount.preview(cents)}</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-reason`}>{reasonLabel}</Label>
            <Textarea id={`${id}-reason`} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} />
            <p className="text-right text-xs text-muted-grey">{reason.length}/300</p>
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {a.ui.cancel}
          </Button>
          <Button type="submit" form={`${id}-form`} variant={destructive ? 'destructive' : 'default'} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GiftCardDetailPage({ params }: { params: { id: string } }) {
  const t = useMessages(giftCardMessages);
  const td = t.detail;
  const a = useMessages(adminMessages);
  const f = useFormat();
  const { data, error, errorStatus, reload } = useApi<DetailResponse>(`/admin/gift-cards/${params.id}`);

  if (error && !data) {
    return (
      <>
        <PageHeader title={t.title} backHref="/admin/gutscheine" backLabel={td.back} />
        <ErrorState message={error} onRetry={errorStatus === 404 || errorStatus === 400 ? undefined : reload} />
      </>
    );
  }
  if (!data) return <DetailSkeleton />;

  const g = data.giftCard;
  const issuedBy = g.issuedBy && typeof g.issuedBy === 'object' ? g.issuedBy.name : null;
  const paid = g.status === 'active' || g.status === 'redeemed';
  const canAdjust = !['pending_payment', 'cancelled'].includes(g.status);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(g.code);
      toast.success(td.copied);
    } catch {
      toast.error(td.copyFailed);
    }
  };

  const disable = async (reason: string) => {
    await api.post(`/admin/gift-cards/${g._id}/disable`, { reason });
    toast.success(td.disabled);
    reload();
  };
  const enable = async () => {
    await api.post(`/admin/gift-cards/${g._id}/enable`, {});
    toast.success(td.enabled);
    reload();
  };
  const adjust = async (reason: string, cents: number | null) => {
    await api.post(`/admin/gift-cards/${g._id}/adjust`, { amountCents: cents, reason });
    toast.success(td.adjusted);
    reload();
  };
  const resend = async () => {
    const res = await api.post<{ success: boolean }>(`/admin/gift-cards/${g._id}/resend`, {});
    if (res.success) toast.success(td.resent);
    else toast.error(td.resendFailed);
    reload();
  };

  const signed = (cents: number) => (cents > 0 ? `+ ${f.euro(cents)}` : cents < 0 ? `− ${f.euro(-cents)}` : f.euro(0));

  return (
    <>
      <PageHeader
        backHref="/admin/gutscheine"
        backLabel={td.back}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>{f.euro(g.balanceCents)}</span>
            <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', GIFT_CARD_STATUS_CLASSES[g.status])}>
              {t.status[g.status] ?? g.status}
            </span>
          </span>
        }
        description={`${td.initial}: ${f.euro(g.initialCents)} · ${td.expires}: ${f.dateTime(g.expiresAt)}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/admin/protokoll?entityId=${g._id}`}>
              <ScrollText className="mr-2 h-4 w-4" aria-hidden="true" />
              {td.audit}
            </Link>
          </Button>
        }
      />

      {g.status === 'disabled' && g.disabledReason && (
        <div role="status" className="mb-4 flex gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>{td.disabledReason}:</strong> {g.disabledReason}
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title={td.overview}>
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-sage bg-mint/40 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-grey">{td.code}</p>
                <p className="break-all font-mono text-lg font-bold tracking-wider text-pine-dark">{g.code}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={copy} className="bg-white">
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                {td.copy}
              </Button>
            </div>
            <InfoList
              items={[
                [td.initial, f.euro(g.initialCents)],
                [td.balance, <strong key="b">{f.euro(g.balanceCents)}</strong>],
                [td.used, f.euro(Math.max(0, g.initialCents - g.balanceCents))],
                [td.expires, f.dateTime(g.expiresAt)],
                [td.method, g.payment?.method ? td.methods[g.payment.method] ?? g.payment.method : '–'],
                [td.paidAt, f.dateTime(g.payment?.paidAt)],
                [td.created, f.dateTime(g.createdAt)],
                [td.issuedBy, issuedBy ?? '–'],
              ]}
            />
          </SectionCard>

          <SectionCard title={td.ledger} description={td.ledgerHint}>
            {data.transactions.length === 0 ? (
              <p className="text-sm text-muted-grey">{td.noLedger}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[760px] text-sm">
                  <caption className="sr-only">{td.ledgerCaption}</caption>
                  <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">{td.colDate}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{td.colType}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{td.colAmount}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{td.colBalance}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{td.colBooking}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{td.colActor}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{td.colNote}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((tx) => (
                      <tr key={tx._id} className="border-b border-border align-top last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 text-muted-grey">{f.dateTime(tx.createdAt)}</td>
                        <td className="px-3 py-2 font-medium">{td.types[tx.type] ?? tx.type}</td>
                        <td
                          className={cn(
                            'whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums',
                            tx.amountCents > 0 ? 'text-pine' : tx.amountCents < 0 ? 'text-red-700' : 'text-muted-grey'
                          )}
                        >
                          {signed(tx.amountCents)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{f.euro(tx.balanceAfterCents)}</td>
                        <td className="px-3 py-2">
                          {tx.booking ? (
                            <Link href={`/admin/buchungen/${tx.booking._id}`} className="font-mono font-semibold text-pine hover:underline">
                              {tx.booking.reference}
                            </Link>
                          ) : (
                            '–'
                          )}
                        </td>
                        <td className="px-3 py-2">{tx.actor?.name ?? a.ui.system}</td>
                        <td className="max-w-[260px] break-words px-3 py-2 text-muted-grey">{tx.note || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title={td.payments}>
            {data.payments.length === 0 ? (
              <p className="text-sm text-muted-grey">{td.noPayments}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[560px] text-sm">
                  <caption className="sr-only">{td.paymentsCaption}</caption>
                  <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">{td.colDate}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{td.colProvider}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{td.colAmount}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{td.colStatus}</th>
                      <th scope="col" className="px-3 py-2 font-semibold">{td.paidAt}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p._id} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 text-muted-grey">{f.dateTime(p.createdAt)}</td>
                        <td className="px-3 py-2">{td.methods[p.provider] ?? p.provider}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{f.euro(p.amountCents)}</td>
                        <td className="px-3 py-2">{td.paymentStatus[p.status] ?? p.status}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-grey">{f.dateTime(p.paidAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title={td.actions}>
            <div className="space-y-2">
              {canAdjust && (
                <ReasonDialog
                  trigger={
                    <>
                      <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
                      {td.adjust}
                    </>
                  }
                  title={td.adjustTitle}
                  description={td.adjustText}
                  reasonLabel={td.adjustReason}
                  minReason={5}
                  reasonError={td.adjustReasonShort}
                  confirmLabel={td.adjustSubmit}
                  amount={{
                    label: td.adjustAmount,
                    validate: (c) => {
                      if (c === null || c === 0 || Math.abs(c) > 200000) return td.adjustInvalid;
                      if (g.balanceCents + c < 0) return td.adjustBelowZero(f.euro(g.balanceCents));
                      return null;
                    },
                    preview: (c) => td.adjustPreview(f.euro(g.balanceCents + c)),
                  }}
                  onConfirm={adjust}
                />
              )}
              {paid && (
                <ReasonDialog
                  trigger={
                    <>
                      <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                      {td.disable}
                    </>
                  }
                  title={td.disableTitle}
                  description={td.disableText}
                  reasonLabel={td.disableReason}
                  minReason={3}
                  reasonError={td.reasonShort}
                  confirmLabel={td.disable}
                  destructive
                  onConfirm={disable}
                />
              )}
              {g.status === 'disabled' && (
                <ConfirmAction
                  trigger={
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      {td.enable}
                    </>
                  }
                  triggerClassName="w-full justify-start"
                  title={td.enableTitle}
                  description={td.enableText}
                  confirmLabel={td.enable}
                  onConfirm={enable}
                />
              )}
              {paid && g.recipientEmail && (
                <ConfirmAction
                  trigger={
                    <>
                      <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                      {td.resend}
                    </>
                  }
                  triggerClassName="w-full justify-start"
                  title={td.resendTitle}
                  description={td.resendText(g.recipientEmail)}
                  confirmLabel={td.resend}
                  onConfirm={resend}
                />
              )}
            </div>
          </SectionCard>

          <SectionCard title={td.people}>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                [
                  td.buyer,
                  g.purchaser ? (
                    <Link key="buyer" href={`/admin/kunden/${g.purchaser._id}`} className="text-pine hover:underline">
                      {g.purchaser.name} · {g.purchaser.email}
                    </Link>
                  ) : g.payment?.method === 'admin' ? (
                    t.issuedByAdmin
                  ) : (
                    '–'
                  ),
                ],
                [td.sender, [g.senderName, g.senderEmail].filter(Boolean).join(' · ')],
                [td.recipient, [g.recipientName, g.recipientEmail].filter(Boolean).join(' · ')],
                [td.message, g.message ? <span className="whitespace-pre-line">{g.message}</span> : '–'],
                [td.language, g.locale ? LOCALE_NAMES[g.locale] : '–'],
              ]}
            />
          </SectionCard>

          <SectionCard title={td.delivery}>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                [td.delivery, td.deliveryStatus[g.deliveryStatus] ?? g.deliveryStatus],
                [td.deliverAt, f.dateTime(g.deliverAt)],
                [td.deliveredAt, f.dateTime(g.deliveredAt)],
              ]}
            />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
