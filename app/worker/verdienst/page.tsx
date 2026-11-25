'use client';

import Link from 'next/link';
import {
  Banknote,
  ChevronRight,
  BadgeEuro,
  CalendarClock,
  CheckCircle2,
  Hourglass,
  Info,
  Landmark,
  PauseCircle,
  Send,
  Sparkles,
  Wallet,
} from 'lucide-react';

import { RequireRole } from '@/lib/auth';
import { useFormat, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { WorkerEarningsResponse, WorkerPayoutRecord, WorkerPerformanceResponse } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ErrorState } from '@/app/admin/_components/states';
import { useApi } from '@/app/admin/_components/use-api';

import cashMessages from '../_cash-messages';
import portalMessages from '../_portal-messages';
import { CashBadge, useJobTime } from '../_components/cash';
import { BankForm } from '../_components/onboarding-forms';
import { PayoutMethodForm } from '../_components/payout-method-form';
import {
  NotAvailable,
  PageSkeleton,
  PageTitle,
  PayoutStatusBadge,
  PortalCard,
  StatTile,
  useBerlinDate,
} from '../_components/portal-ui';
import { useOverviewUpdaters } from '../_components/setup';
import { canEditProfile, useWorkerOverview } from '../_components/worker-context';
import leistungMessages from '../leistung/_messages';
import { TierBadge } from '../leistung/_components/tier-badge';

/** Compact link to the performance page with the current commission tier */
function TierLink() {
  const t = useMessages(leistungMessages).earningsLink;
  const f = useFormat();
  const { data } = useApi<WorkerPerformanceResponse>('/worker/performance');
  if (!data) return null;
  return (
    <Link
      href="/worker/leistung"
      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm transition hover:border-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.tier}</span>
        <TierBadge tier={data.tier.key} />
        <span className="text-sm font-semibold text-pine-dark">{t.commission(f.number(data.tier.effectivePct))}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-pine">
        <span className="hidden sm:inline">{t.cta}</span>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
}

