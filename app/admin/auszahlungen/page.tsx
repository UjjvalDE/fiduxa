'use client';

import { Suspense, useId, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Banknote, ChevronDown, ChevronUp, Clock, PauseCircle, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Checkbox } from '@/componets/ui/checkbox';
import { Label } from '@/componets/ui/lable';
import { Tabs, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminPayoutRecord, OpenPayoutGroup, OpenPayoutsResponse } from '@/lib/types';
import { cn } from '@/lib/utils';

import cashMessages from '../_cash-messages';
import { ConfirmAction } from '../_components/confirm-action';
import { PayoutHistoryTable, PayoutHoldButton, PayoutStatusBadge } from '../_components/payout-parts';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '../_components/states';
import { useApi, useQueryParams } from '../_components/use-api';
import messages from './_messages';

const KEYS = ['tab'] as const;

function TotalTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Wallet;
  tone: 'due' | 'pending' | 'hold';
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid h-10 w-10 place-items-center rounded-xl',
            tone === 'due' ? 'bg-amber-50 text-amber-700' : tone === 'pending' ? 'bg-sky-50 text-sky-700' : 'bg-red-50 text-red-700'
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-grey">{label}</p>
          <p className="text-xl font-bold tabular-nums text-pine-dark">{value}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-grey">{hint}</p>
    </div>
  );
}

function MarkPaidAction({ group, onDone }: { group: OpenPayoutGroup; onDone: () => void }) {
  const t = useMessages(messages);
  const cash = useMessages(cashMessages);
  const f = useFormat();
  const [includeNotYetDue, setIncludeNotYetDue] = useState(false);
  const checkboxId = useId();
  // Net amounts: negative = the cleaner kept more cash than they earned
  const amountCents = group.dueCents + (includeNotYetDue ? group.pendingCents : 0);
  const settle = amountCents < 0;
  const settleTrigger = group.dueCents < 0;

  const submit = async (note: string) => {
    const res = await api.post<{ payout: AdminPayoutRecord }>('/admin/payouts', {
      workerId: group.worker._id,
      includeNotYetDue,
      note,
    });
    toast.success(t.paidToast(res.payout.reference), {
      description: t.paidToastText(f.euro(res.payout.amountCents), group.worker.name),
    });
    onDone();
  };

  return (
    <ConfirmAction
      trigger={
        <>
          <Banknote className="mr-2 h-4 w-4" aria-hidden="true" />
          {settleTrigger ? cash.markSettled : t.markPaid}
        </>
      }
      triggerVariant="default"
      triggerSize="sm"
      title={settle ? cash.markSettledTitle(group.worker.name) : t.markPaidTitle(group.worker.name)}
      description={
        settle ? (
          <div className="space-y-3">
            <p className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{cash.markSettledWarning(f.euro(-amountCents))}</span>
            </p>
            <p className="text-sm font-semibold text-charcoal">{cash.settleAmount(f.euro(amountCents))}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t.markPaidWarning}</span>
            </p>
            <p className="text-sm font-semibold text-charcoal">{t.markPaidAmount(f.euro(amountCents))}</p>
            <p className="text-sm">{t.markPaidTo(group.worker.bankAccountHolder, group.worker.bankAccountLast4)}</p>
            <p className="text-xs text-muted-grey">{cash.netHint}</p>
          </div>
        )
      }
      confirmLabel={settle ? cash.markSettled : t.markPaid}
      withNote
      onOpenChange={(open) => {
        if (!open) setIncludeNotYetDue(false);
      }}
      onConfirm={submit}
    >
      {group.pendingCents > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-border p-3">
          <Checkbox
            id={checkboxId}
            checked={includeNotYetDue}
            onCheckedChange={(value) => setIncludeNotYetDue(value === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label htmlFor={checkboxId} className="cursor-pointer leading-snug">
              {t.includeNotYetDue}
            </Label>
            <p className="text-xs text-muted-grey">{t.includeNotYetDueHint(f.euro(group.pendingCents))}</p>
          </div>
        </div>
      )}
    </ConfirmAction>
  );
}

