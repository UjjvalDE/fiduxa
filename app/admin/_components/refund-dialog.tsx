'use client';

import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { ApiError, api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminPaymentWithRefunds } from '@/lib/types';

import moneyMessages from '../_money-messages';
import { ConfirmAction } from './confirm-action';
import { centsToInput, parseEuroToCents } from './labels';
import { useErrorText } from './use-api';

interface RefundResponse {
  refundId: string;
  amountCents: number;
  refundedCents: number;
  remainingCents: number;
  status: string;
}

/** Remaining refundable amount of a payment */
export const refundableCents = (payment: Pick<AdminPaymentWithRefunds, 'amountCents' | 'refundedCents'>) =>
  Math.max(0, payment.amountCents - (payment.refundedCents ?? 0));

/**
 * "Erstatten" button + dialog with amount (defaults to the remaining amount)
 * and reason. POST /admin/payments/:id/refund { amountCents, reason }.
 */
export function RefundDialog({
  payment,
  providerName,
  label,
  onDone,
}: {
  payment: AdminPaymentWithRefunds;
  providerName: string;
  /** Trigger text for a first refund ("Erstatten") */
  label: string;
  onDone?: () => void;
}) {
  const t = useMessages(moneyMessages).refund;
  const f = useFormat();
  const errorText = useErrorText();
  const remaining = refundableCents(payment);
  const [amount, setAmount] = useState(() => centsToInput(remaining));
  const [amountError, setAmountError] = useState<string | null>(null);

  const refund = async (reason: string) => {
    const cents = parseEuroToCents(amount);
    if (cents === null || cents < 1 || cents > remaining) {
      setAmountError(t.amountError(f.euro(remaining)));
      throw new Error(t.amountError(f.euro(remaining)));
    }
    setAmountError(null);
    try {
      const res = await api.post<RefundResponse>(`/admin/payments/${payment._id}/refund`, { amountCents: cents, reason: reason.trim() });
      toast.success(res.remainingCents > 0 ? t.donePartial(f.euro(res.amountCents), f.euro(res.remainingCents)) : t.done(f.euro(res.amountCents)));
      onDone?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REFUND_TOO_HIGH') throw new Error(t.errTooHigh);
      throw new Error(errorText(err));
    }
  };

  if (remaining <= 0) return null;

  return (
    <ConfirmAction
      trigger={
        <>
          <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> {(payment.refundedCents ?? 0) > 0 ? t.partial : label}
        </>
      }
      triggerSize="sm"
      title={t.title(f.euro(remaining))}
      description={t.text(providerName)}
      confirmLabel={t.confirm}
      destructive
      withNote
      noteLabel={t.reason}
      noteMaxLength={500}
      onOpenChange={(open) => {
        if (open) {
          setAmount(centsToInput(remaining));
          setAmountError(null);
        }
      }}
      onConfirm={refund}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`refund-amount-${payment._id}`}>{t.amount}</Label>
        <Input
          id={`refund-amount-${payment._id}`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={amountError ? true : undefined}
          aria-describedby={`refund-amount-${payment._id}-hint`}
        />
        <p id={`refund-amount-${payment._id}-hint`} className={amountError ? 'text-xs font-medium text-red-700' : 'text-xs text-muted-grey'}>
          {amountError ?? t.amountHint(f.euro(remaining))}
        </p>
        {(payment.refundedCents ?? 0) > 0 && <p className="text-xs text-muted-grey">{t.alreadyRefunded(f.euro(payment.refundedCents ?? 0))}</p>}
      </div>
    </ConfirmAction>
  );
}
