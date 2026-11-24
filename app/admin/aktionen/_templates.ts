// Quick templates for seasonal promotions. They only prefill the form.
import type { DiscountType, LocalizedText, PromotionKind, PromotionPlacement, PromotionTheme } from '@/lib/types';

export type TemplateKey =
  | 'blackFriday'
  | 'christmas'
  | 'newYear'
  | 'valentine'
  | 'easter'
  | 'summer'
  | 'winter'
  | 'weekend'
  | 'welcome';

export interface PromotionTemplate {
  key: TemplateKey;
  name: string;
  kind: PromotionKind;
  code: string;
  discountType: DiscountType;
  /** percent value or cents */
  discountValue: number;
  maxDiscountCents?: number | null;
  minOrderCents?: number;
  firstBookingOnly?: boolean;
  requiresVerifiedEmail?: boolean;
  /** [month, day] start/end (inclusive end day) – null for open-ended */
  period: { start: [number, number]; end: [number, number] } | null;
  placement: PromotionPlacement;
  priority: number;
  theme: PromotionTheme;
  title: LocalizedText;
  text: LocalizedText;
  ctaText: LocalizedText;
  badge: LocalizedText;
}

const BOOK: LocalizedText = { de: 'Jetzt buchen', en: 'Book now', pl: 'Zarezerwuj teraz' };

