// Helpers for promotion data from the API (GET /promotions/active, quotes).
// Safe for server and client components (no hooks).
import type { Locale } from '@/lib/i18n/config';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { DiscountType, LocalizedText } from '@/lib/types';

/** Text for the current language, falling back to German, then any language */
export function pickText(text: LocalizedText | null | undefined, locale: Locale): string {
  if (!text) return '';
  return (text[locale] || text.de || text.en || text.pl || '').trim();
}

/** 10 → "10 %" (de) / "10%" (en, pl) */
export function formatPct(value: number, locale: Locale): string {
  const n = value.toLocaleString(INTL_LOCALE[locale], { maximumFractionDigits: 1 });
  return locale === 'de' ? `${n} %` : `${n}%`;
}

/** Discount value as text: percent → "10 %", fixed (cents) → "5,00 €" */
export function formatDiscount(type: DiscountType, value: number, locale: Locale): string {
  if (type === 'percent') return formatPct(value, locale);
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'currency', currency: 'EUR' }).format(value / 100);
}

/** End of a campaign as a Berlin calendar day, e.g. "24.12." (de) / "24/12" (en) */
export function formatEndDay(endsAt: string | null | undefined, locale: Locale): string | null {
  if (!endsAt) return null;
  const date = new Date(endsAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(INTL_LOCALE[locale], { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' });
}

/** Masked gift card code from its last 4 characters */
export const maskedGiftCode = (last4: string) => `FIDX-••••-••••-${last4}`;

/** Server-side gift card code normalisation (FIDX prefix optional, 12 characters) */
export function normalizeGiftCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.startsWith('FIDX') ? raw.slice(4) : raw;
}

/** Only same-site relative links from API data (CTA hrefs) */
export function safeHref(href: string | null | undefined, fallback = '/buchung'): string {
  if (!href) return fallback;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (/^https:\/\//i.test(href)) return href;
  return fallback;
}

/** Real timestamp as a Berlin calendar date, e.g. "31.12.2029" */
export function formatBerlinDate(iso: string | null | undefined, locale: Locale, long = false): string {
  if (!iso) return '–';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleDateString(
    INTL_LOCALE[locale],
    long ? { timeZone: 'Europe/Berlin', day: 'numeric', month: 'long', year: 'numeric' } : { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }
  );
}
