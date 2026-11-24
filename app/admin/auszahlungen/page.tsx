'use client';

import { Suspense, useId, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Banknote, ChevronDown, ChevronUp, Clock, PauseCircle, RefreshCw, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Checkbox } from '@/componets/ui/checkbox';
import { Label } from '@/componets/ui/lable';
import { RadioGroup, RadioGroupItem } from '@/componets/ui/radio-group';
import { Tabs, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { api, ApiError } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import type { AdminPayoutRecord, OpenPayoutGroup, OpenPayoutsResponse } from '@/lib/types';
import { cn } from '@/lib/utils';

import cashMessages from '../_cash-messages';
import { ConfirmAction } from '../_components/confirm-action';
import { PayoutHistoryTable, PayoutHoldButton, PayoutStatusBadge } from '../_components/payout-parts';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '../_components/states';
import { apiMessage, useApi, useQueryParams } from '../_components/use-api';
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
  tone: 'due' | 'pending' | 'hold' | 'processing';
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid h-10 w-10 place-items-center rounded-xl',
            tone === 'due'
              ? 'bg-amber-50 text-amber-700'
              : tone === 'pending'
                ? 'bg-sky-50 text-sky-700'
                : tone === 'processing'
                  ? 'bg-violet-50 text-violet-700'
                  : 'bg-red-50 text-red-700'
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

/** Preferred payout route of a cleaner: "Bank •••• 1234" or "PayPal a•••@example.com" */
function PayoutRouteChip({ payout }: { payout: OpenPayoutGroup['worker']['payout'] }) {
  const t = useMessages(messages);
  if (!payout?.target) return null;
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-cream px-2.5 py-0.5 text-xs font-medium text-charcoal"
      title={t.routeLabel}
    >
      <Banknote className="h-3.5 w-3.5 text-pine" aria-hidden="true" />
      {payout.type === 'paypal' ? t.routePaypal(payout.target) : t.routeBank(payout.target)}
    </span>
  );
}

