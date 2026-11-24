'use client';

// Finance dashboard: today / month / year / all-time P&L from completed
// cleanings, where the revenue goes, monthly trend and revenue mix.
// Colors: validated categorical slots (dataviz palette), fixed per entity.
import { Suspense, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, PiggyBank, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { api, qs } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { FinanceAssumptions, FinanceOverview, FinancePeriod, FinanceSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ErrorState, ListSkeleton, NativeSelect, PageHeader } from '../_components/states';
import { useApi, useErrorText, useQueryParams } from '../_components/use-api';
import messages from './_messages';

// One color per entity across the whole page (validated: light surface,
// adjacent order of the split bar + the trend pair both pass all gates).
const COLOR = {
  cleanerPay: '#1baf7a', // aqua
  vat: '#eda100', // yellow
  fees: '#008300', // green
  fixed: '#6250d6', // violet
  tax: '#e87ba4', // magenta
  profit: '#2a78d6', // blue – profit after tax everywhere
  commission: '#eb6834', // orange
  gross: '#8b918d', // neutral reference line (de-emphasis gray)
} as const;
// Readable ink on each fill (labels never use the series color)
const INK_ON: Record<string, string> = {
  [COLOR.cleanerPay]: '#0b2a1f',
  [COLOR.vat]: '#2b1d00',
  [COLOR.fees]: '#ffffff',
  [COLOR.fixed]: '#ffffff',
  [COLOR.tax]: '#3a0d1f',
  [COLOR.profit]: '#ffffff',
};

const PERIODS: FinancePeriod[] = ['today', 'month', 'year', 'all'];
const KEYS = ['period', 'year'] as const;

export default function FinancePage() {
  return (
    <Suspense fallback={null}>
      <FinanceDashboard />
    </Suspense>
  );
}

function FinanceDashboard() {
  const t = useMessages(messages);
  const f = useFormat();
  const { values, setParams } = useQueryParams(KEYS);
  const period = (PERIODS as string[]).includes(values.period) ? (values.period as FinancePeriod) : 'month';
  const { data, error, loading, reload } = useApi<FinanceOverview>(`/admin/finance${qs({ period, year: values.year || undefined })}`);

  const periodLabel = (p: FinancePeriod) => (p === 'year' && data ? t.yearLabel(data.year) : t.periods[p]);

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      {/* Filters: one row above everything they control */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label={t.title} className="inline-flex rounded-xl border border-border bg-white p-1 shadow-sm">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setParams({ period: p, year: values.year || null })}
              className={cn(
                'min-h-[40px] rounded-lg px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                period === p ? 'bg-pine text-white' : 'text-pine-dark hover:bg-mint'
              )}
            >
              {periodLabel(p)}
            </button>
          ))}
        </div>
        {data && data.years.length > 1 && (
          <div className="w-32">
            <NativeSelect
              aria-label={t.yearLabel(data.year)}
              value={String(data.year)}
              onChange={(e) => setParams({ period, year: e.target.value })}
            >
              {data.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {loading && data && <Loader2 className="mb-2.5 h-4 w-4 animate-spin text-muted-grey" aria-label={t.loading} />}
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton label={t.loading} rows={5} />
      ) : (
        <div className="space-y-6">
          <HeroRow data={data} period={period} periodLabel={periodLabel(period)} />
          <PeriodTable data={data} periodLabel={periodLabel} />
          <div className="grid gap-6 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <SplitCard summary={data.breakdown} periodLabel={periodLabel(period)} />
            </div>
            <div className="space-y-6 xl:col-span-2">
              <RankedBars title={t.serviceTitle} rows={data.byService} labelOf={(k) => serviceName(k)} />
              <RankedBars title={t.methodTitle} rows={data.byMethod} labelOf={(k) => t.methods[k] ?? k} showFees />
            </div>
          </div>
          <TrendCard data={data} />
          <AssumptionsCard assumptions={data.assumptions} onSaved={reload} />
          <p className="text-xs text-muted-grey">{t.estimateNote}</p>
        </div>
      )}
    </>
  );

  function serviceName(key: string) {
    return f.locale === 'de'
      ? ({ 'home-cleaning': 'Wohnungsreinigung', 'deep-cleaning': 'Grundreinigung', 'end-of-tenancy': 'Umzugsreinigung' } as Record<string, string>)[key] ?? key
      : f.locale === 'pl'
        ? ({ 'home-cleaning': 'Sprzątanie mieszkania', 'deep-cleaning': 'Sprzątanie gruntowne', 'end-of-tenancy': 'Sprzątanie po wyprowadzce' } as Record<string, string>)[key] ?? key
        : ({ 'home-cleaning': 'Home cleaning', 'deep-cleaning': 'Deep cleaning', 'end-of-tenancy': 'Move-out cleaning' } as Record<string, string>)[key] ?? key;
  }
}

