// Helpers shared by the promotion, gift card and analytics admin pages.
import type { Locale } from '@/lib/i18n/config';
import { translateApiMessage } from '@/lib/i18n/api-errors';
import type { AdminPromotion, GiftCardStatus, PromotionTheme } from '@/lib/types';

import { centsToInput } from './labels';

// ---------------------------------------------------------------------------
// Europe/Berlin <-> datetime-local
// ---------------------------------------------------------------------------

const BERLIN_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const berlinParts = (date: Date) => {
  const parts = Object.fromEntries(BERLIN_PARTS.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour) % 24,
    mi: Number(parts.minute),
    s: Number(parts.second),
  };
};

/** Berlin wall-clock time of `date`, read as if it were UTC (ms) */
const berlinWallMs = (date: Date) => {
  const p = berlinParts(date);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
};

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO timestamp → "YYYY-MM-DDTHH:mm" in Berlin time (for <input type="datetime-local">) */
export function isoToBerlinLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const p = berlinParts(date);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/** "YYYY-MM-DDTHH:mm" (Berlin wall clock) → ISO timestamp, or null */
export function berlinLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  // Two passes handle the DST switch correctly
  let ts = asUtc - (berlinWallMs(new Date(asUtc)) - asUtc);
  ts = asUtc - (berlinWallMs(new Date(ts)) - ts);
  return new Date(ts).toISOString();
}

/** Berlin calendar day (YYYY-MM-DD) `days` before/after `base` (YYYY-MM-DD) */
export function shiftDay(base: string, days: number): string {
  const [y, mo, d] = base.split('-').map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** The first day of the current month for a YYYY-MM-DD day */
export const monthStart = (day: string) => `${day.slice(0, 7)}-01`;

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** "10 %" / "20,00 €" */
export function discountLabel(
  promo: Pick<AdminPromotion, 'discountType' | 'discountValue'>,
  euro: (cents: number) => string,
  number: (n: number, o?: Intl.NumberFormatOptions) => string
) {
  return promo.discountType === 'percent'
    ? `${number(promo.discountValue, { maximumFractionDigits: 2 })} %`
    : euro(promo.discountValue);
}

export const PROMO_STATE_CLASSES: Record<AdminPromotion['state'], string> = {
  live: 'bg-mint text-pine border-sage',
  scheduled: 'bg-sky-50 text-sky-800 border-sky-200',
  ended: 'bg-gray-100 text-gray-600 border-gray-200',
  inactive: 'bg-red-50 text-red-700 border-red-200',
};

export const GIFT_CARD_STATUS_CLASSES: Record<GiftCardStatus, string> = {
  pending_payment: 'bg-amber-50 text-amber-800 border-amber-200',
  active: 'bg-mint text-pine border-sage',
  redeemed: 'bg-gray-100 text-gray-700 border-gray-200',
  expired: 'bg-gray-100 text-gray-500 border-gray-200',
  disabled: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};

/** Banner look per theme (used by the admin live preview) */
export const THEME_CLASSES: Record<PromotionTheme, { box: string; badge: string; cta: string; muted: string }> = {
  pine: { box: 'bg-pine text-white', badge: 'bg-white/15 text-white', cta: 'bg-white text-pine', muted: 'text-white/80' },
  festive: {
    box: 'bg-gradient-to-r from-red-800 via-red-700 to-emerald-800 text-white',
    badge: 'bg-amber-300 text-red-900',
    cta: 'bg-white text-red-800',
    muted: 'text-white/85',
  },
  spring: {
    box: 'bg-gradient-to-r from-pink-100 via-rose-50 to-lime-100 text-charcoal',
    badge: 'bg-pink-500 text-white',
    cta: 'bg-pine text-white',
    muted: 'text-charcoal/75',
  },
  summer: {
    box: 'bg-gradient-to-r from-amber-200 via-yellow-200 to-orange-300 text-charcoal',
    badge: 'bg-orange-600 text-white',
    cta: 'bg-charcoal text-white',
    muted: 'text-charcoal/75',
  },
  autumn: {
    box: 'bg-gradient-to-r from-orange-800 via-amber-700 to-yellow-800 text-white',
    badge: 'bg-amber-200 text-orange-900',
    cta: 'bg-white text-orange-900',
    muted: 'text-white/85',
  },
  winter: {
    box: 'bg-gradient-to-r from-sky-800 via-blue-800 to-indigo-900 text-white',
    badge: 'bg-sky-200 text-sky-900',
    cta: 'bg-white text-sky-900',
    muted: 'text-white/85',
  },
  sale: {
    box: 'bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-800 text-white',
    badge: 'bg-yellow-400 text-neutral-950',
    cta: 'bg-yellow-400 text-neutral-950',
    muted: 'text-white/80',
  },
};

/** FIDX-7KQ2-M9TP-4WXC → FIDX-••••-••••-4WXC */
export function maskGiftCode(code: string) {
  const parts = code.split('-');
  if (parts.length < 3) return code.length > 4 ? `••••${code.slice(-4)}` : code;
  return parts.map((p, i) => (i === 0 || i === parts.length - 1 ? p : '••••')).join('-');
}

/** Cents → "12,50" (de/pl) or "12.50" (en) for prefilling inputs */
export const centsInput = (cents: number | null | undefined, locale: Locale) => {
  if (cents == null) return '';
  const value = centsToInput(cents);
  return locale === 'en' ? value.replace(',', '.') : value;
};

/**
 * Field-level server message → localized text. Known messages are translated;
 * zod's generic English texts become `fallback` for de/pl.
 */
export function fieldMessage(message: string, locale: Locale, fallback: string) {
  if (locale === 'en') return message;
  const translated = translateApiMessage(message, locale);
  const unknown = translateApiMessage('\u0000unknown', locale);
  return translated === unknown ? fallback : translated;
}
