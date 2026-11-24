'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Ban,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  Euro,
  Mail,
  Sparkles,
  Undo2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  type LucideIcon,
} from 'lucide-react';

import { StatusBadge } from '@/componets/site/status-badge';
import { Skeleton } from '@/componets/ui/skeleton';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { Formatter } from '@/lib/i18n/format';
import common from '@/lib/i18n/messages/common';
import type { Booking, DashboardStats, Pagination } from '@/lib/types';
import { cn } from '@/lib/utils';

import dashboardMessages, { type DashboardMessages } from './_dashboard-messages';
import { MarketingTeaser } from './_components/marketing-teaser';
import { StuckJobsSection } from './_components/stuck-jobs';
import { DashboardOverviewSection } from './_components/dashboard-overview';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, SectionCard } from './_components/states';
import { berlinToday, useApi } from './_components/use-api';

interface Kpi {
  label: string;
  value: string | number;
  href: string;
  icon: LucideIcon;
  highlight?: boolean;
  hint?: string;
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon;
  return (
    <Link
      href={kpi.href}
      className={cn(
        'group flex flex-col justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        kpi.highlight ? 'border-amber-300' : 'border-border'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-grey">{kpi.label}</span>
        <span
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
            kpi.highlight ? 'bg-amber-50 text-amber-700' : 'bg-mint text-pine'
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight text-pine-dark">{kpi.value}</span>
        <ArrowRight
          className="h-4 w-4 text-sage transition group-hover:translate-x-0.5 group-hover:text-pine"
          aria-hidden="true"
        />
      </div>
      {kpi.hint && <span className="-mt-2 text-xs text-muted-grey">{kpi.hint}</span>}
    </Link>
  );
}

function buildKpis(s: DashboardStats, t: DashboardMessages, f: Formatter): { title: string; items: Kpi[] }[] {
  const today = berlinToday();
  // Values in minutes of team time (window length × parallel teams)
  const week = s.nextSevenDays ?? { slots: 0, capacity: 0, booked: 0, free: 0 };
  const utilisationPct = week.capacity > 0 ? Math.round((week.booked / week.capacity) * 100) : 0;
  return [
    {
      title: t.groups.bookings,
      items: [
        {
          label: t.kpi.paymentPending,
          value: s.paymentPending,
          href: '/admin/buchungen?status=payment_pending',
          icon: Clock,
          highlight: s.paymentPending > 0,
          hint: t.kpi.paymentPendingHint,
        },
        {
          label: t.kpi.confirmed,
          value: s.confirmedBookings,
          href: '/admin/buchungen?status=confirmed&sort=date',
          icon: CalendarCheck,
          hint: t.kpi.confirmedHint(s.inProgressBookings),
        },
        {
          label: t.kpi.todaysJobs,
          value: s.todaysJobs,
          href: `/admin/buchungen?from=${today}&to=${today}&sort=date`,
          icon: CalendarClock,
        },
        {
          label: t.kpi.unassigned,
          value: s.unassignedUpcoming,
          href: `/admin/buchungen?assigned=false&status=confirmed&from=${today}&sort=date`,
          icon: UserX,
          highlight: s.unassignedUpcoming > 0,
          hint: t.kpi.unassignedHint,
        },
        {
          label: t.kpi.refundsPending,
          value: s.refundsPending,
          href: '/admin/zahlungen?status=paid',
          icon: Undo2,
          highlight: s.refundsPending > 0,
          hint: t.kpi.refundsPendingHint,
        },
        {
          label: t.kpi.completed,
          value: s.completedBookings,
          href: '/admin/buchungen?status=completed',
          icon: CheckCircle2,
        },
        {
          label: t.kpi.cancelled,
          value: s.cancelledBookings,
          href: '/admin/buchungen?status=cancelled',
          icon: Ban,
          hint: t.kpi.cancelledHint(s.expiredBookings),
        },
      ],
    },
    {
      title: t.groups.capacity,
      items: [
        {
          label: t.kpi.utilisation,
          value: week.capacity > 0 ? `${f.number(utilisationPct)} %` : '–',
          href: '/admin/termine',
          icon: CalendarDays,
          highlight: week.capacity === 0 || utilisationPct >= 90,
          hint:
            week.capacity === 0
              ? t.kpi.noSlots
              : t.kpi.utilisationHint(f.hours(week.booked), f.hours(week.capacity), week.bookings ?? 0),
        },
        {
          label: t.kpi.revenue,
          value: f.euro(s.paidRevenueCents),
          href: '/admin/zahlungen?status=paid',
          icon: Euro,
          hint: t.kpi.revenueHint,
        },
      ],
    },
    {
      title: t.groups.people,
      items: [
        { label: t.kpi.customers, value: s.totalCustomers, href: '/admin/kunden', icon: Users },
        {
          label: t.kpi.workersApproved,
          value: s.workers.approved,
          href: '/admin/reinigungskraefte?status=approved',
          icon: UserCheck,
        },
        {
          label: t.kpi.workersPending,
          value: s.workers.pendingReview,
          href: '/admin/reinigungskraefte?status=pending_review',
          icon: UserPlus,
          highlight: s.workers.pendingReview > 0,
        },
        {
          label: t.kpi.business,
          value: s.newBusinessRequests,
          href: '/admin/anfragen?status=new_request',
          icon: Building2,
          highlight: s.newBusinessRequests > 0,
        },
        {
          label: t.kpi.messages,
          value: s.newContactMessages,
          href: '/admin/nachrichten?status=new',
          icon: Mail,
          highlight: s.newContactMessages > 0,
        },
      ],
    },
  ];
}

export default function AdminDashboardPage() {
  const t = useMessages(dashboardMessages);
  const c = useMessages(common);
  const f = useFormat();
  const stats = useApi<{ stats: DashboardStats }>('/admin/dashboard/stats');
  const latest = useApi<{ bookings: Booking[]; pagination: Pagination }>('/admin/bookings?limit=5');

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <DashboardOverviewSection />

      <StuckJobsSection />

      {stats.error && !stats.data ? (
        <ErrorState message={stats.error} onRetry={stats.reload} className="mb-8" />
      ) : !stats.data ? (
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" role="status" aria-label={t.loadingKpis}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="mb-8 space-y-6">
          {buildKpis(stats.data.stats, t, f).map((group, gi) => (
            <section key={group.title} aria-labelledby={`kpi-group-${gi}`}>
              <h2 id={`kpi-group-${gi}`} className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-grey">
                {group.title}
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {group.items.map((kpi) => (
                  <KpiCard key={kpi.label} kpi={kpi} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <MarketingTeaser />

      <SectionCard
        id="neueste-buchungen"
        title={t.latest.title}
        description={t.latest.description}
        actions={
          <Link
            href="/admin/buchungen"
            className="inline-flex items-center gap-1 rounded text-sm font-semibold text-pine hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t.latest.all} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      >
        {latest.error && !latest.data ? (
          <ErrorState message={latest.error} onRetry={latest.reload} />
        ) : !latest.data ? (
          <ListSkeleton rows={5} />
        ) : latest.data.bookings.length === 0 ? (
          <EmptyState icon={Sparkles} title={t.latest.emptyTitle} description={t.latest.emptyText} />
        ) : (
          <ul className="divide-y divide-border">
            {latest.data.bookings.map((b) => (
              <li key={b._id}>
                <Link
                  href={`/admin/buchungen/${b._id}`}
                  className="flex flex-col gap-1 rounded-lg px-2 py-3 hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-charcoal">
                      {b.customerDetails.name}{' '}
                      <span className="font-mono text-xs font-normal text-muted-grey">{b.reference}</span>
                    </p>
                    <p className="text-sm text-muted-grey">
                      {c.services[b.serviceId] ?? b.serviceId} · {b.areaM2} m² · {f.dateShort(b.preferredDate)},{' '}
                      {f.slot(b.slot, b.slotEnd)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-pine-dark">
                      {f.euro(b.payment?.amountCents ?? b.estimate?.totalCents)}
                    </span>
                    <StatusBadge kind="booking" status={b.status} />
                    {b.payment && <StatusBadge kind="payment" status={b.payment.status} />}
                    <span className="hidden text-xs text-muted-grey md:inline">{f.dateTime(b.createdAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
