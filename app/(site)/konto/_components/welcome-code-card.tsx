'use client';

// "Mein Willkommenscode": the customer's personal, single-use welcome code
// (issued after email verification). Shown only to its owner.
import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Gift } from 'lucide-react';

import { useAuth } from '@/lib/auth';
import { defineMessages } from '@/lib/i18n/config';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import type { WelcomeCodeInfo } from '@/lib/types';
import { useApi } from '@/app/admin/_components/use-api';
import { formatDiscount } from '../../_shared/promotions';

const messages = defineMessages({
  de: {
    statusTitle: 'Dein Willkommenscode',
    title: (pct: string) => `Dein persönlicher Willkommenscode (${pct})`,
    text: 'Gib ihn bei deiner ersten Buchung im Feld „Rabattcode“ ein. Er gilt nur für dein Konto und einmalig.',
    until: (date: string) => `Gültig bis ${date}`,
    copy: 'Code kopieren',
    copied: 'Kopiert',
    book: 'Jetzt buchen',
    reserved: 'Der Code ist für eine offene Buchung reserviert.',
    used: 'Du hast deinen Willkommenscode bereits eingelöst – danke!',
    expired: 'Dein Willkommenscode ist abgelaufen.',
  },
  en: {
    statusTitle: 'Your welcome code',
    title: (pct) => `Your personal welcome code (${pct})`,
    text: 'Enter it in the "Promo code" field on your first booking. It only works for your account and once.',
    until: (date) => `Valid until ${date}`,
    copy: 'Copy code',
    copied: 'Copied',
    book: 'Book now',
    reserved: 'The code is reserved for an open booking.',
    used: 'You have already used your welcome code – thank you!',
    expired: 'Your welcome code has expired.',
  },
  pl: {
    statusTitle: 'Twój kod powitalny',
    title: (pct) => `Twój osobisty kod powitalny (${pct})`,
    text: 'Wpisz go przy pierwszej rezerwacji w polu „Kod rabatowy”. Działa tylko dla Twojego konta i jednorazowo.',
    until: (date) => `Ważny do ${date}`,
    copy: 'Kopiuj kod',
    copied: 'Skopiowano',
    book: 'Zarezerwuj teraz',
    reserved: 'Kod jest zarezerwowany dla otwartej rezerwacji.',
    used: 'Twój kod powitalny został już wykorzystany – dziękujemy!',
    expired: 'Twój kod powitalny wygasł.',
  },
});

export function WelcomeCodeCard() {
  const { user } = useAuth();
  const t = useMessages(messages);
  const f = useFormat();
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const show = user?.role === 'consumer' && user.emailVerified === true;
  const { data } = useApi<{ welcome: WelcomeCodeInfo | null }>(show ? '/users/me/welcome-code' : null);
  const w = data?.welcome;
  if (!show || !w || w.status === 'verify_email' || w.status === 'revoked') return null;

  const pct = w.discountType && w.discountValue != null ? formatDiscount(w.discountType, w.discountValue, locale) : '';

  if (w.status !== 'issued' || !w.code) {
    // Reserved / used ("eingelöst") / expired ("abgelaufen"): the code is not
    // usable right now – say clearly why instead of hiding the card.
    const note = w.status === 'reserved' ? t.reserved : w.status === 'used' ? t.used : w.status === 'expired' ? t.expired : null;
    if (!note) return null; // issued without code (still being created) or unknown status
    return (
      <section className="mb-6 rounded-2xl border border-border bg-white p-4 sm:p-5" aria-labelledby="welcome-code-title">
        <h2 id="welcome-code-title" className="m-0 flex items-center gap-2 text-base font-bold text-pine-dark">
          <Gift className="h-5 w-5 text-pine" aria-hidden="true" /> {t.statusTitle}
        </h2>
        <p className="mb-0 mt-1 text-sm text-muted-grey">{note}</p>
      </section>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(w.code as string);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-sage bg-mint p-4 text-pine-dark sm:p-5" aria-labelledby="welcome-code-title">
      <h2 id="welcome-code-title" className="m-0 flex items-center gap-2 text-base font-bold">
        <Gift className="h-5 w-5 text-pine" aria-hidden="true" /> {t.title(pct)}
      </h2>
      <p className="mb-3 mt-1 text-sm">{t.text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-white px-3 py-2 font-mono text-lg font-bold tracking-widest">{w.code}</code>
        <button type="button" onClick={copy} className="button button-small button-quiet min-h-[44px]">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? t.copied : t.copy}
        </button>
        <Link href={`/buchung?code=${encodeURIComponent(w.code)}`} className="button button-small min-h-[44px]">
          {t.book}
        </Link>
      </div>
      {w.expiresAt && <p className="mb-0 mt-2 text-xs">{t.until(f.date(w.expiresAt))}</p>}
    </section>
  );
}
