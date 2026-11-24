'use client';

// "Auszahlungsart": bank transfer (saved IBAN) vs PayPal (email).
// PUT /worker/payout-method { type, paypalEmail? } – 422 invalid email,
// 409 when bank is chosen without saved bank details.
import { useId, useState } from 'react';
import { Info, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { api, ApiError } from '@/lib/api';
import { useMessages } from '@/lib/i18n/client';
import type { PayoutMethod } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useErrorText } from '@/app/admin/_components/use-api';

import portalMessages from '../_portal-messages';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PayoutMethodForm({
  method,
  hasBank,
  editable,
  payoutDelayDays,
  onSaved,
}: {
  method: PayoutMethod;
  hasBank: boolean;
  editable: boolean;
  payoutDelayDays: number;
  onSaved: (method: PayoutMethod) => void;
}) {
  const t = useMessages(portalMessages).earnings.method;
  const errorText = useErrorText();
  // A worker without bank details starts on "paypal" (bank cannot be chosen yet)
  const [type, setType] = useState<PayoutMethod['type']>(method.type === 'bank' && !hasBank ? 'paypal' : method.type);
  const [email, setEmail] = useState(method.paypalEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ids = { group: useId(), email: useId() };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (type === 'paypal' && !EMAIL.test(cleanEmail)) {
      setEmailError(t.errEmail);
      return;
    }
    setEmailError(null);
    setError(null);
    setPending(true);
    try {
      const res = await api.put<{ payoutMethod: PayoutMethod }>('/worker/payout-method', {
        type,
        ...(type === 'paypal' && { paypalEmail: cleanEmail }),
      });
      onSaved(res.payoutMethod);
      setEmail(res.payoutMethod.paypalEmail);
      toast.success(t.saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.fieldErrors.paypalEmail) {
        setEmailError(t.errEmail);
      } else {
        setError(errorText(err));
      }
    } finally {
      setPending(false);
    }
  };

  const disabled = !editable || pending;
  const options = [
    { value: 'bank' as const, label: t.bank, hint: hasBank ? t.bankHint : t.bankDisabled, optionDisabled: !hasBank },
    { value: 'paypal' as const, label: t.paypal, hint: t.paypalHint, optionDisabled: false },
  ];

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <fieldset>
        <legend className="sr-only">{t.title}</legend>
        <div className="grid gap-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={cn(
                'flex min-h-[44px] cursor-pointer gap-3 rounded-xl border p-3 focus-within:ring-2 focus-within:ring-ring',
                type === o.value ? 'border-pine bg-mint' : 'border-border bg-white',
                (disabled || o.optionDisabled) && 'cursor-not-allowed opacity-70'
              )}
            >
              <input
                type="radio"
                name={ids.group}
                value={o.value}
                checked={type === o.value}
                onChange={() => setType(o.value)}
                disabled={disabled || o.optionDisabled}
                className="mt-1 h-4 w-4 accent-pine"
              />
              <span>
                <span className="block font-semibold text-pine-dark">{o.label}</span>
                <span className="block text-sm text-muted-grey">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {type === 'paypal' && (
        <div className="space-y-1.5">
          <Label htmlFor={ids.email}>{t.paypalEmail}</Label>
          <Input
            id={ids.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? `${ids.email}-err` : undefined}
            className="h-12 text-base"
          />
          {emailError && (
            <p id={`${ids.email}-err`} className="text-sm text-red-700">
              {emailError}
            </p>
          )}
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-grey">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t.explainer(payoutDelayDays)}
      </p>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {editable && (
        <Button type="submit" disabled={pending} className="h-12 text-base">
          {pending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-5 w-5" aria-hidden="true" />}
          {t.save}
        </Button>
      )}
    </form>
  );
}
