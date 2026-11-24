'use client';

import Link from 'next/link';
import { ArrowRight, Banknote, CalendarX2, Check, Clock3, CreditCard, HandCoins, LoaderCircle, Percent, Receipt, Tag } from 'lucide-react';

import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import catalogue from '@/lib/i18n/messages/catalogue';
import common from '@/lib/i18n/messages/common';
import type { Condition, Frequency } from '@/lib/types';
import { formatPercent, usePricing } from '../../_shared/use-pricing';
import messages from '../_messages';

const CONDITIONS: Condition[] = ['basic', 'normal', 'moderate', 'heavy'];

// Fallbacks mirror server/src/config/pricing.js until GET /pricing has loaded.
const FALLBACK = {
  areaM2PerHour: 30,
  minimumMinutes: 120,
  maximumMinutes: 720,
  durationStepMinutes: 30,
  holdMinutes: 35,
  cancellationCutoffHours: 24,
};

function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`inline-block animate-pulse rounded bg-mint align-middle ${className}`} aria-hidden="true" />;
}

/** Hourly rate, minimum charge, condition factors, discounts and VAT – all from GET /pricing. */
export function PricingOverview() {
  const { pricing, loading, error } = usePricing();
  const t = useMessages(messages).overview;
  const c = useMessages(common);
  const f = useFormat();
  const factor = (n: number) => f.number(n, { maximumFractionDigits: 2 });

  const discounts = pricing
    ? (Object.entries(pricing.frequencyDiscount) as [Frequency, number][]).filter(([, rate]) => rate > 0)
    : [];

  return (
    <div aria-busy={loading}>
      {error && (
        <p role="alert" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {t.loadError}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-white p-6">
          <Banknote size={22} strokeWidth={1.75} className="text-pine" aria-hidden="true" />
          <h3 className="!mb-1 !mt-4 text-sm font-bold uppercase tracking-wider text-muted-grey">{t.hourlyRate}</h3>
          <p className="m-0 text-3xl font-extrabold tracking-tight text-pine-dark">
            {pricing ? f.euro(pricing.hourlyRateCents) : loading ? <Skeleton className="h-8 w-28" /> : '–'}
          </p>
          <p className="mb-0 mt-2 text-sm leading-relaxed text-muted-grey">{t.hourlyRateText}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-6">
          <Clock3 size={22} strokeWidth={1.75} className="text-pine" aria-hidden="true" />
          <h3 className="!mb-1 !mt-4 text-sm font-bold uppercase tracking-wider text-muted-grey">{t.minimum}</h3>
          <p className="m-0 text-3xl font-extrabold tracking-tight text-pine-dark">
            {pricing ? f.hours(pricing.minimumMinutes) : loading ? <Skeleton className="h-8 w-24" /> : '–'}
          </p>
          <p className="mb-0 mt-2 text-sm leading-relaxed text-muted-grey">
            {pricing ? t.minimumText(f.euro(pricing.minimumChargeCents)) : t.minimumFallback}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-6">
          <Receipt size={22} strokeWidth={1.75} className="text-pine" aria-hidden="true" />
          <h3 className="!mb-1 !mt-4 text-sm font-bold uppercase tracking-wider text-muted-grey">{t.taxes}</h3>
          <p className="m-0 text-lg font-bold leading-snug text-pine-dark">
            {pricing ? pricing.pricesIncludeVat ? t.inclVat : t.vatAtBooking : loading ? <Skeleton className="h-6 w-40" /> : '–'}
          </p>
          <p className="mb-0 mt-2 text-sm leading-relaxed text-muted-grey">{t.noHiddenFees}</p>
        </div>
      </div>

      {pricing && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-white p-6">
            <h3 className="!m-0 text-lg font-bold text-pine-dark">{t.conditionTitle}</h3>
            <p className="mt-2 text-sm text-muted-grey">{t.conditionText}</p>
            <ul className="m-0 grid gap-2 p-0">
              {CONDITIONS.map((key) => (
                <li key={key} className="flex items-center justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
                  <span>
                    <strong className="text-pine-dark">{c.conditions[key].label}</strong>
                    <span className="block text-xs text-muted-grey">{c.conditions[key].hint}</span>
                  </span>
                  <span className="font-bold tabular-nums text-pine">× {factor(pricing.conditionFactor[key])}</span>
                </li>
              ))}
            </ul>
          </div>
          {discounts.length > 0 && (
            <div className="rounded-2xl border border-border bg-white p-6">
              <h3 className="!m-0 flex items-center gap-2 text-lg font-bold text-pine-dark">
                <Percent size={18} strokeWidth={1.75} aria-hidden="true" /> {t.discountTitle}
              </h3>
              <p className="mt-2 text-sm text-muted-grey">{t.discountText}</p>
              <ul className="m-0 grid gap-2 p-0">
                {discounts.map(([freq, rate]) => (
                  <li key={freq} className="flex items-center gap-2 text-sm">
                    <Check size={15} className="text-pine" aria-hidden="true" />
                    <strong className="text-pine-dark">{c.frequencies[freq]}:</strong> {t.discountItem(formatPercent(rate, f))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Fixed price, Stripe payment with slot hold, free cancellation with automatic refund. */
export function PaymentFacts() {
  const { pricing } = usePricing();
  const t = useMessages(messages).payment;
  const hold = pricing?.holdMinutes ?? FALLBACK.holdMinutes;
  const cutoff = pricing?.cancellationCutoffHours ?? FALLBACK.cancellationCutoffHours;

  const cards = [
    { icon: Tag, title: t.fixedTitle, text: t.fixedText },
    { icon: CreditCard, title: t.payTitle, text: t.payText(hold) },
    ...(pricing?.cashEnabled ? [{ icon: HandCoins, title: t.cashTitle, text: t.cashText }] : []),
    { icon: CalendarX2, title: t.cancelTitle, text: t.cancelText(cutoff) },
  ];

  return (
    <div>
      <ul className={`m-0 grid list-none gap-4 p-0 ${cards.length === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`}>
        {cards.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-2xl border border-border bg-white p-6">
            <span className="service-icon !mb-5">
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h3 className="!m-0 text-lg font-bold text-pine-dark">{title}</h3>
            <p className="mb-0 mt-2 text-sm leading-relaxed text-muted-grey">{text}</p>
          </li>
        ))}
      </ul>
      <p className="mb-0 mt-5 text-xs leading-relaxed text-muted-grey">{t.invoiceNote}</p>
    </div>
  );
}

const TABLE_HOURS = [2, 3, 4, 5, 6, 8];

/** "25 € pro Stunde, mindestens 2 Std." + duration → price table with frequency discounts (GET /pricing). */
export function HourlyPriceTable() {
  const { pricing, loading, error } = usePricing();
  const t = useMessages(messages).table;
  const tOverview = useMessages(messages).overview;
  const c = useMessages(common);
  const f = useFormat();

  if (!pricing) {
    return error ? (
      <p role="alert" className="m-0 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {tOverview.loadError}
      </p>
    ) : loading ? (
      <p className="m-0 flex items-center gap-2 text-sm text-muted-grey" role="status">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.loading}
      </p>
    ) : null;
  }

  const hours = TABLE_HOURS.filter((h) => h * 60 >= pricing.minimumMinutes && h * 60 <= pricing.maximumMinutes);
  const discounts = (Object.entries(pricing.frequencyDiscount) as [Frequency, number][]).filter(([, rate]) => rate > 0);
  const price = (h: number, discount = 0) => {
    const labour = Math.round(h * pricing.hourlyRateCents);
    return labour - Math.round(labour * discount);
  };

  return (
    <div className="grid gap-6">
      <p className="m-0 rounded-2xl bg-pine p-5 text-lg font-bold leading-snug text-white sm:text-xl">
        {t.headline(f.euro(pricing.hourlyRateCents), f.hours(pricing.minimumMinutes))}
      </p>
      <p className="m-0 max-w-3xl text-[15px] leading-relaxed text-muted-grey">{t.lead}</p>
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[420px] border-collapse text-left text-sm">
          <caption className="sr-only">{t.caption}</caption>
          <thead className="bg-cream text-xs uppercase tracking-wider text-muted-grey">
            <tr>
              <th scope="col" className="px-4 py-3 font-bold">
                {t.colDuration}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-bold">
                {t.colOnce}
              </th>
              {discounts.map(([freq, rate]) => (
                <th key={freq} scope="col" className="px-4 py-3 text-right font-bold">
                  {t.colFrequency(c.frequencies[freq], formatPercent(rate, f))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h} className="border-t border-border">
                <th scope="row" className="px-4 py-3 font-bold text-pine-dark">
                  {f.hours(h * 60)}
                </th>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-pine-dark">{f.euro(price(h))}</td>
                {discounts.map(([freq, rate]) => (
                  <td key={freq} className="px-4 py-3 text-right tabular-nums text-pine">
                    {f.euro(price(h, rate))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-xs leading-relaxed text-muted-grey">
          {t.note}
          {pricing.pricesIncludeVat ? ` ${tOverview.inclVat}` : ''}
        </p>
        <Link href="/buchung" className="button shrink-0">
          {t.cta} <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/** Step-by-step explanation of the recommended duration, with live pricing parameters. */
export function DurationSteps() {
  const { pricing } = usePricing();
  const t = useMessages(messages).steps;
  const c = useMessages(common);
  const f = useFormat();

  const perHour = f.number(pricing?.areaM2PerHour ?? FALLBACK.areaM2PerHour);
  const step = pricing?.durationStepMinutes ?? FALLBACK.durationStepMinutes;
  const minimum = f.hours(pricing?.minimumMinutes ?? FALLBACK.minimumMinutes);
  const maximum = f.hours(pricing?.maximumMinutes ?? FALLBACK.maximumMinutes);

  const steps: [string, string][] = [
    [t.area, t.areaText(perHour)],
    [t.condition, t.conditionText(c.conditions.basic.label, c.conditions.heavy.label)],
    [t.extras, t.extrasText],
    [t.rounding, t.roundingText(step, minimum)],
    [t.adjust, t.adjustText(minimum, maximum)],
  ];

  return (
    <>
      <ol className="mt-8 grid list-none gap-5 p-0">
        {steps.map(([title, text], index) => (
          <li key={title} className="flex gap-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pine text-xs font-extrabold text-white" aria-hidden="true">
              {index + 1}
            </span>
            <span>
              <strong className="block text-pine-dark">{title}</strong>
              <span className="text-sm leading-relaxed text-muted-grey">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-8 rounded-xl border border-border bg-white p-4 text-sm leading-relaxed text-muted-grey">
        <strong className="text-pine-dark">{t.formulaLabel}</strong> {t.formula(perHour, step, minimum)}
      </p>
    </>
  );
}

/** Worked example: 75 m², normal, fridge 25 min + oven 40 min → recommended duration and fixed price. */
export function WorkedExample() {
  const { pricing } = usePricing();
  const { locale } = useLocale();
  const t = useMessages(messages).example;
  const c = useMessages(common);
  const f = useFormat();
  const extrasText = catalogue[locale].extras;

  const area = 75;
  const perHour = pricing?.areaM2PerHour ?? FALLBACK.areaM2PerHour;
  const step = pricing?.durationStepMinutes ?? FALLBACK.durationStepMinutes;
  const factorNormal = pricing?.conditionFactor.normal ?? 1;
  const areaMinutes = Math.round((area / perHour) * 60);
  const base = Math.round((area / perHour) * 60 * factorNormal);
  const extras = 25 + 40;
  const raw = base + extras;
  const rounded = Math.min(
    pricing?.maximumMinutes ?? FALLBACK.maximumMinutes,
    Math.max(pricing?.minimumMinutes ?? FALLBACK.minimumMinutes, Math.ceil(raw / step) * step)
  );
  const fridge = extrasText['inside-fridge'].label;
  const oven = extrasText['inside-oven'].label;
  const min = c.units.minutesShort;

  const steps: [string, string][] = [
    [t.stepArea(area, f.number(perHour)), min(areaMinutes)],
    [t.stepCondition(c.conditions.normal.label, f.number(factorNormal, { maximumFractionDigits: 2 })), min(base)],
    [t.stepExtras(fridge, oven, `${min(25)} + ${min(40)}`), `+ ${min(extras)}`],
    [t.subtotal, min(raw)],
    [t.rounded(step), f.hours(rounded)],
  ];

  return (
    <div className="price-panel">
      <div className="price-panel-top">
        <div>
          <span className="price-label">{t.label}</span>
          <strong className="price-value">{f.hours(rounded)}</strong>
          <span className="price-unit">
            {pricing ? t.unit(f.euro(Math.round((rounded / 60) * pricing.hourlyRateCents)), f.euro(pricing.hourlyRateCents)) : t.unitFallback}
          </span>
        </div>
        <div className="price-icon">
          <Clock3 size={25} aria-hidden="true" />
        </div>
      </div>
      <div className="price-divider" />
      {steps.map(([label, value]) => (
        <div className="price-row" key={label}>
          <span>{label}</span>
          <small className="!text-xs !text-white/80 tabular-nums">{value}</small>
        </div>
      ))}
      <div className="price-disclaimer">
        {t.disclaimer(area, fridge, oven)}
        {pricing?.pricesIncludeVat ? t.inclVat : ''}
      </div>
    </div>
  );
}
