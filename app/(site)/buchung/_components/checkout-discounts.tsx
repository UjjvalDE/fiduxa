'use client';

// Discount inputs of the checkout: "Rabattcode", "Gutschein einlösen" and the
// welcome-offer hints. All results come from the server quote.
import { useState } from 'react';
import Link from 'next/link';
import { CircleCheck, Gift, Info, LoaderCircle, MailCheck, RefreshCw, Tag, X } from 'lucide-react';

import { Input } from '@/componets/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';
import pricingMessages from '../../_shared/pricing-messages';
import { formatDiscount, maskedGiftCode, normalizeGiftCode } from '../../_shared/promotions';
import type { QuoteState } from '../_lib/hooks';
import { FieldError, inputClass } from './form-field';

const smallButton =
  'inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[10px] border border-pine bg-white px-4 text-sm font-bold text-pine transition-colors hover:bg-mint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:opacity-60';
const removeButton =
  'inline-grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-muted-grey transition-colors hover:bg-cream hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pine';

/* ---------- Rabattcode ---------- */
export function PromoCodeField({
  applied,
  onApply,
  onRemove,
  quote,
  error,
  disabled,
}: {
  applied: string;
  onApply: (code: string) => void;
  onRemove: () => void;
  quote: QuoteState;
  error?: string;
  disabled?: boolean;
}) {
  const t = useMessages(pricingMessages).promo;
  const f = useFormat();
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const result = applied && quote.isCurrent ? quote.quote?.codeResult ?? null : null;
  const checking = Boolean(applied) && !quote.isCurrent && !quote.error;

  let status: { tone: 'ok' | 'info' | 'error'; text: string } | null = null;
  if (result) {
    if (result.ok && !result.superseded) status = { tone: 'ok', text: t.applied(result.code, f.euro(result.discountCents)) };
    else if (result.ok) status = { tone: 'info', text: quote.quote?.promotion?.kind === 'welcome' ? t.supersededWelcome : t.supersededOther };
    else status = { tone: 'error', text: (result.reason && t.reasons[result.reason]) || t.reasons.not_found };
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const code = value.trim().toUpperCase().replace(/\s+/g, '');
    if (!code) {
      setLocalError(t.empty);
      return;
    }
    setLocalError(null);
    setValue('');
    onApply(code);
  };

  const shownError = error ?? localError;

  return (
    <div className="grid gap-2">
      <p className="m-0 flex items-center gap-2 text-sm font-bold text-pine-dark">
        <Tag className="h-4 w-4 text-pine" aria-hidden="true" /> {t.title}
      </p>
      {applied ? (
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border bg-cream py-0.5 pl-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-bold tracking-wide text-pine-dark">
              {checking ? <LoaderCircle className="h-4 w-4 animate-spin text-pine" aria-hidden="true" /> : null}
              <span className="break-all">{applied}</span>
            </span>
            <button type="button" onClick={onRemove} className={removeButton} disabled={disabled} aria-label={t.removeSr(applied)}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div aria-live="polite">
            {checking && <p className="m-0 text-xs text-muted-grey">{t.checking}</p>}
            {status && !error && (
              <p
                className={cn(
                  'm-0 flex items-start gap-1.5 text-xs font-semibold',
                  status.tone === 'ok' ? 'text-pine' : status.tone === 'info' ? 'text-pine-dark' : 'text-red-700'
                )}
              >
                {status.tone === 'error' ? null : status.tone === 'ok' ? (
                  <CircleCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{status.text}</span>
              </p>
            )}
            {error && <FieldError id="promo-code-error">{error}</FieldError>}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-1.5">
          <label htmlFor="promo-code" className="sr-only">
            {t.label}
          </label>
          <div className="flex gap-2">
            <Input
              id="promo-code"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setLocalError(null);
              }}
              placeholder={t.placeholder}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              disabled={disabled}
              aria-invalid={shownError ? true : undefined}
              aria-describedby={shownError ? 'promo-code-error' : 'promo-code-hint'}
              className={cn(inputClass, 'uppercase placeholder:normal-case')}
            />
            <button type="submit" className={smallButton} disabled={disabled}>
              {t.apply}
            </button>
          </div>
          {shownError ? (
            <FieldError id="promo-code-error">{shownError}</FieldError>
          ) : (
            <p id="promo-code-hint" className="m-0 text-xs leading-relaxed text-muted-grey">
              {t.oneOnly}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

/* ---------- Gutschein einlösen ---------- */
export function GiftCardField({
  codes,
  onAdd,
  onRemove,
  quote,
  max,
  error,
  disabled,
}: {
  codes: string[];
  onAdd: (code: string) => void;
  onRemove: (index: number) => void;
  quote: QuoteState;
  max: number;
  error?: string;
  disabled?: boolean;
}) {
  const t = useMessages(pricingMessages).gift;
  const f = useFormat();
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const entries = quote.isCurrent ? quote.quote?.giftCards ?? null : null;
  const full = codes.length >= max;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const raw = value.trim();
    if (!raw) {
      setLocalError(t.empty);
      return;
    }
    const normalized = normalizeGiftCode(raw);
    if (codes.some((c) => normalizeGiftCode(c) === normalized)) {
      setLocalError(t.duplicate);
      return;
    }
    if (full) {
      setLocalError(t.limit(max));
      return;
    }
    setLocalError(null);
    setValue('');
    onAdd(raw.toUpperCase());
  };

  const shownError = error ?? localError;

  return (
    <div className="grid gap-2">
      <p className="m-0 flex items-center gap-2 text-sm font-bold text-pine-dark">
        <Gift className="h-4 w-4 text-pine" aria-hidden="true" /> {t.title}
      </p>
      {codes.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0" aria-live="polite">
          {codes.map((code, index) => {
            const entry = entries?.[index];
            const masked = entry?.code ?? maskedGiftCode(normalizeGiftCode(code).slice(-4));
            const bad = entry && !entry.ok;
            const note = !entry
              ? t.checking
              : !entry.ok || entry.reason === 'not_needed'
                ? entry.reason === 'too_many'
                  ? t.limit(max)
                  : (entry.reason && t.reasons[entry.reason]) || t.reasons.invalid
                : t.applied(f.euro(entry.appliedCents));
            return (
              <li
                key={`${code}-${index}`}
                className={cn('flex items-center justify-between gap-2 rounded-[10px] border py-0.5 pl-3', bad ? 'border-red-200 bg-red-50' : 'border-border bg-cream')}
              >
                <span className="grid min-w-0 py-1.5">
                  <span className="break-all text-sm font-bold tracking-wide text-pine-dark">{masked}</span>
                  <span className={cn('flex items-center gap-1 text-xs', bad ? 'font-semibold text-red-700' : 'text-muted-grey')}>
                    {!entry && <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />}
                    {note}
                  </span>
                </span>
                <button type="button" onClick={() => onRemove(index)} className={removeButton} disabled={disabled} aria-label={t.removeSr(masked)}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!full && (
        <form onSubmit={submit} noValidate className="grid gap-1.5">
          <label htmlFor="gift-card-code" className="sr-only">
            {t.label}
          </label>
          <div className="flex gap-2">
            <Input
              id="gift-card-code"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setLocalError(null);
              }}
              placeholder={t.placeholder}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              disabled={disabled}
              aria-invalid={shownError ? true : undefined}
              aria-describedby={shownError ? 'gift-card-error' : 'gift-card-hint'}
              className={cn(inputClass, 'uppercase tracking-wide placeholder:normal-case')}
            />
            <button type="submit" className={smallButton} disabled={disabled}>
              {t.add}
            </button>
          </div>
        </form>
      )}
      {shownError ? (
        <FieldError id="gift-card-error">{shownError}</FieldError>
      ) : (
        <p id="gift-card-hint" className="m-0 text-xs leading-relaxed text-muted-grey">
          {t.hint(max)}
        </p>
      )}
    </div>
  );
}

/* ---------- Welcome offer hints ---------- */
export function WelcomeHint({
  quote,
  user,
  authStatus,
  loginHref,
  registerHref,
  compact,
}: {
  quote: QuoteState;
  user: User | null;
  authStatus: 'loading' | 'authenticated' | 'anonymous';
  /** Omit to hide the login/register links (e.g. when the forms are on the page) */
  loginHref?: string;
  registerHref?: string;
  compact?: boolean;
}) {
  const t = useMessages(pricingMessages).welcome;
  const { locale } = useLocale();
  const { refresh } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<'sent' | 'failed' | null>(null);
  const [rechecking, setRechecking] = useState(false);

  const welcome = quote.quote?.welcome ?? null;
  if (!welcome || authStatus === 'loading') return null;
  const pct = formatDiscount(welcome.discountType, welcome.discountValue, locale);

  if (welcome.eligible && quote.quote?.promotion?.kind === 'welcome') {
    return (
      <p className={cn('m-0 flex items-start gap-2 rounded-[12px] bg-mint p-3 text-sm font-semibold text-pine-dark', compact && 'text-xs')}>
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden="true" /> {t.applied(pct)}
      </p>
    );
  }

  if (welcome.reason === 'login_required' && authStatus === 'anonymous') {
    return (
      <div className={cn('grid gap-2 rounded-[12px] border border-sage bg-mint p-4 text-pine-dark', compact && 'p-3')}>
        <p className={cn('m-0 flex items-start gap-2 font-bold', compact ? 'text-sm' : 'text-[15px]')}>
          <Tag className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden="true" /> {t.guestTitle(pct)}
        </p>
        {!compact && <p className="m-0 text-sm leading-relaxed">{t.guestText}</p>}
        {registerHref && loginHref && (
          <div className="flex flex-wrap gap-2">
            <Link href={registerHref} className="button button-small min-h-[44px]">
              {t.register}
            </Link>
            <Link href={loginHref} className="button button-small button-quiet min-h-[44px]">
              {t.login}
            </Link>
          </div>
        )}
      </div>
    );
  }

  if (welcome.reason === 'verify_email' && user) {
    const resend = async () => {
      setSending(true);
      setSent(null);
      try {
        const res = await api.post<{ success: boolean; alreadyVerified?: boolean }>('/auth/resend-verification');
        if (res.alreadyVerified) await refresh();
        setSent(res.success ? 'sent' : 'failed');
      } catch {
        setSent('failed');
      } finally {
        setSending(false);
      }
    };
    const recheck = async () => {
      setRechecking(true);
      try {
        await refresh(); // emailVerified changes → the quote is requested again
        quote.retry();
      } finally {
        setRechecking(false);
      }
    };
    return (
      <div className={cn('grid gap-2 rounded-[12px] border border-amber-200 bg-amber-50 p-4 text-amber-950', compact && 'p-3')}>
        <p className={cn('m-0 flex items-start gap-2 font-bold', compact ? 'text-sm' : 'text-[15px]')}>
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {t.verifyTitle(pct)}
        </p>
        {!compact && <p className="m-0 text-sm leading-relaxed">{t.verifyText(user.email)}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={resend} disabled={sending} className="button button-small min-h-[44px]">
            {sending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {sending ? t.resending : t.resend}
          </button>
          <button type="button" onClick={recheck} disabled={rechecking} className="button button-small button-quiet min-h-[44px] !text-amber-950">
            <RefreshCw className={cn('h-4 w-4', rechecking && 'animate-spin')} aria-hidden="true" /> {t.recheck}
          </button>
        </div>
        <p className="m-0 text-xs font-semibold" role="status" aria-live="polite">
          {sent === 'sent' ? t.resent : sent === 'failed' ? t.resendFailed : ''}
        </p>
      </div>
    );
  }

  return null;
}
