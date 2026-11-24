'use client';

import { Fragment, Suspense, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Award,
  Banknote,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Percent,
  Search,
  SlidersHorizontal,
  Star,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/componets/ui/alert-dialog';
import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Textarea } from '@/componets/ui/tesxtarea';
import { api, getStoredToken, qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type {
  AdminCommissionOverview,
  AdminCommissionRow,
  AdminCommissionWorkerDetail,
  CommissionTierKey,
  CommissionTierState,
} from '@/lib/types';
import { cn } from '@/lib/utils';

import { EmptyState, ErrorState, ListSkeleton, NativeSelect, PageHeader } from '../_components/states';
import { berlinToday, useApi, useErrorText, useQueryParams } from '../_components/use-api';
import adminMessages from '../_messages';
import messages from './_messages';

const KEYS = ['tier', 'search', 'sort', 'inactive'] as const;
const TIERS = ['new', 'bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
const SORTS = ['trust', 'rating', 'jobs', 'commission'] as const;
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/$/, '');

const TIER_BADGE: Record<CommissionTierKey, string> = {
  new: 'border-gray-200 bg-gray-100 text-gray-700',
  bronze: 'border-amber-200 bg-amber-50 text-amber-800',
  silver: 'border-slate-200 bg-slate-100 text-slate-700',
  gold: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  platinum: 'border-violet-200 bg-violet-50 text-violet-700',
  diamond: 'border-cyan-200 bg-cyan-50 text-cyan-700',
};

/** "12,5" / "12.5" → 12.5 (null if not a plain number) */
const parseNum = (raw: string): number | null => {
  const v = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
};

function TierBadge({ tier }: { tier: CommissionTierKey }) {
  const t = useMessages(messages);
  return (
    <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', TIER_BADGE[tier])}>
      {t.tierNames[tier]}
    </span>
  );
}

function ManualChip({ reason }: { reason: string | undefined }) {
  const t = useMessages(messages);
  return (
    <span
      className="inline-flex cursor-help rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800"
      title={reason ? t.manualReason(reason) : undefined}
    >
      {t.manualChip}
    </span>
  );
}

function TrustBar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-cream">
        <span className="block h-full rounded-full bg-pine" style={{ width: `${width}%` }} />
      </span>
      <span className="text-xs font-semibold tabular-nums text-charcoal">{Math.round(value)}</span>
    </span>
  );
}

function RatingCell({ rating }: { rating: number | null }) {
  const f = useFormat();
  if (rating == null) return <span className="text-muted-grey">–</span>;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
      {f.number(rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
    </span>
  );
}

function TotalTile({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Wallet; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', tone)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-grey">{label}</p>
          <p className="text-xl font-bold tabular-nums text-pine-dark">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual commission override
// ---------------------------------------------------------------------------

function OverrideDialog({ row, onDone }: { row: AdminCommissionRow; onDone: () => void }) {
  const t = useMessages(messages);
  const ta = useMessages(adminMessages);
  const f = useFormat();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pctId = useId();
  const reasonId = useId();
  const comma = f.locale !== 'en';
  const pctText = (n: number) => `${f.number(n, { maximumFractionDigits: 1 })} %`;

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    if (next) {
      const prefill = row.override ? row.override.commissionPct : row.tier.effectivePct;
      setPct(comma ? String(prefill).replace('.', ',') : String(prefill));
      setReason(row.override?.reason ?? '');
      setError(null);
    }
  };

  const submit = async (value: number | null) => {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError(t.reasonError);
      return;
    }
    setPending(value === null ? 'remove' : 'save');
    setError(null);
    try {
      await api.patch<{ tier: CommissionTierState }>(`/admin/workers/${row.worker._id}/commission-override`, {
        commissionPct: value,
        reason: trimmed,
      });
      toast.success(value === null ? t.overrideRemoved(row.worker.name) : t.overrideSaved(row.worker.name));
      setOpen(false);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(null);
    }
  };

  const save = () => {
    const n = parseNum(pct);
    if (n === null || n < 10 || n > 25 || Math.round(n * 2) !== n * 2) {
      setError(t.pctError);
      return;
    }
    void submit(n);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t.overrideAction}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.overrideTitle(row.worker.name)}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1">
              <p>{t.overrideText}</p>
              <p className="font-medium text-charcoal">
                {t.currentPct(pctText(row.tier.effectivePct))}
                {row.tier.overridden && (
                  <>
                    {' '}
                    <ManualChip reason={row.override?.reason} />
                  </>
                )}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={pctId}>{t.pctLabel}</Label>
            <Input
              id={pctId}
              inputMode="decimal"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              disabled={pending !== null}
              className="w-32"
            />
            <p className="text-xs text-muted-grey">{t.pctHint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={reasonId}>{t.reasonLabel}</Label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              disabled={pending !== null}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          {row.override && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void submit(null)}
              disabled={pending !== null}
              className="sm:mr-auto"
            >
              {pending === 'remove' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t.removeOverride}
            </Button>
          )}
          <AlertDialogCancel disabled={pending !== null}>{ta.ui.cancel}</AlertDialogCancel>
          <Button type="button" onClick={save} disabled={pending !== null}>
            {pending === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t.saveOverride}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Expanded worker detail (next tier + immutable transactions)