export const TEMPLATES: PromotionTemplate[] = [
  {
    key: 'blackFriday',
    name: 'Black Friday',
    kind: 'campaign',
    code: 'BLACKFRIDAY',
    discountType: 'percent',
    discountValue: 20,
    maxDiscountCents: 5000,
    period: { start: [11, 24], end: [12, 1] },
    placement: 'hero',
    priority: 900,
    theme: 'sale',
    title: { de: 'Black Friday: 20 % auf deine Reinigung', en: 'Black Friday: 20% off your cleaning', pl: 'Black Friday: 20% zniżki na sprzątanie' },
    text: {
      de: 'Nur diese Woche – sichere dir jetzt deinen Termin mit Rabatt.',
      en: 'This week only – secure your discounted appointment now.',
      pl: 'Tylko w tym tygodniu – zarezerwuj termin ze zniżką.',
    },
    ctaText: BOOK,
    badge: { de: '-20 %', en: '-20%', pl: '-20%' },
  },
  {
    key: 'christmas',
    name: 'Weihnachten',
    kind: 'campaign',
    code: 'XMAS',
    discountType: 'percent',
    discountValue: 15,
    maxDiscountCents: 4000,
    period: { start: [12, 1], end: [12, 24] },
    placement: 'hero',
    priority: 800,
    theme: 'festive',
    title: { de: 'Strahlend sauber zum Fest', en: 'Sparkling clean for the holidays', pl: 'Lśniąco czysto na święta' },
    text: {
      de: 'Entspannt in die Feiertage: 15 % Rabatt auf alle Reinigungen im Dezember.',
      en: 'Relax into the holidays: 15% off all cleanings in December.',
      pl: 'Spokojne święta: 15% zniżki na wszystkie sprzątania w grudniu.',
    },
    ctaText: BOOK,
    badge: { de: 'Weihnachten', en: 'Christmas', pl: 'Święta' },
  },
  {
    key: 'newYear',
    name: 'Neujahr',
    kind: 'campaign',
    code: 'NEUJAHR',
    discountType: 'percent',
    discountValue: 10,
    period: { start: [12, 27], end: [1, 15] },
    placement: 'banner',
    priority: 700,
    theme: 'winter',
    title: { de: 'Frisch ins neue Jahr', en: 'A fresh start to the new year', pl: 'Świeży start w nowy rok' },
    text: {
      de: 'Starte sauber ins neue Jahr – 10 % auf deine nächste Reinigung.',
      en: 'Start the year clean – 10% off your next cleaning.',
      pl: 'Zacznij rok w czystości – 10% zniżki na kolejne sprzątanie.',
    },
    ctaText: BOOK,
    badge: { de: '-10 %', en: '-10%', pl: '-10%' },
  },
  {
    key: 'valentine',
    name: 'Valentinstag',
    kind: 'coupon',
    code: 'VALENTIN',
    discountType: 'fixed',
    discountValue: 1400,
    minOrderCents: 6000,
    period: { start: [2, 7], end: [2, 14] },
    placement: 'card',
    priority: 600,
    theme: 'spring',
    title: { de: 'Mehr Zeit zu zweit', en: 'More time for two', pl: 'Więcej czasu we dwoje' },
    text: {
      de: 'Wir putzen, ihr genießt: 14 € Rabatt mit dem Code VALENTIN.',
      en: 'We clean, you enjoy: €14 off with the code VALENTIN.',
      pl: 'My sprzątamy, wy odpoczywacie: 14 € zniżki z kodem VALENTIN.',
    },
    ctaText: BOOK,
    badge: { de: 'Valentinstag', en: "Valentine's", pl: 'Walentynki' },
  },
  {
    key: 'easter',
    name: 'Ostern',
    kind: 'campaign',
    code: 'OSTERN',
    discountType: 'percent',
    discountValue: 10,
    period: { start: [3, 23], end: [4, 20] },
    placement: 'banner',
    priority: 600,
    theme: 'spring',
    title: { de: 'Frühjahrsputz zu Ostern', en: 'Easter spring clean', pl: 'Wiosenne porządki na Wielkanoc' },
    text: {
      de: 'Der große Frühjahrsputz – 10 % günstiger bis nach Ostern.',
      en: 'The big spring clean – 10% off until after Easter.',
      pl: 'Wielkie wiosenne porządki – 10% taniej do po Wielkanocy.',
    },
    ctaText: BOOK,
    badge: { de: 'Ostern', en: 'Easter', pl: 'Wielkanoc' },
  },
  {
    key: 'summer',
    name: 'Sommer',
    kind: 'campaign',
    code: 'SOMMER',
    discountType: 'percent',
    discountValue: 10,
    period: { start: [6, 21], end: [8, 31] },
    placement: 'banner',
    priority: 500,
    theme: 'summer',
    title: { de: 'Sommer, Sonne, saubere Wohnung', en: 'Summer, sun, a clean home', pl: 'Lato, słońce, czyste mieszkanie' },
    text: {
      de: 'Mehr Zeit für den Sommer: 10 % auf alle Reinigungen.',
      en: 'More time for summer: 10% off all cleanings.',
      pl: 'Więcej czasu na lato: 10% zniżki na wszystkie sprzątania.',
    },
    ctaText: BOOK,
    badge: { de: 'Sommer', en: 'Summer', pl: 'Lato' },
  },
  {
    key: 'winter',
    name: 'Winter',
    kind: 'campaign',
    code: 'WINTER',
    discountType: 'percent',
    discountValue: 10,
    period: { start: [1, 16], end: [2, 28] },
    placement: 'banner',
    priority: 500,
    theme: 'winter',
    title: { de: 'Gemütlich durch den Winter', en: 'Cosy through the winter', pl: 'Przytulnie przez zimę' },
    text: {
      de: 'Drinnen soll es schön sein: 10 % auf Grundreinigungen.',
      en: 'Make indoors lovely: 10% off deep cleanings.',
      pl: 'W domu ma być pięknie: 10% zniżki na gruntowne sprzątanie.',
    },
    ctaText: BOOK,
    badge: { de: 'Winter', en: 'Winter', pl: 'Zima' },
  },
  {
    key: 'weekend',
    name: 'Wochenend-Angebot',
    kind: 'coupon',
    code: 'WOCHENENDE',
    discountType: 'fixed',
    discountValue: 1000,
    minOrderCents: 5000,
    period: null,
    placement: 'card',
    priority: 400,
    theme: 'pine',
    title: { de: 'Wochenende frei', en: 'Weekend off', pl: 'Wolny weekend' },
    text: {
      de: 'Buche jetzt und spare 10 € mit dem Code WOCHENENDE.',
      en: 'Book now and save €10 with the code WOCHENENDE.',
      pl: 'Zarezerwuj teraz i zaoszczędź 10 € z kodem WOCHENENDE.',
    },
    ctaText: BOOK,
    badge: { de: '-10 €', en: '-€10', pl: '-10 €' },
  },
  {
    key: 'welcome',
    name: 'Willkommensangebot',
    kind: 'welcome',
    code: '',
    discountType: 'percent',
    discountValue: 10,
    maxDiscountCents: 3000,
    firstBookingOnly: true,
    requiresVerifiedEmail: true,
    period: null,
    placement: 'banner',
    priority: 300,
    theme: 'pine',
    title: { de: '10 % auf deine erste Reinigung', en: '10% off your first cleaning', pl: '10% zniżki na pierwsze sprzątanie' },
    text: {
      de: 'Konto anlegen, E-Mail bestätigen – der Rabatt wird automatisch abgezogen.',
      en: 'Create an account, verify your email – the discount is applied automatically.',
      pl: 'Załóż konto, potwierdź e-mail – rabat zostanie naliczony automatycznie.',
    },
    ctaText: { de: 'Jetzt starten', en: 'Get started', pl: 'Zacznij teraz' },
    badge: { de: 'Neukunden', en: 'New customers', pl: 'Nowi klienci' },
  },
];

/**
 * Next occurrence of a template period as Berlin datetime-local strings.
 * `today` is YYYY-MM-DD (Berlin). Periods crossing New Year end in the next year.
 */
export function templatePeriod(tpl: PromotionTemplate, today: string): { startsAt: string; endsAt: string } {
  if (!tpl.period) return { startsAt: '', endsAt: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  const [sm, sd] = tpl.period.start;
  const [em, ed] = tpl.period.end;
  const crosses = em < sm || (em === sm && ed < sd);
  let year = Number(today.slice(0, 4));
  const endOf = (y: number) => `${crosses ? y + 1 : y}-${pad(em)}-${pad(ed)}`;
  // Already over this year? Use next year's occurrence.
  if (endOf(year) < today) year += 1;
  // A crossing period may still be running from last year (e.g. 5 Jan)
  if (crosses && endOf(year - 1) >= today) year -= 1;
  return { startsAt: `${year}-${pad(sm)}-${pad(sd)}T00:00`, endsAt: `${endOf(year)}T23:59` };
}
