'use client';

// "Guthaben prüfen": POST /gift-cards/check { code } (public, rate limited)
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CircleCheck, LoaderCircle, Search } from 'lucide-react';

import { Input } from '@/componets/ui/input';
import { api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import type { GiftCardReason } from '@/lib/types';
import { useErrorText } from '@/app/admin/_components/use-api';
import pricingMessages from '../../_shared/pricing-messages';
import { formatBerlinDate } from '../../_shared/promotions';
import { FieldError, inputClass } from '../../buchung/_components/form-field';
import messages from '../_messages';

type Result =
  | { valid: true; code: string; balanceCents: number; expiresAt: string | null }
  | { valid: false; reason: GiftCardReason };

export function BalanceCheck() {
  const t = useMessages(messages).balance;
  const tg = useMessages(pricingMessages).gift;
  const f = useFormat();
  const { locale } = useLocale();
  const errorText = useErrorText();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setResult(null);
    if (!code.trim()) {
      setError(t.empty);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      setResult(await api.post<Result>('/gift-cards/check', { code: code.trim() }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  const message = error ?? (result && !result.valid ? tg.reasons[result.reason] ?? tg.reasons.invalid : null);

  return (
    <section className="rounded-2xl border border-border bg-white p-5 sm:p-6" aria-labelledby="balance-title">
      <h2 id="balance-title" className="!m-0 !max-w-none !text-xl !tracking-tight">
        {t.title}
      </h2>
      <p className="mb-4 mt-1 text-sm leading-relaxed text-muted-grey">{t.lead}</p>
      <form onSubmit={onSubmit} noValidate className="grid gap-2">
        <label htmlFor="balance-code" className="text-sm font-bold text-pine-dark">
          {t.label}
        </label>
        <div className="flex gap-2">
          <Input
            id="balance-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
            placeholder="FIDX-XXXX-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? 'balance-error' : undefined}
            className={`${inputClass} uppercase tracking-wide placeholder:normal-case`}
          />
          <button type="submit" className="button min-h-[44px] shrink-0 !py-0" disabled={loading}>
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            {loading ? t.checking : t.check}
          </button>
        </div>
        <div aria-live="polite">
          {message && <FieldError id="balance-error">{message}</FieldError>}
          {result?.valid && (
            <div className="mt-2 grid gap-3 rounded-[12px] bg-mint p-4 text-sm text-pine-dark">
              <p className="m-0 flex items-start gap-2 font-bold">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
                <span>
                  {result.code}
                  <br />
                  {t.result(f.euro(result.balanceCents), formatBerlinDate(result.expiresAt, locale))}
                </span>
              </p>
              <Link href="/buchung" className="text-link w-fit">
                {t.redeem} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </form>
    </section>
  );
}