function Timeline({ day }: { day: number }) {
  const t = useMessages(portalMessages).earnings.timeline;
  const steps = [
    { icon: Sparkles, label: t.done },
    { icon: Hourglass, label: t.waiting(day) },
    { icon: Send, label: t.due },
    { icon: CheckCircle2, label: t.paid },
  ];
  return (
    <ol className="mt-4 grid grid-cols-4 gap-1">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex flex-col items-center text-center">
          {i > 0 && <span className="absolute right-1/2 top-5 h-0.5 w-full bg-sage" aria-hidden="true" />}
          <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-sage bg-white text-pine">
            <s.icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="mt-1.5 text-xs font-medium leading-tight text-charcoal">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Badge tone of a payout record (records from before the status field exist only as paid) */
const HISTORY_CLASSES: Record<WorkerPayoutRecord['status'], string> = {
  paid: 'border-sage bg-mint text-pine-dark',
  processing: 'border-amber-200 bg-amber-50 text-amber-900',
  failed: 'border-red-200 bg-red-50 text-red-700',
};

function Earnings() {
  const { earnings: t } = useMessages(portalMessages);
  const cm = useMessages(cashMessages);
  const jobTime = useJobTime();
  const c = useMessages(common);
  const f = useFormat();
  const date = useBerlinDate();
  const overview = useWorkerOverview();
  const update = useOverviewUpdaters();
  const { data, error, reload, setData } = useApi<WorkerEarningsResponse>('/worker/earnings');

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <PageSkeleton label={t.loading} />;

  const { summary, bank, jobs, payouts, payoutMethod } = data;
  const editable = overview.data ? canEditProfile(overview.data) : false;
  const cashHeld = summary.cashHeldCents ?? 0;
  const hasCash = cashHeld > 0 || jobs.some((j) => (j.cashHeldCents ?? 0) > 0);
  /** Net sums can be negative (more cash kept than pay): show as owed to Fiduxa */
  const netValue = (cents: number) =>
    cents < 0 ? <span className="text-red-700">{cm.pay.owed(f.euro(-cents))}</span> : f.euro(cents);
  const netHint = hasCash ? cm.earnings.netLabel : undefined;

  return (
    <div className="space-y-5">
      <PageTitle title={t.title} subtitle={t.subtitle} />

      <TierLink />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={Wallet} tone="accent" label={t.thisMonth} value={f.euro(summary.thisMonthCents)} />
        {cashHeld > 0 && (
          <StatTile
            icon={Banknote}
            tone="warn"
            label={cm.earnings.cashHeld}
            value={f.euro(cashHeld)}
            hint={cm.earnings.cashHeldHint}
          />
        )}
        <StatTile
          icon={Hourglass}
          tone={summary.pendingCents < 0 ? 'warn' : 'default'}
          label={t.pending}
          value={netValue(summary.pendingCents)}
          hint={netHint}
        />
        <StatTile
          icon={Send}
          tone={summary.dueCents < 0 ? 'warn' : 'default'}
          label={t.due}
          value={netValue(summary.dueCents)}
          hint={netHint}
        />
        {summary.onHoldCents !== 0 && (
          <StatTile icon={PauseCircle} tone="warn" label={t.onHold} value={netValue(summary.onHoldCents)} hint={netHint} />
        )}
        {(summary.processingCents ?? 0) > 0 && (
          <StatTile icon={Landmark} label={t.processing} value={netValue(summary.processingCents ?? 0)} hint={netHint} />
        )}
        <StatTile icon={CheckCircle2} label={t.paid} value={netValue(summary.paidCents)} hint={netHint} />
        <StatTile
          icon={CalendarClock}
          label={t.nextPayout}
          value={summary.nextDueAt ? date(summary.nextDueAt) : '–'}
        />
        {summary.payModel?.basis === 'commission' && summary.payModel.sharePct != null && summary.payModel.commissionPct != null ? (
          // Commission model (QA open issue 5): show what the cleaner really earns, not the legacy hourly rate
          <StatTile
            icon={BadgeEuro}
            label={t.payTitle}
            value={t.payShare(summary.payModel.sharePct, summary.payModel.commissionPct)}
            hint={t.payPerHour(f.euro(summary.payModel.perHourCents), f.euro(summary.payModel.customerHourlyCents))}
          />
        ) : (
          <StatTile icon={BadgeEuro} label={t.rate} value={t.perHour(f.euro(summary.rateCents))} />
        )}
      </div>

      {hasCash && (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {cm.earnings.netNote}
        </p>
      )}

      <PortalCard title={t.howTitle}>
        <p className="text-sm text-charcoal">{t.how(summary.payoutDayOfMonth)}</p>
        <Timeline day={summary.payoutDayOfMonth} />
      </PortalCard>

      <PortalCard title={t.jobsTitle}>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-grey">{t.noJobs}</p>
        ) : (
          <ul className="divide-y divide-border">
            {jobs.map((j) => {
              const cash = j.cashHeldCents ?? 0;
              const net = j.netCents ?? j.amountCents - cash;
              return (
                <li key={j._id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-pine-dark">
                        {c.services[j.serviceId] ?? j.serviceId}
                        {cash > 0 && <CashBadge />}
                      </p>
                      <p className="text-sm text-muted-grey">
                        {f.dateShort(j.date)} · {jobTime(j.slot, j.slotEnd, j.slotEnd ? null : j.minutes)} ·{' '}
                        <span className="font-mono text-xs">{j.reference}</span>
                      </p>
                      <p className="text-xs text-muted-grey">
                        {j.basis === 'commission' && j.grossCents != null && j.commissionPct != null
                          ? t.calcCommission(f.euro(j.grossCents), j.commissionPct, f.euro(j.commissionCents ?? j.grossCents - j.amountCents))
                          : j.basis === 'cancellation'
                            ? null
                            : t.calc(f.hours(j.minutes), f.euro(j.rateCents))}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn('text-base font-bold', net < 0 ? 'text-red-700' : 'text-pine-dark')}>
                        {cash > 0 ? netValue(net) : f.euro(j.amountCents)}
                      </span>
                      <PayoutStatusBadge status={j.status} dueAt={j.dueAt} paidAt={j.paidAt} />
                    </div>
                  </div>
                  {cash > 0 && (
                    <dl className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-cream px-3 py-2 text-xs">
                      <div>
                        <dt className="text-muted-grey">{cm.pay.gross}</dt>
                        <dd className="font-semibold text-charcoal">{f.euro(j.amountCents)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-grey">{cm.earnings.cashHeld}</dt>
                        <dd className="font-semibold text-amber-800">− {f.euro(cash)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-grey">{cm.pay.net}</dt>
                        <dd className={cn('font-semibold', net < 0 ? 'text-red-700' : 'text-pine-dark')}>
                          {net < 0 ? `− ${f.euro(-net)}` : f.euro(net)}
                        </dd>
                      </div>
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PortalCard>

      <PortalCard title={t.payoutsTitle}>
        {payouts.length === 0 ? (
          <p className="text-sm text-muted-grey">{t.noPayouts}</p>
        ) : (
          <ul className="divide-y divide-border">
            {payouts.map((p) => {
              const status: WorkerPayoutRecord['status'] = p.status ?? 'paid';
              const provider = p.provider ? t.history.provider[p.provider] : null;
              return (
                <li key={p._id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-charcoal">{p.reference}</span>
                      <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', HISTORY_CLASSES[status])}>
                        {status === 'paid'
                          ? provider
                            ? `${t.history.paid} · ${provider}`
                            : t.history.paid
                          : status === 'processing'
                            ? t.history.processing
                            : t.history.failed}
                      </span>
                    </p>
                    <p className="text-sm text-muted-grey">
                      {date(p.paidAt)} · {t.jobsCount(p.jobCount)}
                      {p.bankAccountLast4 && ` · ${t.ibanEnding(p.bankAccountLast4)}`}
                    </p>
                    {status === 'failed' && (
                      <p className="text-xs font-medium text-red-700">
                        {p.failureReason ? `${t.history.failedReason(p.failureReason)} – ` : ''}
                        {t.history.failedNote}
                      </p>
                    )}
                    {p.note && <p className="text-xs text-muted-grey">{p.note}</p>}
                  </div>
                  <span className="shrink-0 text-base font-bold text-pine-dark">{f.euro(p.amountCents)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </PortalCard>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <PortalCard title={t.bankTitle} description={t.bankHint}>
          {!bank.iban && (
            <p className={cn('mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900')}>
              <Landmark className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t.noBank}
            </p>
          )}
          <BankForm
            accountHolder={bank.accountHolder}
            maskedIban={bank.iban}
            saved={Boolean(bank.iban)}
            editable={editable}
            onSaved={(saved) => {
              update.bankSaved(saved);
              setData((prev) => (prev ? { ...prev, bank: { accountHolder: saved.accountHolder, iban: saved.iban } } : prev));
            }}
          />
        </PortalCard>

        <PortalCard title={t.method.title} description={t.method.hint}>
          <PayoutMethodForm
            method={payoutMethod}
            hasBank={Boolean(bank.iban)}
            editable={editable}
            payoutDayOfMonth={summary.payoutDayOfMonth}
            onSaved={(saved) => {
              update.payoutMethodSaved(saved);
              setData((prev) => (prev ? { ...prev, payoutMethod: saved } : prev));
            }}
          />
        </PortalCard>
      </div>
    </div>
  );
}

function EarningsPage() {
  const { common: t } = useMessages(portalMessages);
  const { data, error, reload } = useWorkerOverview();
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <PageSkeleton label={t.loading} />;
  if (!data.canAccessJobs) return <NotAvailable text={t.approvedOnly} />;
  return <Earnings />;
}

export default function WorkerEarningsPage() {
  return (
    <RequireRole roles={['worker']}>
      <EarningsPage />
    </RequireRole>
  );
}