// ---------------------------------------------------------------------------
// Hero number + supporting tiles
// ---------------------------------------------------------------------------
function HeroRow({ data, period, periodLabel }: { data: FinanceOverview; period: FinancePeriod; periodLabel: string }) {
  const t = useMessages(messages);
  const f = useFormat();
  const s = data.breakdown;
  const share = s.grossCents > 0 ? `${((s.commissionCents / s.grossCents) * 100).toLocaleString(f.locale, { maximumFractionDigits: 1 })} %` : '–';
  const negative = s.profitAfterTaxCents < 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.heroLabel(periodLabel)}</p>
        <p className={cn('mt-1 text-3xl font-bold tabular-nums', negative ? 'text-red-700' : 'text-pine-dark')}>{f.euro(s.profitAfterTaxCents)}</p>
        <p className="mt-1 text-sm text-muted-grey">
          {t.rows.margin}: {s.marginPct == null ? '–' : `${s.marginPct.toLocaleString(f.locale)} %`}
        </p>
      </div>
      <Tile label={t.rows.gross} value={f.euro(s.grossCents)} hint={t.bookingsCount(s.bookings)} />
      <Tile label={t.rows.commission} value={f.euro(s.commissionCents)} hint={t.commissionShare(share)} />
      <div className="grid gap-4 sm:col-span-2 xl:col-span-1">
        <Tile compact icon={CalendarClock} label={t.pipelineTitle} value={f.euro(data.pipeline.cents)} hint={t.pipelineHint(data.pipeline.bookings)} />
        <Tile compact icon={RotateCcw} label={t.refundsTitle} value={f.euro(data.refunds.cents)} hint={t.refundsHint(data.refunds.count)} />
      </div>
      {period === 'today' && s.bookings === 0 && <span className="sr-only">{t.splitEmpty}</span>}
    </div>
  );
}