function WorkerGroup({ group, onChanged }: { group: OpenPayoutGroup; onChanged: () => void }) {
  const t = useMessages(messages);
  const cash = useMessages(cashMessages);
  const f = useFormat();
  const hasDueJobs = group.jobs.some((job) => job.status === 'due');
  const [open, setOpen] = useState(group.dueCents !== 0);
  const tableId = useId();
  const w = group.worker;

  return (
    <section className="rounded-2xl border border-border bg-white shadow-sm" aria-label={w.name}>
      <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Link href={`/admin/reinigungskraefte/${w._id}`} className="text-base font-semibold text-pine-dark hover:underline">
            {w.name}
          </Link>
          <p className="truncate text-xs text-muted-grey">{w.email}</p>
          <p className="mt-1 text-sm text-charcoal">
            {w.bankAccountLast4 ? (
              <>
                <span className="text-muted-grey">{t.iban} </span>
                <span className="font-mono">{t.ibanEnding(w.bankAccountLast4)}</span>
                {w.bankAccountHolder && <span className="text-muted-grey"> · {t.holder}: </span>}
                {w.bankAccountHolder}
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {t.noBank}
              </span>
            )}
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-4 text-sm sm:gap-8">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.due}</dt>
            <dd
              className={cn(
                'font-semibold tabular-nums',
                group.dueCents < 0 ? 'text-red-700' : group.dueCents > 0 ? 'text-amber-800' : 'text-charcoal'
              )}
            >
              {f.euro(group.dueCents)}
            </dd>
            {group.dueCents < 0 && (
              <dd className="mt-0.5 text-xs font-semibold text-red-700" title={cash.owesHint}>
                {cash.owes(f.euro(-group.dueCents))}
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.pending}</dt>
            <dd className="font-semibold tabular-nums text-charcoal">{f.euro(group.pendingCents)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.onHold}</dt>
            <dd className={cn('font-semibold tabular-nums', group.onHoldCents > 0 ? 'text-red-700' : 'text-charcoal')}>
              {f.euro(group.onHoldCents)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          {hasDueJobs && group.dueCents !== 0 && <MarkPaidAction group={group} onDone={onChanged} />}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={tableId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <ChevronUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            {open ? t.hideJobs : t.showJobs(group.jobs.length)}
          </Button>
        </div>
      </div>

      {open && (
        <div id={tableId} className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[980px] text-sm">
            <caption className="sr-only">{t.jobsCaption(w.name)}</caption>
            <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colReference}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colDate}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{t.colHours}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{cash.colPay}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{cash.colCash}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{cash.colNet}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colEarned}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colDueAt}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colStatus}</th>
                <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">{t.colActions}</span></th>
              </tr>
            </thead>
            <tbody>
              {group.jobs.map((job) => (
                <tr key={job._id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/admin/buchungen/${job._id}`} className="font-mono font-semibold text-pine hover:underline">
                      {job.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{f.date(job.date)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.hours(job.minutes)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.euro(job.amountCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-grey">
                    {job.cashHeldCents ? `− ${f.euro(job.cashHeldCents)}` : '–'}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right font-semibold tabular-nums',
                      (job.netCents ?? job.amountCents) < 0 && 'text-red-700'
                    )}
                  >
                    {f.euro(job.netCents ?? job.amountCents - (job.cashHeldCents ?? 0))}
                  </td>
                  <td className="px-4 py-3 text-muted-grey">{f.dateTime(job.earnedAt)}</td>
                  <td className="px-4 py-3 text-muted-grey">{f.dateTime(job.dueAt)}</td>
                  <td className="px-4 py-3">
                    <PayoutStatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PayoutHoldButton bookingId={job._id} status={job.status} onChanged={onChanged} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OpenPayouts() {
  const t = useMessages(messages);
  const cash = useMessages(cashMessages);
  const f = useFormat();
  const { data, error, loading, reload } = useApi<OpenPayoutsResponse>('/admin/payouts/open');

  if (loading && !data) return <ListSkeleton label={t.loading} />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3" role="group" aria-label={t.totalsLabel}>
        <TotalTile label={t.totalDue} value={f.euro(data.totals.dueCents)} hint={t.totalDueHint} icon={Wallet} tone="due" />
        <TotalTile
          label={t.totalPending}
          value={f.euro(data.totals.pendingCents)}
          hint={t.totalPendingHint(data.payoutDelayDays)}
          icon={Clock}
          tone="pending"
        />
        <TotalTile
          label={t.totalOnHold}
          value={f.euro(data.totals.onHoldCents)}
          hint={t.totalOnHoldHint}
          icon={PauseCircle}
          tone="hold"
        />
      </div>

      <p className="text-xs text-muted-grey">{cash.netHint}</p>

      {error && <ErrorState message={error} onRetry={reload} />}

      {data.groups.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyText} icon={Wallet} />
      ) : (
        data.groups.map((group) => <WorkerGroup key={group.worker._id} group={group} onChanged={reload} />)
      )}
    </div>
  );
}

function PayoutHistory() {
  const t = useMessages(messages);
  const { data, error, loading, reload } = useApi<{ payouts: AdminPayoutRecord[] }>('/admin/payouts');

  if (loading && !data) return <ListSkeleton label={t.historyLoading} />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data || data.payouts.length === 0) {
    return <EmptyState title={t.historyEmptyTitle} description={t.historyEmptyText} icon={Banknote} />;
  }
  return <PayoutHistoryTable payouts={data.payouts} />;
}

function PayoutsPageInner() {
  const t = useMessages(messages);
  const { values, setParams } = useQueryParams(KEYS);
  const tab = values.tab === 'verlauf' ? 'verlauf' : '';

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <Tabs value={tab} onValueChange={(value) => setParams({ tab: value })} className="mb-4">
        <TabsList aria-label={t.tabsLabel}>
          <TabsTrigger value="">{t.tabOpen}</TabsTrigger>
          <TabsTrigger value="verlauf">{t.tabHistory}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'verlauf' ? <PayoutHistory /> : <OpenPayouts />}
    </>
  );
}

export default function PayoutsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <PayoutsPageInner />
    </Suspense>
  );
}
