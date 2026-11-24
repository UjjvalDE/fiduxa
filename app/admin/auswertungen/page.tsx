'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AnalyticsResponse } from '@/lib/types';
import { cn } from '@/lib/utils';

import { monthStart, shiftDay } from '../_components/promo-utils';
import { DetailSkeleton, ErrorState, PageHeader, SectionCard } from '../_components/states';
import { berlinToday, useApi, useQueryParams } from '../_components/use-api';
import analyticsMessages from './_messages';

const KEYS = ['from', 'to'] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_ORDER = ['payment_pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired'];
const STATUS_BAR: Record<string, string> = {
  payment_pending: 'bg-amber-400',
  confirmed: 'bg-sky-500',
  in_progress: 'bg-indigo-500',
  completed: 'bg-pine',
  cancelled: 'bg-red-400',
  expired: 'bg-gray-300',
};

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <span className="text-sm font-medium text-muted-grey">{label}</span>
      <span
        className={cn(
          'text-2xl font-bold tracking-tight tabular-nums',
          tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-pine' : 'text-pine-dark'
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-grey">{hint}</span>}
    </div>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xs font-semibold uppercase tracking-wider text-muted-grey">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Horizontal bar (plain CSS) */
function Bar({ label, value, pct, className }: { label: string; value: string; pct: number; className: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <span className="text-charcoal">{label}</span>
        <span className="font-semibold tabular-nums text-charcoal">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-cream" aria-hidden="true">
        <div className={cn('h-full rounded-full', className)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

function Analytics() {
  const t = useMessages(analyticsMessages);
  const f = useFormat();
  const today = berlinToday();
  const { values, setParams } = useQueryParams(KEYS);
  const from = DAY.test(values.from) ? values.from : shiftDay(today, -29);
  const to = DAY.test(values.to) ? values.to : today;
  const invalid = from > to;

  const { data, error, loading, reload } = useApi<AnalyticsResponse>(invalid ? null : `/admin/analytics${qs({ from, to })}`);

  const pct = (v: number | null | undefined) => (v == null ? '–' : `${f.number(v, { maximumFractionDigits: 1 })} %`);
  const presets: [string, string, string][] = [
    [t.presets.d7, shiftDay(today, -6), today],
    [t.presets.d30, shiftDay(today, -29), today],
    [t.presets.d90, shiftDay(today, -89), today],
    [t.presets.month, monthStart(today), today],
    [t.presets.year, `${today.slice(0, 4)}-01-01`, today],
  ];

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <fieldset className="flex flex-wrap items-end gap-3">
          <legend className="sr-only">{t.range}</legend>
          <div className="space-y-1.5">
            <Label htmlFor="range-from">{t.from}</Label>
            <Input id="range-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setParams({ from: e.target.value, to })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="range-to">{t.to}</Label>
            <Input id="range-to" type="date" value={to} min={from} onChange={(e) => e.target.value && setParams({ from, to: e.target.value })} />
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          {presets.map(([label, pFrom, pTo]) => {
            const active = pFrom === from && pTo === to;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() => setParams({ from: pFrom, to: pTo })}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-pine bg-mint text-pine-dark' : 'border-border bg-white text-pine hover:bg-mint'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {invalid ? (
        <ErrorState message={t.rangeError} />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <DetailSkeleton />
      ) : (
        <div className={cn('space-y-8', loading && 'opacity-60')} aria-busy={loading}>
          <p className="text-sm text-muted-grey">{t.showing(f.date(data.from), f.date(data.to))}</p>
          <AnalyticsBody data={data} pct={pct} />
        </div>
      )}
    </>
  );
}

function AnalyticsBody({ data, pct }: { data: AnalyticsResponse; pct: (v: number | null | undefined) => string }) {
  const t = useMessages(analyticsMessages);
  const f = useFormat();
  const r = data.revenue;
  const p = data.promotions;
  const g = data.giftCards;
  const ft = data.firstTimeCustomers;
  const maxRevenue = Math.max(1, r.beforeDiscountCents);
  const statuses = STATUS_ORDER.filter((s) => data.bookings.byStatus[s]).concat(
    Object.keys(data.bookings.byStatus).filter((s) => !STATUS_ORDER.includes(s))
  );
  const maxStatus = Math.max(1, ...Object.values(data.bookings.byStatus));
  const maxRedemptions = Math.max(1, ...p.byPromotion.map((x) => x.redemptions));

  return (
    <>
      <Group id="g-bookings" title={t.groups.bookings}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi label={t.conversion} value={pct(data.bookings.conversionRatePct)} hint={t.conversionHint(data.bookings.converted, data.bookings.created)} />
          <Kpi label={t.bookings} value={f.number(data.bookings.converted)} hint={t.bookingsHint} />
          <Kpi label={t.created} value={f.number(data.bookings.created)} />
        </div>
        {statuses.length > 0 && (
          <SectionCard title={t.statusChart}>
            <div className="space-y-3">
              {statuses.map((s) => (
                <Bar
                  key={s}
                  label={t.status[s] ?? s}
                  value={f.number(data.bookings.byStatus[s])}
                  pct={(data.bookings.byStatus[s] / maxStatus) * 100}
                  className={STATUS_BAR[s] ?? 'bg-sage'}
                />
              ))}
            </div>
          </SectionCard>
        )}
      </Group>

      <Group id="g-revenue" title={t.groups.revenue}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi label={t.revenueBefore} value={f.euro(r.beforeDiscountCents)} />
          <Kpi label={t.promoDiscount} value={`− ${f.euro(r.promotionDiscountCents)}`} tone="bad" />
          <Kpi label={t.revenueAfter} value={f.euro(r.afterDiscountCents)} />
          <Kpi label={t.paidGift} value={f.euro(r.paidWithGiftCardsCents)} />
          <Kpi label={t.collected} value={f.euro(r.collectedCents)} tone="good" />
        </div>
        <SectionCard title={t.revenueChart} description={t.revenueHint}>
          <div className="space-y-3">
            <Bar label={t.revenueBefore} value={f.euro(r.beforeDiscountCents)} pct={100} className="bg-sage" />
            <Bar
              label={t.promoDiscount}
              value={`− ${f.euro(r.promotionDiscountCents)}`}
              pct={(r.promotionDiscountCents / maxRevenue) * 100}
              className="bg-red-400"
            />
            <Bar label={t.revenueAfter} value={f.euro(r.afterDiscountCents)} pct={(r.afterDiscountCents / maxRevenue) * 100} className="bg-sky-500" />
            <Bar
              label={t.paidGift}
              value={f.euro(r.paidWithGiftCardsCents)}
              pct={(r.paidWithGiftCardsCents / maxRevenue) * 100}
              className="bg-amber-400"
            />
            <Bar label={t.collected} value={f.euro(r.collectedCents)} pct={(r.collectedCents / maxRevenue) * 100} className="bg-pine" />
          </div>
        </SectionCard>
      </Group>

      <Group id="g-promotions" title={t.groups.promotions}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            label={t.redemptions}
            value={f.number(p.redemptions)}
            hint={p.redemptions ? t.avgDiscount(f.euro(Math.round(p.discountCents / p.redemptions))) : undefined}
          />
          <Kpi label={t.discountTotal} value={f.euro(p.discountCents)} />
          <Kpi label={t.newCustomers} value={f.number(ft.newCustomers)} />
          <Kpi
            label={t.welcomeApplied}
            value={f.number(ft.welcomeApplied)}
            hint={
              ft.newCustomers
                ? `${t.welcomeRate(pct(Math.round((ft.welcomeApplied / ft.newCustomers) * 1000) / 10))} · ${t.welcomeHint(ft.welcomeReserved, ft.welcomeReleased)}`
                : t.welcomeHint(ft.welcomeReserved, ft.welcomeReleased)
            }
          />
        </div>
        <SectionCard
          title={t.campaigns}
          actions={
            <Link href="/admin/aktionen" className="inline-flex items-center gap-1 text-sm font-semibold text-pine hover:underline">
              {t.links.promotions}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        >
          {p.byPromotion.length === 0 ? (
            <p className="text-sm text-muted-grey">{t.noCampaigns}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">{t.campaignsCaption}</caption>
                <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">{t.colPromotion}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">{t.colRedemptions}</th>
                    <th scope="col" className="w-40 px-3 py-2 font-semibold">{t.colShare}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">{t.colDiscount}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">{t.colOrder}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">{t.colRate}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.byPromotion.map((row) => {
                    const promo = row.promotion;
                    const exists = Boolean(promo.kind);
                    return (
                      <tr key={promo._id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          {exists ? (
                            <Link href={`/admin/aktionen/${promo._id}`} className="font-semibold text-pine hover:underline">
                              {promo.name}
                            </Link>
                          ) : (
                            <span className="text-muted-grey">{t.deleted}</span>
                          )}
                          <div className="text-xs text-muted-grey">
                            {promo.kind ? t.kinds[promo.kind] : ''}
                            {promo.code ? ` · ${promo.code}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{f.number(row.redemptions)}</td>
                        <td className="px-3 py-2">
                          <div className="h-2 overflow-hidden rounded-full bg-cream" aria-hidden="true">
                            <div className="h-full rounded-full bg-pine" style={{ width: `${(row.redemptions / maxRedemptions) * 100}%` }} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{f.euro(row.discountCents)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{f.euro(row.orderCents)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.orderCents ? pct(Math.round((row.discountCents / row.orderCents) * 1000) / 10) : '–'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </Group>

      <Group id="g-gift" title={t.groups.giftCards}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label={t.giftSold} value={f.number(g.soldCount)} hint={t.giftSoldHint} />
          <Kpi label={t.giftSoldValue} value={f.euro(g.soldCents)} />
          <Kpi
            label={t.giftRedemption}
            value={pct(g.redemptionPct)}
            hint={t.giftRedemptionHint(f.euro(g.allTimeIssuedCents - g.allTimeOpenCents), f.euro(g.allTimeIssuedCents))}
          />
          <Kpi label={t.giftOpen} value={f.euro(g.allTimeOpenCents)} />
        </div>
        {g.allTimeIssuedCents > 0 && (
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <Bar label={t.giftRedemption} value={pct(g.redemptionPct)} pct={g.redemptionPct ?? 0} className="bg-amber-400" />
          </div>
        )}
        <Link href="/admin/gutscheine" className="inline-flex items-center gap-1 text-sm font-semibold text-pine hover:underline">
          {t.links.giftCards}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Group>
    </>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Analytics />
    </Suspense>
  );
}
