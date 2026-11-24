'use client';

// Visual admin overview: welcome card, four KPI cards with 30-day trends,
// completion meter, monthly revenue vs commission and month/year meters.
// Chart colors come from the validated categorical palette (one per entity);
// text always uses ink tokens, trends carry an arrow + label (never color alone).
import Link from 'next/link';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarPlus, Euro, Sparkles, UserPlus, XCircle, type LucideIcon } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { useAuth } from '@/lib/auth';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import messages from '../_overview-messages';
import { useApi } from './use-api';

export interface DashboardOverview {
  today: string;
  kpis: {
    bookings: { value: number; changePct: number | null; series: { day: string; value: number }[] };
    revenue: { valueCents: number; changePct: number | null; series: { day: string; value: number }[] };
    customers: { value: number; changePct: number | null; series: { day: string; value: number }[] };
    cancellation: { ratePct: number; changePts: number; series: { day: string; value: number }[] };
  };
  month: { revenueCents: number; lastMonthCents: number; ofLastMonthPct: number | null };
  year: { revenueCents: number; lastYearCents: number; ofLastYearPct: number | null };
  completion: { ratePct: number; completedPct: number; cancelledPct: number; expiredPct: number; resolved: number; upcoming: number };
  monthly: { month: string; revenueCents: number; commissionCents: number; bookings: number; partial: boolean }[];
}

const C = {
  bookings: '#2a78d6', // blue
  revenue: '#1baf7a', // aqua
  customers: '#6250d6', // violet
  cancellation: '#eb6834', // orange
  barRevenue: '#2a78d6', // blue  } validated pair
  barCommission: '#eb6834', // orange }
  meterFill: '#174D3A', // pine on a same-ramp mint track
  meterTrack: '#dfece5',
  good: '#0ca30c',
  critical: '#d03b3b',
};

const localeTag = (l: string) => (l === 'en' ? 'en-GB' : l === 'pl' ? 'pl-PL' : 'de-DE');

export function DashboardOverviewSection() {
  const { data } = useApi<DashboardOverview>('/admin/dashboard/overview');
  if (!data) {
    return (
      <div className="mb-6 grid gap-4 xl:grid-cols-6" aria-hidden="true">
        <div className="h-48 animate-pulse rounded-2xl bg-white/70 xl:col-span-2" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl bg-white/70" />
        ))}
      </div>
    );
  }
  return (
    <div className="mb-8 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <WelcomeCard data={data} />
        <KpiCards data={data} />
      </div>
      <div className="grid gap-4 xl:grid-cols-6">
        <CompletionCard data={data} />
        <RevenueCard data={data} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function WelcomeCard({ data }: { data: DashboardOverview }) {
  const t = useMessages(messages);
  const f = useFormat();
  const { user } = useAuth();
  const first = (user?.name ?? '').split(' ')[0] || 'Team';
  const pct = data.month.ofLastMonthPct;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-sm sm:col-span-2 xl:col-span-2">
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-mint" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-6 right-28 h-20 w-20 rounded-full bg-sage/30" aria-hidden="true" />
      <div className="relative">
        <p className="flex items-center gap-2 text-lg font-bold text-pine-dark">
          {t.welcome(first)} <Sparkles className="h-5 w-5 text-pine" aria-hidden="true" />
        </p>
        <p className="text-sm text-muted-grey">{t.welcomeSub}</p>
        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-muted-grey">{t.monthRevenue}</p>
        <p className="text-3xl font-bold tabular-nums text-pine-dark">{f.euro(data.month.revenueCents)}</p>
        {pct != null ? (
          <>
            <div className="mt-2 h-2 w-full max-w-xs rounded-full" style={{ backgroundColor: C.meterTrack }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, pct)} aria-label={t.ofLastMonth(`${pct} %`)}>
              <div className="h-2 rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: C.meterFill }} />
            </div>
            <p className="mt-1 text-sm text-charcoal">{t.ofLastMonth(`${pct.toLocaleString(f.locale)} %`)}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-grey">{t.noLastMonth}</p>
        )}
        <Link href="/admin/finanzen" className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-pine px-5 text-sm font-semibold text-white transition hover:bg-pine-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          {t.toFinance} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
function Trend({ value, unit, invert }: { value: number | null; unit: 'pct' | 'pts'; invert?: boolean }) {
  const t = useMessages(messages);
  const f = useFormat();
  if (value == null) return <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-semibold text-muted-grey">{t.noTrend}</span>;
  const up = value > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const text = `${up ? '+' : ''}${value.toLocaleString(f.locale, { maximumFractionDigits: 1 })}${unit === 'pct' ? ' %' : ''}`;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: value === 0 ? '#f0efec' : good ? '#e3f4e3' : '#fbe4e4', color: value === 0 ? '#52514e' : good ? '#0b5d0b' : '#9b2222' }}
      title={t.vsPrev}
    >
      {value !== 0 && <Icon className="h-3.5 w-3.5" style={{ color: good ? C.good : C.critical }} aria-hidden="true" />}
      {unit === 'pts' ? t.pts(text) : text}
    </span>
  );
}