// ---------------------------------------------------------------------------

function WorkerDetail({ workerId }: { workerId: string }) {
  const t = useMessages(messages);
  const f = useFormat();
  const { data, error, loading, reload } = useApi<AdminCommissionWorkerDetail>(`/admin/commission/workers/${workerId}`);
  const pctText = (n: number) => `${f.number(n, { maximumFractionDigits: 1 })} %`;

  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 py-2 text-sm text-muted-grey">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t.detailLoading}…
      </p>
    );
  }
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const missing: string[] = [];
  if (data.nextTier) {
    if (data.nextTier.missing.jobs > 0) missing.push(t.missingJobs(data.nextTier.missing.jobs));
    if (data.nextTier.missing.reviews > 0) missing.push(t.missingReviews(data.nextTier.missing.reviews));
    if (data.nextTier.missing.rating > 0) {
      missing.push(t.missingRating(f.number(data.nextTier.missing.rating, { maximumFractionDigits: 1 })));
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sage bg-mint/40 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.nextTierTitle}</p>
        {data.nextTier ? (
          <>
            <p className="mt-0.5 text-sm font-semibold text-pine-dark">
              {t.nextTierLabel(t.tierNames[data.nextTier.key], pctText(data.nextTier.commissionPct))}
            </p>
            <p className="mt-0.5 text-sm text-charcoal">{missing.length > 0 ? missing.join(' · ') : t.nextTierMet}</p>
          </>
        ) : (
          <p className="mt-0.5 text-sm font-semibold text-pine-dark">{t.topTier}</p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pine-dark">{t.transactionsTitle}</h3>
        <p className="mt-0.5 text-xs text-muted-grey">{t.immutableNote}</p>
        {data.transactions.length === 0 ? (
          <p className="mt-2 text-sm italic text-muted-grey">{t.txEmpty}</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">{t.transactionsTitle}</caption>
              <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">{t.txReference}</th>
                  <th scope="col" className="px-3 py-2 font-semibold">{t.txDate}</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">{t.txGross}</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">{t.txPay}</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">{t.txCommission}</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">{t.txPct}</th>
                  <th scope="col" className="px-3 py-2 font-semibold">{t.txTier}</th>
                  <th scope="col" className="px-3 py-2 font-semibold">{t.txStatus}</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx) => (
                  <tr key={tx._id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-mono text-xs font-medium text-charcoal">
                      {tx.reference}
                    </th>
                    <td className="px-3 py-2 whitespace-nowrap">{f.date(tx.date)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.euro(tx.grossCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.euro(tx.amountCents)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{f.euro(tx.commissionCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {tx.commissionPct != null ? pctText(tx.commissionPct) : '–'}
                    </td>
                    <td className="px-3 py-2">
                      {tx.tierKey ? t.tierNames[tx.tierKey] : tx.basis === 'hourly' ? t.txBasisHourly : '–'}
                    </td>
                    <td className="px-3 py-2">{t.txStatuses[tx.status] ?? tx.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ProvisionInner() {
  const t = useMessages(messages);
  const f = useFormat();
  const errorText = useErrorText();
  const { values, setParams } = useQueryParams(KEYS);
  const tier = (TIERS as readonly string[]).includes(values.tier) ? values.tier : '';
  const sort = (SORTS as readonly string[]).includes(values.sort) ? values.sort : 'trust';
  const search = values.search;
  const [searchInput, setSearchInput] = useState(search);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const searchId = useId();
  const tierId = useId();
  const sortId = useId();
  const pctText = (n: number) => `${f.number(n, { maximumFractionDigits: 1 })} %`;

  useEffect(() => {
    setSearchInput(search);
  }, [search]);
  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== search) setParams({ search: searchInput || null });
    }, 400);
    return () => clearTimeout(handle);
  }, [searchInput, search, setParams]);

  const { data, error, loading, reload } = useApi<AdminCommissionOverview>(
    `/admin/commission${qs({ tier, search, sort, inactive: values.inactive === '1' ? '1' : undefined })}`
  );
  const workers = data?.workers ?? [];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE}/admin/commission/report?format=csv`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        cache: 'no-store',
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiduxa-provision-${berlinToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setExporting(false);
    }
  };

  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id));

  const statGrid = (row: AdminCommissionRow): [string, React.ReactNode][] => [
    [t.colRating, <RatingCell key="rating" rating={row.counters.ratingAvg} />],
    [t.colReviews, f.number(row.counters.verifiedReviews)],
    [t.colJobs, f.number(row.counters.jobsCompleted)],
    [t.colReliability, row.counters.reliabilityPct != null ? pctText(row.counters.reliabilityPct) : '–'],
    [t.colTrust, <TrustBar key="trust" value={row.trustScore} />],
    [t.colCommission, f.euro(row.totals.commissionCents)],
  ];

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button type="button" variant="outline" onClick={() => void exportCsv()} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {t.exportCsv}
          </Button>
        }
      />

      {data && data.payModel === 'hourly' && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t.hourlyModelNote}</span>
          <Link href="/admin/einstellungen#provision-stufen" className="font-semibold text-pine underline hover:no-underline">
            {t.hourlyModelLink}
          </Link>
        </p>
      )}

      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TotalTile label={t.totalWorkers} value={f.number(data.totals.workers)} icon={Users} tone="bg-mint text-pine" />
          <TotalTile
            label={t.totalCommission}
            value={f.euro(data.totals.commissionCents)}
            icon={Percent}
            tone="bg-violet-50 text-violet-700"
          />
          <TotalTile
            label={t.totalEarnings}
            value={f.euro(data.totals.earningsCents)}
            icon={Wallet}
            tone="bg-sky-50 text-sky-700"
          />
          <TotalTile
            label={t.totalGross}
            value={f.euro(data.totals.grossCents)}
            icon={Banknote}
            tone="bg-amber-50 text-amber-700"
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor={searchId}>{t.searchLabel}</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-grey"
              aria-hidden="true"
            />
            <Input
              id={searchId}
              type="search"
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t.searchPlaceholder}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={tierId}>{t.tierFilterLabel}</Label>
          <NativeSelect id={tierId} className="w-44" value={tier} onChange={(e) => setParams({ tier: e.target.value || null })}>
            <option value="">{t.tierAll}</option>
            {TIERS.map((key) => (
              <option key={key} value={key}>
                {t.tierNames[key]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={sortId}>{t.sortLabel}</Label>
          <NativeSelect id={sortId} className="w-44" value={sort} onChange={(e) => setParams({ sort: e.target.value })}>
            <option value="trust">{t.sortTrust}</option>
            <option value="rating">{t.sortRating}</option>
            <option value="jobs">{t.sortJobs}</option>
            <option value="commission">{t.sortCommission}</option>
          </NativeSelect>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-charcoal">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={values.inactive === '1'}
            onChange={(e) => setParams({ inactive: e.target.checked ? '1' : null })}
          />
          {t.showInactive}
        </label>
      </div>

      {loading && !data ? (
        <ListSkeleton label={t.loading} />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : workers.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyText} icon={Award} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-white shadow-sm lg:block">
            <table className="w-full min-w-[960px] text-sm">
              <caption className="sr-only">{t.tableCaption}</caption>
              <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t.colName}</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">{t.colTier}</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">{t.colPct}</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">{t.colRating}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t.colReviews}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t.colJobs}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t.colReliability}</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">{t.colTrust}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t.colCommission}</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((row) => {
                  const id = row.worker._id;
                  const open = expanded === id;
                  return (
                    <Fragment key={id}>
                      <tr className="border-b border-border last:border-0">
                        <th scope="row" className="px-4 py-3 text-left">
                          <span className="block font-semibold text-charcoal">{row.worker.name}{row.worker.isActive === false && <span className="ml-2 inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">{t.inactiveBadge}</span>}</span>
                          <span className="block text-xs font-normal text-muted-grey">{row.worker.email}</span>
                        </th>
                        <td className="px-3 py-3"><TierBadge tier={row.tier.key} /></td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-charcoal">
                            {pctText(row.tier.effectivePct)}
                            {row.tier.overridden && <ManualChip reason={row.override?.reason} />}
                          </span>
                        </td>
                        <td className="px-3 py-3"><RatingCell rating={row.counters.ratingAvg} /></td>
                        <td className="px-3 py-3 text-right tabular-nums">{f.number(row.counters.verifiedReviews)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{f.number(row.counters.jobsCompleted)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {row.counters.reliabilityPct != null ? pctText(row.counters.reliabilityPct) : '–'}
                        </td>
                        <td className="px-3 py-3"><TrustBar value={row.trustScore} /></td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">{f.euro(row.totals.commissionCents)}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <OverrideDialog row={row} onDone={reload} />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => toggle(id)}
                              aria-expanded={open}
                              aria-label={open ? t.hideDetails(row.worker.name) : t.showDetails(row.worker.name)}
                            >
                              {open ? (
                                <ChevronUp className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border last:border-0">
                          <td colSpan={10} className="bg-cream/40 px-4 py-4">
                            <WorkerDetail workerId={id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 lg:hidden">
            {workers.map((row) => {
              const id = row.worker._id;
              const open = expanded === id;
              return (
                <li key={id} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-charcoal">{row.worker.name}{row.worker.isActive === false && <span className="ml-2 inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">{t.inactiveBadge}</span>}</p>
                      <p className="break-words text-xs text-muted-grey">{row.worker.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <TierBadge tier={row.tier.key} />
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums text-charcoal">
                        {pctText(row.tier.effectivePct)}
                        {row.tier.overridden && <ManualChip reason={row.override?.reason} />}
                      </span>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                    {statGrid(row).map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-grey">{label}</dt>
                        <dd className="mt-0.5 text-charcoal">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <OverrideDialog row={row} onDone={reload} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => toggle(id)} aria-expanded={open}>
                      {open ? (
                        <ChevronUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      )}
                      {open ? t.hideDetails(row.worker.name) : t.showDetails(row.worker.name)}
                    </Button>
                  </div>
                  {open && (
                    <div className="mt-3 border-t border-border pt-3">
                      <WorkerDetail workerId={id} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

export default function ProvisionPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ProvisionInner />
    </Suspense>
  );
}