function Tile({ label, value, hint, compact, icon: Icon }: { label: string; value: string; hint?: string; compact?: boolean; icon?: typeof PiggyBank }) {
  return (
    <div className={cn('rounded-2xl border border-border bg-white shadow-sm', compact ? 'p-4' : 'p-5')}>
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-grey">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        {label}
      </p>
      <p className={cn('mt-1 font-bold tabular-nums text-pine-dark', compact ? 'text-lg' : 'text-2xl')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-grey">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today | Month | Year | All – the full P&L side by side
// ---------------------------------------------------------------------------
function PeriodTable({ data, periodLabel }: { data: FinanceOverview; periodLabel: (p: FinancePeriod) => string }) {
  const t = useMessages(messages);
  const f = useFormat();
  const rows: { key: keyof FinanceSummary; label: string; minus?: boolean; strong?: boolean }[] = [
    { key: 'bookings', label: t.rows.bookings },
    { key: 'grossCents', label: t.rows.gross, strong: true },
    { key: 'commissionCents', label: t.rows.commission },
    { key: 'vatCents', label: t.rows.vat, minus: true },
    { key: 'cleanerPayCents', label: t.rows.cleanerPay, minus: true },
    { key: 'paymentFeesCents', label: t.rows.fees, minus: true },
    { key: 'fixedCostsCents', label: t.rows.fixed, minus: true },
    { key: 'profitBeforeTaxCents', label: t.rows.pbt, strong: true },
    { key: 'incomeTaxCents', label: t.rows.tax, minus: true },
    { key: 'profitAfterTaxCents', label: t.rows.pat, strong: true },
  ];
  const cell = (s: FinanceSummary, key: keyof FinanceSummary, minus?: boolean) => {
    const v = s[key] as number;
    if (key === 'bookings') return v.toLocaleString(f.locale);
    return minus && v > 0 ? `−${f.euro(v)}` : f.euro(v);
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-cream/60 text-left text-xs uppercase tracking-wide text-muted-grey">
              <th scope="col" className="px-4 py-3 font-medium" />
              {PERIODS.map((p) => (
                <th key={p} scope="col" className="px-4 py-3 text-right font-semibold text-pine-dark">
                  {periodLabel(p)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={cn('border-b border-border/60 last:border-0', r.key === 'profitAfterTaxCents' && 'bg-mint/40')}>
                <th scope="row" className={cn('px-4 py-2.5 text-left font-normal text-charcoal', r.strong && 'font-semibold text-pine-dark')}>
                  {r.label}
                </th>
                {PERIODS.map((p) => {
                  const v = data.periods[p][r.key] as number;
                  return (
                    <td
                      key={p}
                      className={cn(
                        'px-4 py-2.5 text-right tabular-nums',
                        r.strong ? 'font-semibold text-pine-dark' : r.minus ? 'text-muted-grey' : 'text-charcoal',
                        r.strong && v < 0 && 'text-red-700'
                      )}
                    >
                      {cell(data.periods[p], r.key, r.minus)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Where the money goes – tall segmented bar (part-to-whole, ≤ 6 parts)
// ---------------------------------------------------------------------------
function SplitCard({ summary, periodLabel }: { summary: FinanceSummary; periodLabel: string }) {
  const t = useMessages(messages);
  const f = useFormat();
  const [hover, setHover] = useState<string | null>(null);
  const loss = summary.profitAfterTaxCents < 0;
  const parts = [
    { key: 'cleanerPay', label: t.rows.cleanerPay, cents: summary.cleanerPayCents, color: COLOR.cleanerPay },
    { key: 'vat', label: t.rows.vat, cents: summary.vatCents, color: COLOR.vat },
    { key: 'fees', label: t.rows.fees, cents: summary.paymentFeesCents, color: COLOR.fees },
    { key: 'fixed', label: t.rows.fixed, cents: summary.fixedCostsCents, color: COLOR.fixed },
    { key: 'tax', label: t.rows.tax, cents: summary.incomeTaxCents, color: COLOR.tax },
    { key: 'profit', label: t.rows.pat, cents: Math.max(0, summary.profitAfterTaxCents), color: COLOR.profit },
  ];
  // When costs exceed revenue the parts sum above 100 % – scale to the larger total
  const whole = Math.max(summary.grossCents, parts.reduce((s, p) => s + p.cents, 0));
  const visible = parts.filter((p) => p.cents > 0);
  const pct = (c: number) => (whole > 0 ? (c / whole) * 100 : 0);
  const fmtPct = (c: number) => `${pct(c).toLocaleString(f.locale, { maximumFractionDigits: 1 })} %`;
  const active = visible.find((p) => p.key === hover);

  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm" aria-labelledby="split-title">
      <h2 id="split-title" className="text-lg font-bold text-pine-dark">{t.splitTitle}</h2>
      <p className="text-sm text-muted-grey">{t.splitDescription(periodLabel)}</p>

      {summary.grossCents <= 0 ? (
        <p className="mt-6 rounded-xl bg-cream/70 p-4 text-sm text-muted-grey">{t.splitEmpty}</p>
      ) : (
        <>
          <div className="relative mt-5">
            {/* 2px surface gap between blocks; rounded only at the bar's ends */}
            <div className="flex h-16 w-full gap-[2px]" role="img" aria-label={`${t.splitTitle}: ${visible.map((p) => `${p.label} ${f.euro(p.cents)} (${fmtPct(p.cents)})`).join(', ')}`}>
              {visible.map((p, i) => (
                <div
                  key={p.key}
                  tabIndex={0}
                  onMouseEnter={() => setHover(p.key)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(p.key)}
                  onBlur={() => setHover(null)}
                  aria-label={`${p.label}: ${f.euro(p.cents)}, ${fmtPct(p.cents)}`}
                  className={cn(
                    'flex min-w-[3px] items-center justify-center overflow-hidden outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    i === 0 && 'rounded-l-[4px]',
                    i === visible.length - 1 && 'rounded-r-[4px]',
                    hover && hover !== p.key && 'opacity-60'
                  )}
                  style={{ width: `${pct(p.cents)}%`, backgroundColor: p.color, color: INK_ON[p.color] }}
                >
                  {pct(p.cents) >= 9 && <span className="truncate px-1 text-xs font-semibold tabular-nums">{fmtPct(p.cents)}</span>}
                </div>
              ))}
            </div>
            {active && (
              <div className="pointer-events-none absolute -top-12 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-white px-3 py-1.5 text-sm shadow-md" role="status">
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ backgroundColor: active.color }} aria-hidden="true" />
                <span className="text-charcoal">{active.label}</span>
                <span className="ml-2 font-semibold tabular-nums text-pine-dark">{f.euro(active.cents)}</span>
                <span className="ml-1.5 text-muted-grey">{fmtPct(active.cents)}</span>
              </div>
            )}
          </div>

          {/* Legend doubles as the figures table (relief for low-contrast fills) */}
          <ul className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 text-sm">
                <span className="flex items-center gap-2 text-charcoal">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} aria-hidden="true" />
                  {p.label}
                </span>
                <span className="tabular-nums">
                  <span className="font-semibold text-pine-dark">{f.euro(p.key === 'profit' ? summary.profitAfterTaxCents : p.cents)}</span>
                  <span className="ml-2 text-xs text-muted-grey">{p.cents > 0 ? fmtPct(p.cents) : '–'}</span>
                </span>
              </li>
            ))}
          </ul>
          {loss && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <strong>{t.loss}:</strong> {t.lossNote(f.euro(-summary.profitAfterTaxCents))}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ranked horizontal bars – one hue, largest first
// ---------------------------------------------------------------------------
function RankedBars({
  title,
  rows,
  labelOf,
  showFees,
}: {
  title: string;
  rows: FinanceOverview['byService'];
  labelOf: (key: string) => string;
  showFees?: boolean;
}) {
  const t = useMessages(messages);
  const f = useFormat();
  const max = Math.max(1, ...rows.map((r) => r.grossCents));
  const total = rows.reduce((s, r) => s + r.grossCents, 0);
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-pine-dark">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-grey">{t.splitEmpty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => {
            const share = total > 0 ? `${((r.grossCents / total) * 100).toLocaleString(f.locale, { maximumFractionDigits: 1 })} %` : '';
            return (
              <li key={r.key} title={`${labelOf(r.key)}: ${f.euro(r.grossCents)} · ${share} · ${t.bookingsCount(r.bookings)}`}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-charcoal">{labelOf(r.key)}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold text-pine-dark">{f.euro(r.grossCents)}</span>
                    <span className="ml-1.5 text-xs text-muted-grey">{share}</span>
                  </span>
                </div>
                <div className="mt-1 h-2.5 w-full rounded-full bg-cream" aria-hidden="true">
                  <div className="h-2.5 rounded-full bg-pine" style={{ width: `${(r.grossCents / max) * 100}%` }} />
                </div>
                <p className="mt-0.5 text-xs text-muted-grey">
                  {t.bookingsCount(r.bookings)}
                  {showFees && r.feeCents > 0 ? ` · ${t.feeHint(f.euro(r.feeCents))}` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Monthly trend – one € axis, three lines, crosshair tooltip, table view
// ---------------------------------------------------------------------------
function TrendCard({ data }: { data: FinanceOverview }) {
  const t = useMessages(messages);
  const f = useFormat();
  const { locale } = useLocale();
  const [curY, curM] = data.today.split('-').map(Number);
  const monthName = (key: string, style: 'short' | 'long' = 'short') =>
    new Date(`${key}-15T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-GB' : locale === 'pl' ? 'pl-PL' : 'de-DE', { month: style, timeZone: 'UTC' });
  // Future months are not zero – they don't exist yet (line ends at today)
  const rows = data.monthly.map((m) => {
    const [y, mo] = m.month.split('-').map(Number);
    const future = y > curY || (y === curY && mo > curM);
    const current = y === curY && mo === curM;
    return {
      key: m.month,
      label: current ? `${monthName(m.month)}*` : monthName(m.month),
      current,
      gross: future ? null : m.grossCents / 100,
      commission: future ? null : m.commissionCents / 100,
      pat: future ? null : m.profitAfterTaxCents / 100,
      raw: m,
      future,
    };
  });
  const lastIdx = rows.reduce((last, r, i) => (r.gross != null ? i : last), -1);
  // Axis floor: 0 unless losses are material (> 5 % of the peak) – then show them
  const values = rows.flatMap((r) => [r.gross, r.commission, r.pat]).filter((v): v is number => v != null);
  const peak = Math.max(0, ...values);
  const trough = Math.min(0, ...values);
  const yMin = trough < -0.05 * peak ? Math.floor(trough / 500) * 500 : 0;
  const compact = (v: number) => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale === 'pl' ? 'pl-PL' : 'de-DE', { notation: 'compact', maximumFractionDigits: 1 }).format(v) + ' €';
  const series = [
    { key: 'gross', label: t.series.gross, color: COLOR.gross, dash: '4 4' },
    { key: 'commission', label: t.series.commission, color: COLOR.commission },
    { key: 'pat', label: t.series.pat, color: COLOR.profit },
  ] as const;

  const endLabel = (color: string, text: string) =>
    function EndLabel(props: { x?: number; y?: number; index?: number }) {
      if (props.index !== lastIdx || props.x == null || props.y == null) return <g />;
      return (
        <g>
          <circle cx={props.x} cy={props.y} r={4} fill={color} stroke="#fff" strokeWidth={2} />
          <text x={props.x + 8} y={props.y + 4} fontSize={12} fill="#1f2a24" fontWeight={600}>
            {text}
          </text>
        </g>
      );
    };

  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm" aria-labelledby="trend-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="trend-title" className="text-lg font-bold text-pine-dark">{t.trendTitle}</h2>
          <p className="text-sm text-muted-grey">{t.trendDescription(data.year)}</p>
          {data.year === curY && <p className="text-xs text-muted-grey">* {t.partialMonth}</p>}
        </div>
        <ul className="flex flex-wrap gap-4 text-sm" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-charcoal">
              <svg width="18" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="18" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={'dash' in s ? s.dash : undefined} />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 96, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke="#ecebe6" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#d6d4cc' }} tick={{ fill: '#65736b', fontSize: 12 }} />
            <YAxis tickFormatter={compact} tickLine={false} axisLine={false} tick={{ fill: '#65736b', fontSize: 12 }} width={64} domain={[yMin, 'auto']} allowDataOverflow={yMin === 0 && trough < 0} />
            <Tooltip
              cursor={{ stroke: '#9aa19c', strokeWidth: 1 }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!active || !row || row.future) return null;
                return (
                  <div className="rounded-lg border border-border bg-white px-3 py-2 text-sm shadow-md">
                    <p className="mb-1 font-semibold text-pine-dark">{monthName(row.key, 'long')} {row.key.slice(0, 4)}</p>
                    {series.map((s) => (
                      <p key={s.key} className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-1.5 text-charcoal">
                          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
                          {s.label}
                        </span>
                        <span className="font-semibold tabular-nums text-pine-dark">
                          {f.euro(s.key === 'gross' ? row.raw.grossCents : s.key === 'commission' ? row.raw.commissionCents : row.raw.profitAfterTaxCents)}
                        </span>
                      </p>
                    ))}
                    <p className="mt-1 text-xs text-muted-grey">
                      {t.bookingsCount(row.raw.bookings)}
                      {row.current ? ` · ${t.partialMonth}` : ''}
                    </p>
                  </div>
                );
              }}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={'dash' in s ? s.dash : undefined}
                dot={false}
                activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
                label={endLabel(s.color, s.label.split(' (')[0])}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-pine hover:underline">{t.showTable}</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-grey">
                <th scope="col" className="py-2 pr-3 font-medium">{t.month}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{t.rows.bookings}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{t.series.gross}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{t.series.commission}</th>
                <th scope="col" className="py-2 text-right font-medium">{t.series.pat}</th>
              </tr>
            </thead>
            <tbody>
              {rows.filter((r) => !r.future).map((r) => (
                <tr key={r.key} className="border-b border-border/50 last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-charcoal">{monthName(r.key, 'long')}</th>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.raw.bookings}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{f.euro(r.raw.grossCents)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{f.euro(r.raw.commissionCents)}</td>
                  <td className={cn('py-2 text-right font-semibold tabular-nums', r.raw.profitAfterTaxCents < 0 ? 'text-red-700' : 'text-pine-dark')}>{f.euro(r.raw.profitAfterTaxCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Assumptions (tax rate, VAT basis, fees, fixed costs) → settings.finance
// ---------------------------------------------------------------------------
function AssumptionsCard({ assumptions, onSaved }: { assumptions: FinanceAssumptions; onSaved: () => void }) {
  const t = useMessages(messages).assumptions;
  const c = useMessages(common);
  const f = useFormat();
  const errorText = useErrorText();
  const comma = f.locale !== 'en';
  const fmt = (n: number) => (comma ? String(n).replace('.', ',') : String(n));
  const toDraft = (a: FinanceAssumptions) => ({
    tax: fmt(a.incomeTaxRatePct),
    vatBasis: a.vatBasis,
    fixed: fmt(a.monthlyFixedCostsCents / 100),
    paypalPct: fmt(a.fees.paypal.pct),
    paypalFixed: fmt(a.fees.paypal.fixedCents / 100),
    stripePct: fmt(a.fees.stripe.pct),
    stripeFixed: fmt(a.fees.stripe.fixedCents / 100),
  });
  const [draft, setDraft] = useState(() => toDraft(assumptions));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(toDraft(assumptions)), [assumptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (v: string) => {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };
  const parsed = useMemo(() => {
    const value: FinanceAssumptions = {
      incomeTaxRatePct: num(draft.tax),
      vatBasis: draft.vatBasis,
      monthlyFixedCostsCents: Math.round(num(draft.fixed) * 100),
      fees: {
        paypal: { pct: num(draft.paypalPct), fixedCents: Math.round(num(draft.paypalFixed) * 100) },
        stripe: { pct: num(draft.stripePct), fixedCents: Math.round(num(draft.stripeFixed) * 100) },
      },
    };
    const ok =
      value.incomeTaxRatePct <= 60 &&
      value.fees.paypal.pct <= 10 && value.fees.stripe.pct <= 10 &&
      value.fees.paypal.fixedCents <= 500 && value.fees.stripe.fixedCents <= 500 &&
      [value.incomeTaxRatePct, value.monthlyFixedCostsCents, value.fees.paypal.pct, value.fees.paypal.fixedCents, value.fees.stripe.pct, value.fees.stripe.fixedCents].every(Number.isFinite);
    return ok ? value : null;
  }, [draft]);

  const save = async () => {
    if (!parsed) {
      toast.error(t.invalid);
      return;
    }
    setSaving(true);
    try {
      await api.put('/admin/settings', { finance: parsed });
      toast.success(t.saved);
      onSaved();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof draft, label: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`fin-${key}`}>{label}</Label>
      <Input id={`fin-${key}`} inputMode="decimal" value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} disabled={saving} />
      {hint && <p className="text-xs text-muted-grey">{hint}</p>}
    </div>
  );

  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm" aria-labelledby="fin-assumptions">
      <h2 id="fin-assumptions" className="text-lg font-bold text-pine-dark">{t.title}</h2>
      <p className="text-sm text-muted-grey">{t.description}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {field('tax', t.taxRate, t.taxRateHint)}
        {field('fixed', t.fixed, t.fixedHint)}
        <fieldset className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <legend className="text-sm font-medium leading-none">{t.vatBasis}</legend>
          {(['full', 'commission'] as const).map((v) => (
            <label key={v} className="flex cursor-pointer items-start gap-2 text-sm text-charcoal">
              <input type="radio" name="vatBasis" className="mt-1 accent-[#174D3A]" checked={draft.vatBasis === v} onChange={() => setDraft((d) => ({ ...d, vatBasis: v }))} disabled={saving} />
              {v === 'full' ? t.vatFull : t.vatCommission}
            </label>
          ))}
          <p className="text-xs text-muted-grey">{t.vatHint}</p>
        </fieldset>
        {field('paypalPct', t.paypalPct)}
        {field('paypalFixed', t.paypalFixed)}
        <span className="hidden lg:block" />
        {field('stripePct', t.stripePct)}
        {field('stripeFixed', t.stripeFixed)}
      </div>
      <div className="mt-5 flex justify-end">
        <Button type="button" onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {saving ? c.states.loading : t.save}
        </Button>
      </div>
    </section>
  );
}