function SettleAction({ group, onDone }: { group: OpenPayoutGroup; onDone: () => void }) {
  const t = useMessages(messages);
  const cash = useMessages(cashMessages);
  const f = useFormat();
  const { locale } = useLocale();
  const [includeNotYetDue, setIncludeNotYetDue] = useState(false);
  const [method, setMethod] = useState<'bank' | 'paypal'>(group.worker.payout.type);
  const checkboxId = useId();
  const methodGroupId = useId();
  // Net amounts: negative = the cleaner kept more cash than they earned
  const amountCents = group.dueCents + (includeNotYetDue ? group.pendingCents : 0);
  const jobCount =
    group.jobs.filter((job) => job.status === 'due').length +
    (includeNotYetDue ? group.jobs.filter((job) => job.status === 'pending').length : 0);
  const settle = amountCents < 0;
  const settleTrigger = group.dueCents < 0;
  // PayPal only when the cleaner has a PayPal target and the net amount is positive
  const hasPaypalTarget = group.worker.payout.type === 'paypal' && Boolean(group.worker.payout.target);
  const paypalAllowed = hasPaypalTarget && amountCents > 0;
  const effectiveMethod: 'bank' | 'paypal' = paypalAllowed && method === 'paypal' ? 'paypal' : 'bank';
  const bankTarget = group.worker.bankAccountLast4 ? t.routeBank(t.ibanEnding(group.worker.bankAccountLast4)) : '';
  const target = effectiveMethod === 'paypal' ? t.routePaypal(group.worker.payout.target) : bankTarget;

  const submit = async (note: string) => {
    try {
      const res = await api.post<{ payout: AdminPayoutRecord }>('/admin/payouts', {
        workerId: group.worker._id,
        includeNotYetDue,
        note,
        method: effectiveMethod,
      });
      if (res.payout.status === 'processing') {
        toast.info(t.processingToast(res.payout.reference), { description: t.processingToastText });
      } else {
        toast.success(t.paidToast(res.payout.reference), {
          description: [
            t.paidToastText(f.euro(res.payout.amountCents), group.worker.name),
            res.payout.providerItemId ? t.paypalReference(res.payout.providerItemId) : null,
          ]
            .filter(Boolean)
            .join(' '),
        });
      }
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 502) {
        // Provider refused the payout: it is saved as failed, earnings released
        const failed = (err.body?.payout ?? null) as AdminPayoutRecord | null;
        toast.error(t.failedToast, {
          description: t.failedToastText(apiMessage(failed?.failureReason || err.message, locale)),
        });
        onDone();
        return;
      }
      throw err; // e.g. 409 – shown translated inside the dialog
    }
  };

  const confirmLabel = settle ? cash.markSettled : effectiveMethod === 'paypal' ? t.sendPaypal : t.markPaid;

  return (
    <ConfirmAction
      trigger={
        <>
          <Banknote className="mr-2 h-4 w-4" aria-hidden="true" />
          {settleTrigger ? cash.markSettled : t.settle}
        </>
      }
      triggerVariant="default"
      triggerSize="sm"
      title={settle ? cash.markSettledTitle(group.worker.name) : t.markPaidTitle(group.worker.name)}
      description={
        <div className="space-y-3">
          {settle ? (
            <p className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{cash.markSettledWarning(f.euro(-amountCents))}</span>
            </p>
          ) : null}
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 rounded-lg border border-border bg-cream/50 p-3 text-sm">
            <dt className="text-muted-grey">{t.dlgCleaner}</dt>
            <dd className="font-medium text-charcoal">{group.worker.name}</dd>
            <dt className="text-muted-grey">{t.dlgAmount}</dt>
            <dd className={cn('font-semibold tabular-nums', amountCents < 0 ? 'text-red-700' : 'text-charcoal')}>
              {f.euro(amountCents)}
            </dd>
            <dt className="text-muted-grey">{t.dlgJobs}</dt>
            <dd className="text-charcoal">{t.dlgJobCount(jobCount)}</dd>
            <dt className="text-muted-grey">{t.dlgTarget}</dt>
            <dd className="text-charcoal">{target || t.noBank}</dd>
          </dl>
          <p className="text-xs text-muted-grey">{cash.netHint}</p>
        </div>
      }
      confirmLabel={confirmLabel}
      withNote
      onOpenChange={(open) => {
        if (!open) {
          setIncludeNotYetDue(false);
          setMethod(group.worker.payout.type);
        }
      }}
      onConfirm={submit}
    >
      <fieldset className="space-y-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-grey">{t.methodChoice}</legend>
        <RadioGroup
          value={effectiveMethod}
          onValueChange={(value) => setMethod(value === 'paypal' ? 'paypal' : 'bank')}
          className="gap-3"
        >
          <div className="flex items-start gap-3">
            <RadioGroupItem value="bank" id={`${methodGroupId}-bank`} className="mt-0.5" />
            <div className="space-y-0.5">
              <Label htmlFor={`${methodGroupId}-bank`} className="cursor-pointer leading-snug">
                {t.optionBank}
              </Label>
              <p className="text-xs text-muted-grey">{t.optionBankHint}</p>
            </div>
          </div>
          <div className={cn('flex items-start gap-3', !paypalAllowed && 'opacity-60')}>
            <RadioGroupItem value="paypal" id={`${methodGroupId}-paypal`} className="mt-0.5" disabled={!paypalAllowed} />
            <div className="space-y-0.5">
              <Label
                htmlFor={`${methodGroupId}-paypal`}
                className={cn('leading-snug', paypalAllowed ? 'cursor-pointer' : 'cursor-not-allowed')}
              >
                {t.optionPaypal}
              </Label>
              <p className="text-xs text-muted-grey">
                {!hasPaypalTarget
                  ? t.paypalNoTarget
                  : amountCents <= 0
                    ? t.paypalNotPositive
                    : t.optionPaypalHint(group.worker.payout.target)}
              </p>
            </div>
          </div>
        </RadioGroup>
        {effectiveMethod === 'bank' && !settle && (
          <p className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t.markPaidWarning}</span>
          </p>
        )}
      </fieldset>

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
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/reinigungskraefte/${w._id}`} className="text-base font-semibold text-pine-dark hover:underline">
              {w.name}
            </Link>
            <PayoutRouteChip payout={w.payout} />
          </div>
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

        <dl className={cn('grid gap-4 text-sm sm:gap-8', group.processingCents > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
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
          {group.processingCents > 0 && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.processingLabel}</dt>
              <dd>
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  {f.euro(group.processingCents)}
                </span>
              </dd>
            </div>
          )}
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          {hasDueJobs && group.dueCents !== 0 && <SettleAction group={group} onDone={onChanged} />}
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
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs text-muted-grey sm:px-6">
            <span className="font-medium text-charcoal">{t.sumGross(f.euro(group.grossCents))}</span>
            <span className="font-medium text-charcoal">{t.sumCommission(f.euro(group.commissionCents))}</span>
            <span>{t.commissionHint}</span>
          </p>
          <table className="w-full min-w-[1180px] text-sm">
            <caption className="sr-only">{t.jobsCaption(w.name)}</caption>
            <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colReference}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colDate}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{t.colHours}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{t.colGross}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{cash.colPay}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold" title={t.commissionHint}>{t.colCommission}</th>
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
                  <td className="px-4 py-3 text-right tabular-nums text-muted-grey">
                    {job.grossCents != null ? f.euro(job.grossCents) : '–'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.euro(job.amountCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-grey">
                    {job.commissionCents != null ? f.euro(job.commissionCents) : '–'}
                  </td>
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
      <div
        className={cn('grid gap-4', data.totals.processingCents > 0 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3')}
        role="group"
        aria-label={t.totalsLabel}
      >
        <TotalTile label={t.totalDue} value={f.euro(data.totals.dueCents)} hint={t.totalDueHint} icon={Wallet} tone="due" />
        <TotalTile
          label={t.totalPending}
          value={f.euro(data.totals.pendingCents)}
          hint={t.totalPendingHint(data.payoutDelayDays)}
          icon={Clock}
          tone="pending"
        />
        {data.totals.processingCents > 0 && (
          <TotalTile
            label={t.totalProcessing}
            value={f.euro(data.totals.processingCents)}
            hint={t.totalProcessingHint}
            icon={RefreshCw}
            tone="processing"
          />
        )}
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
  return <PayoutHistoryTable payouts={data.payouts} onChanged={reload} />;
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