function Spark({ series, color, kind, format }: { series: { day: string; value: number }[]; color: string; kind: 'area' | 'bar'; format: (v: number) => string }) {
  const { locale } = useLocale();
  const id = `spark-${color.slice(1)}`;
  const tip = (
    <Tooltip
      cursor={kind === 'bar' ? { fill: '#f0efec' } : { stroke: '#9aa19c', strokeWidth: 1 }}
      content={({ active, payload }) => {
        const p = payload?.[0]?.payload as { day: string; value: number } | undefined;
        if (!active || !p) return null;
        return (
          <div className="rounded-md border border-border bg-white px-2 py-1 text-xs shadow">
            <span className="text-muted-grey">{new Date(`${p.day}T12:00:00Z`).toLocaleDateString(localeTag(locale), { day: '2-digit', month: 'short', timeZone: 'UTC' })}</span>
            <span className="ml-2 font-semibold tabular-nums text-pine-dark">{format(p.value)}</span>
          </div>
        );
      }}
    />
  );
  return (
    <div className="mt-3 h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'bar' ? (
          <BarChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
            {tip}
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        ) : (
          <AreaChart data={series} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {tip}
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function KpiCard({ icon: Icon, color, label, value, trend, href, children }: { icon: LucideIcon; color: string; label: string; value: string; trend: React.ReactNode; href: string; children: React.ReactNode }) {
  const t = useMessages(messages);
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={href} className="grid h-11 w-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ backgroundColor: `${color}1a` }} aria-label={label}>
          <Icon className="h-5 w-5" style={{ color }} aria-hidden="true" />
        </Link>
        {trend}
      </div>
      <p className="mt-4 text-2xl font-bold tabular-nums text-pine-dark">{value}</p>
      <p className="text-sm text-charcoal">{label}</p>
      <p className="text-xs text-muted-grey">{t.last30}</p>
      <div className="mt-auto">{children}</div>
    </section>
  );
}

function KpiCards({ data }: { data: DashboardOverview }) {
  const t = useMessages(messages);
  const f = useFormat();
  const k = data.kpis;
  const n = (v: number) => v.toLocaleString(f.locale);
  return (
    <>
      <KpiCard icon={CalendarPlus} color={C.bookings} label={t.kpi.bookings} value={n(k.bookings.value)} href="/admin/buchungen" trend={<Trend value={k.bookings.changePct} unit="pct" />}>
        <Spark series={k.bookings.series} color={C.bookings} kind="area" format={n} />
      </KpiCard>
      <KpiCard icon={Euro} color={C.revenue} label={t.kpi.revenue} value={f.euro(k.revenue.valueCents)} href="/admin/finanzen" trend={<Trend value={k.revenue.changePct} unit="pct" />}>
        <Spark series={k.revenue.series} color={C.revenue} kind="area" format={(v) => f.euro(v)} />
      </KpiCard>
      <KpiCard icon={UserPlus} color={C.customers} label={t.kpi.customers} value={n(k.customers.value)} href="/admin/kunden" trend={<Trend value={k.customers.changePct} unit="pct" />}>
        <Spark series={k.customers.series} color={C.customers} kind="area" format={n} />
      </KpiCard>
      <KpiCard
        icon={XCircle}
        color={C.cancellation}
        label={t.kpi.cancellation}
        value={`${k.cancellation.ratePct.toLocaleString(f.locale)} %`}
        href="/admin/buchungen?status=cancelled"
        trend={<Trend value={k.cancellation.changePts} unit="pts" invert />}
      >
        <Spark series={k.cancellation.series} color={C.cancellation} kind="bar" format={n} />
      </KpiCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ring meter: ONE ratio against 100 % (same-ramp track + fill)
function RingMeter({ pct, size, stroke, label, children }: { pct: number; size: number; stroke: number; label: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.meterTrack} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.meterFill} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(v / 100) * circ} ${circ}`} />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}

function CompletionCard({ data }: { data: DashboardOverview }) {
  const t = useMessages(messages);
  const f = useFormat();
  const c = data.completion;
  const pct = (v: number) => `${v.toLocaleString(f.locale, { maximumFractionDigits: 1 })} %`;
  const rows = [
    { label: t.completed, value: c.completedPct },
    { label: t.cancelled, value: c.cancelledPct },
    { label: t.expired, value: c.expiredPct },
  ];
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm xl:col-span-2" aria-labelledby="completion-title">
      <h2 id="completion-title" className="text-lg font-bold text-pine-dark">{t.completionTitle}</h2>
      <p className="text-sm text-muted-grey">{t.completionSub}</p>
      <div className="mt-5 flex justify-center">
        <RingMeter pct={c.ratePct} size={190} stroke={16} label={`${t.completionTitle}: ${pct(c.ratePct)}`}>
          <div>
            <p className="text-3xl font-bold tabular-nums text-pine-dark">{pct(c.ratePct)}</p>
            <p className="text-sm text-muted-grey">{t.completionCenter}</p>
          </div>
        </RingMeter>
      </div>
      {/* Meter list: each share against the same whole */}
      <ul className="mt-6 space-y-3">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex justify-between text-sm">
              <span className="text-charcoal">{r.label}</span>
              <span className="font-semibold tabular-nums text-pine-dark">{pct(r.value)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full" style={{ backgroundColor: C.meterTrack }} aria-hidden="true">
              <div className="h-1.5 rounded-full" style={{ width: `${r.value}%`, backgroundColor: C.meterFill }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-grey">{t.upcoming(c.upcoming)}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
function RevenueCard({ data }: { data: DashboardOverview }) {
  const t = useMessages(messages);
  const f = useFormat();
  const { locale } = useLocale();
  const tag = localeTag(locale);
  const monthName = (key: string, style: 'short' | 'long' = 'short') =>
    new Date(`${key}-15T12:00:00Z`).toLocaleDateString(tag, { month: style, timeZone: 'UTC' });
  const rows = data.monthly.map((m) => ({
    ...m,
    label: m.partial ? `${monthName(m.month)}*` : monthName(m.month),
    revenue: m.revenueCents / 100,
    commission: m.commissionCents / 100,
  }));
  const compact = (v: number) => `${new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 }).format(v)} €`;
  const ratio = (v: number | null) => (v == null ? null : `${v.toLocaleString(f.locale, { maximumFractionDigits: 1 })} %`);

  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm xl:col-span-4" aria-labelledby="revenue-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="revenue-title" className="text-lg font-bold text-pine-dark">{t.revenueTitle}</h2>
          <p className="text-sm text-muted-grey">{t.revenueSub}</p>
          <p className="text-xs text-muted-grey">* {t.partial}</p>
        </div>
        <ul className="flex gap-4 text-sm" aria-label="Legend">
          <li className="flex items-center gap-2 text-charcoal">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: C.barRevenue }} aria-hidden="true" />
            {t.revenue}
          </li>
          <li className="flex items-center gap-2 text-charcoal">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: C.barCommission }} aria-hidden="true" />
            {t.commission}
          </li>
        </ul>
      </div>

      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="#ecebe6" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#d6d4cc' }} tick={{ fill: '#65736b', fontSize: 12 }} />
            <YAxis tickFormatter={compact} tickLine={false} axisLine={false} tick={{ fill: '#65736b', fontSize: 12 }} width={60} />
            <Tooltip
              cursor={{ fill: '#f4f3ee' }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!active || !row) return null;
                return (
                  <div className="rounded-lg border border-border bg-white px-3 py-2 text-sm shadow-md">
                    <p className="mb-1 font-semibold text-pine-dark">
                      {monthName(row.month, 'long')} {row.month.slice(0, 4)}
                      {row.partial ? ` · ${t.partial}` : ''}
                    </p>
                    {[
                      { label: t.revenue, cents: row.revenueCents, color: C.barRevenue },
                      { label: t.commission, cents: row.commissionCents, color: C.barCommission },
                    ].map((s) => (
                      <p key={s.label} className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-1.5 text-charcoal">
                          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
                          {s.label}
                        </span>
                        <span className="font-semibold tabular-nums text-pine-dark">{f.euro(s.cents)}</span>
                      </p>
                    ))}
                    <p className="mt-1 text-xs text-muted-grey">{t.bookingsCount(row.bookings)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="revenue" fill={C.barRevenue} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="commission" fill={C.barCommission} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-semibold text-pine hover:underline">{t.showTable}</summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-grey">
              <th scope="col" className="py-1.5 font-medium">{t.month}</th>
              <th scope="col" className="py-1.5 text-right font-medium">{t.revenue}</th>
              <th scope="col" className="py-1.5 text-right font-medium">{t.commission}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-b border-border/50 last:border-0">
                <th scope="row" className="py-1.5 text-left font-normal text-charcoal">{monthName(r.month, 'long')} {r.month.slice(0, 4)}{r.partial ? '*' : ''}</th>
                <td className="py-1.5 text-right tabular-nums">{f.euro(r.revenueCents)}</td>
                <td className="py-1.5 text-right tabular-nums">{f.euro(r.commissionCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {/* Month & year progress against the previous period */}
      <div className="mt-5 grid gap-4 rounded-2xl border border-border p-4 sm:grid-cols-2">
        {[
          { title: t.monthRing, cents: data.month.revenueCents, pct: data.month.ofLastMonthPct, prev: data.month.lastMonthCents, text: t.vsLastMonth },
          { title: t.yearRing, cents: data.year.revenueCents, pct: data.year.ofLastYearPct, prev: data.year.lastYearCents, text: t.vsLastYear },
        ].map((m, i) => (
          <div key={m.title} className={cn('flex items-center gap-4', i === 1 && 'sm:border-l sm:border-border sm:pl-4')}>
            <RingMeter pct={m.pct ?? 0} size={76} stroke={9} label={`${m.title}: ${ratio(m.pct) ?? t.noCompare}`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-charcoal">{m.title}</p>
              <p className="text-2xl font-bold tabular-nums text-pine-dark">{f.euro(m.cents)}</p>
              <p className="text-xs text-muted-grey">
                {m.pct != null ? `${m.text(ratio(m.pct) as string)} · ${t.previous(f.euro(m.prev))}` : t.noCompare}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
