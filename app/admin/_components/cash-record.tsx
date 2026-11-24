'use client';

import { useEffect, useId, useState } from 'react';
import { Banknote, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/componets/ui/dialog';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { Booking } from '@/lib/types';
import { cn } from '@/lib/utils';

import cashMessages from '../_cash-messages';
import adminMessages from '../_messages';
import { centsToInput, parseEuroToCents } from './labels';
import { useErrorText } from './use-api';

type CollectedBy = 'worker' | 'office';

/** "Barzahlung erfassen" – PATCH /admin/bookings/:id/cash */
export function CashRecordButton({ booking, onChanged }: { booking: Booking; onChanged?: () => void }) {
  const t = useMessages(cashMessages);
  const a = useMessages(adminMessages);
  const f = useFormat();
  const errorText = useErrorText();
  const payment = booking.payment;
  const expectedCents = payment?.amountCents ?? booking.estimate?.totalCents ?? 0;
  const collected = payment?.cashCollectedCents != null;
  const hasWorker = Boolean(booking.assignedWorker);

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [collectedBy, setCollectedBy] = useState<CollectedBy>('worker');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { amount: useId(), by: useId() };

  useEffect(() => {
    if (!open) return;
    setAmount(centsToInput(payment?.cashCollectedCents ?? expectedCents));
    setCollectedBy(hasWorker ? 'worker' : 'office');
    setError(null);
  }, [open, payment?.cashCollectedCents, expectedCents, hasWorker]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const cents = parseEuroToCents(amount);
    if (cents === null || cents > 1_000_000) {
      setError(t.amountError);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.patch(`/admin/bookings/${booking._id}/cash`, { amountCents: cents, collectedBy });
      toast.success(t.saved);
      setOpen(false);
      onChanged?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  const options: { value: CollectedBy; label: string; hint: string; disabled?: boolean }[] = [
    { value: 'worker', label: t.byWorker, hint: hasWorker ? t.byWorkerHint : t.byWorkerNone, disabled: !hasWorker },
    { value: 'office', label: t.byOffice, hint: t.byOfficeHint },
  ];

  return (
    <>
      <Button type="button" size="sm" variant={collected ? 'outline' : 'default'} onClick={() => setOpen(true)}>
        <Banknote className="mr-2 h-4 w-4" aria-hidden="true" />
        {collected ? t.correct : t.record}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t.dialogTitle}</DialogTitle>
              <DialogDescription>{t.dialogText(booking.reference, f.euro(expectedCents))}</DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor={ids.amount}>{t.amount}</Label>
              <Input
                id={ids.amount}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={pending}
                required
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium leading-none">{t.collectedBy}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((o) => {
                  const id = `${ids.by}-${o.value}`;
                  const checked = collectedBy === o.value;
                  return (
                    <label
                      key={o.value}
                      htmlFor={id}
                      className={cn(
                        'flex cursor-pointer gap-2 rounded-xl border p-3 text-sm focus-within:ring-2 focus-within:ring-ring',
                        checked ? 'border-pine bg-mint/60' : 'border-border bg-white',
                        o.disabled && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      <input
                        id={id}
                        type="radio"
                        name={ids.by}
                        value={o.value}
                        checked={checked}
                        onChange={() => setCollectedBy(o.value)}
                        disabled={pending || o.disabled}
                        className="mt-0.5 h-4 w-4 accent-[#174D3A]"
                      />
                      <span>
                        <span className="block font-semibold text-charcoal">{o.label}</span>
                        <span className="block text-xs text-muted-grey">{o.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {error && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                {a.ui.cancel}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
