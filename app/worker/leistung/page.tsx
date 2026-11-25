'use client';

// "Leistung & Provision": rating-based commission tier, trust score,
// next-tier progress, tier ladder, earnings totals and review disputes.
// GET /worker/performance, GET /worker/reviews, POST /worker/reviews/:id/dispute.
import { useState } from 'react';
import {
  Award,
  BadgeEuro,
  Check,
  CheckCircle2,
  Info,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { StarDisplay } from '@/componets/site/star-rating';
import { Button } from '@/componets/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/componets/ui/dialog';
import { Skeleton } from '@/componets/ui/skeleton';
import { Textarea } from '@/componets/ui/tesxtarea';
import { api } from '@/lib/api';
import { RequireRole } from '@/lib/auth';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type {
  CommissionTierKey,
  CommissionTiersConfig,
  WorkerPerformanceResponse,
  WorkerReviewItem,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { ErrorState } from '@/app/admin/_components/states';
import { useApi, useErrorText } from '@/app/admin/_components/use-api';

import portalMessages from '../_portal-messages';
import {
  NotAvailable,
  PageSkeleton,
  PageTitle,
  PortalCard,
  StatTile,
  useBerlinDate,
} from '../_components/portal-ui';
import { useWorkerOverview } from '../_components/worker-context';
import messages from './_messages';
import { TierBadge } from './_components/tier-badge';
import { WorkerComplaintsCard } from './_components/complaints-card';

/** Simple progress bar (0–100), green once full */
function Bar({ pct, label }: { pct: number; label?: string }) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-cream"
      role="progressbar"
      aria-valuenow={Math.round(width)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full transition-all', width >= 100 ? 'bg-sage' : 'bg-pine')}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/** One requirement row of the next-tier card */
function RequirementRow({
  label,
  current,
  required,
  fraction,
  met,
  metText,
}: {
  label: string;
  current: string;
  required: string;
  fraction: number;
  met: boolean;
  metText: string;
}) {
  const t = useMessages(messages).next;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
        <span className="font-medium text-charcoal">{label}</span>
        {met ? (
          <span className="inline-flex items-center gap-1 font-semibold text-pine">
            <Check className="h-4 w-4" aria-hidden="true" />
            {metText}
          </span>
        ) : (
          <span className="font-semibold text-pine-dark">{t.of(current, required)}</span>
        )}
      </div>
      <div className="mt-1.5">
        <Bar pct={fraction * 100} label={label} />
      </div>
    </div>
  );
}

const tierPct = (tiers: CommissionTiersConfig, key: CommissionTierKey) =>
  key === 'new' ? tiers.new.commissionPct : tiers[key].commissionPct;

function Performance() {
  const t = useMessages(messages);
  const f = useFormat();
  const { data, error, reload } = useApi<WorkerPerformanceResponse>('/worker/performance');

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <PageSkeleton label={t.loading} />;

  const { counters, tier, trustScore, nextTier, payModel, tierOrder, tiers, totals } = data;
  const pct = (v: number) => f.number(v);
  const rating1 = (v: number) => f.number(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const trust = Math.max(0, Math.min(100, Math.round(trustScore)));

  // Progress towards the next tier, each as a 0–1 fraction (capped)
  const progress = nextTier
    ? {
        jobs: Math.min(counters.jobsCompleted / Math.max(1, nextTier.requirements.minJobs), 1),
        reviews: Math.min(counters.verifiedReviews / Math.max(1, nextTier.requirements.minReviews), 1),
        rating:
          nextTier.missing.rating === 0
            ? 1
            : Math.min((counters.ratingAvg ?? 0) / Math.max(0.1, nextTier.requirements.minRating), 1),
      }
    : null;
  const almost = progress != null && Object.values(progress).every((v) => v >= 0.8);

  return (
    <div className="space-y-5">
      <PageTitle title={t.title} subtitle={t.subtitle} />

      {/* Hero: tier, commission, rating, trust score */}
      <PortalCard>
        <div className="flex flex-wrap items-center gap-3">
          <TierBadge tier={tier.key} big />
          <div className="min-w-0">
            <p className="text-lg font-bold text-pine-dark">{t.hero.commission(pct(tier.effectivePct))}</p>
            <p className="text-sm text-muted-grey">{t.hero.youKeep(pct(100 - tier.effectivePct))}</p>
          </div>
        </div>

        {tier.overridden && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t.hero.overridden}
          </p>
        )}
        {payModel === 'hourly' && (
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-grey">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t.hero.hourlyNote}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            icon={Star}
            tone="accent"
            label={t.counters.rating}
            value={
              counters.ratingAvg != null ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  {rating1(counters.ratingAvg)}
                  <StarDisplay value={counters.ratingAvg} size={14} />
                </span>
              ) : (
                <span className="text-sm font-medium text-muted-grey">{t.hero.noRating}</span>
              )
            }
          />
          <StatTile icon={Sparkles} label={t.counters.reviews} value={f.number(counters.verifiedReviews)} />
          <StatTile icon={CheckCircle2} label={t.counters.jobs} value={f.number(counters.jobsCompleted)} />
          <StatTile
            icon={ShieldCheck}
            label={t.counters.reliability}
            value={counters.reliabilityPct != null ? `${f.number(counters.reliabilityPct)} %` : t.counters.noValue}
          />
        </div>

        {/* Trust score 0–100 */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium text-charcoal">
              <ShieldCheck className="h-4 w-4 text-pine" aria-hidden="true" />
              {t.hero.trust}
            </span>
            <span className="font-semibold text-pine-dark">{t.hero.trustOf(f.number(trust))}</span>
          </div>
          <div className="mt-1.5">
            <Bar pct={trust} label={t.hero.trust} />
          </div>
        </div>
      </PortalCard>

      {/* Next tier with one progress bar per requirement */}
      {nextTier && progress ? (
        <PortalCard title={t.next.title} description={t.next.headline(t.tierNames[nextTier.key], pct(nextTier.commissionPct))}>
          <div className="space-y-4">
            <RequirementRow
              label={t.next.jobs}
              current={f.number(Math.min(counters.jobsCompleted, nextTier.requirements.minJobs))}
              required={f.number(nextTier.requirements.minJobs)}
              fraction={progress.jobs}
              met={nextTier.missing.jobs === 0}
              metText={t.next.of(f.number(nextTier.requirements.minJobs), f.number(nextTier.requirements.minJobs))}
            />
            <RequirementRow
              label={t.next.reviews}
              current={f.number(Math.min(counters.verifiedReviews, nextTier.requirements.minReviews))}
              required={f.number(nextTier.requirements.minReviews)}
              fraction={progress.reviews}
              met={nextTier.missing.reviews === 0}
              metText={t.next.of(f.number(nextTier.requirements.minReviews), f.number(nextTier.requirements.minReviews))}
            />
            <RequirementRow
              label={t.next.rating}
              current={rating1(counters.ratingAvg ?? 0)}
              required={rating1(nextTier.requirements.minRating)}
              fraction={progress.rating}
              met={nextTier.missing.rating === 0}
              metText={t.next.ratingMet(rating1(nextTier.requirements.minRating))}
            />
            {almost && (
              <p className="flex items-start gap-2 rounded-lg border border-sage bg-mint px-3 py-2 text-sm font-medium text-pine-dark">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {t.next.almost}
              </p>
            )}
          </div>
        </PortalCard>
      ) : (
        <p className="flex items-start gap-2 rounded-2xl border border-sage bg-mint p-4 text-sm font-medium text-pine-dark">
          <Award className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t.next.topTier}
        </p>
      )}

      {/* Ladder: all six tiers */}
      <PortalCard title={t.ladder.title}>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tierOrder.map((key) => {
            const current = key === tier.key;
            const req = key === 'new' ? null : tiers[key];
            return (
              <li
                key={key}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'rounded-xl border p-3',
                  current ? 'border-pine bg-mint' : 'border-border bg-white'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <TierBadge tier={key} />
                  <span className="text-sm font-semibold text-pine-dark">{t.ladder.commission(pct(tierPct(tiers, key)))}</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-grey">
                  {req ? t.ladder.requirements(req.minJobs, req.minReviews, rating1(req.minRating)) : t.ladder.start}
                </p>
                {current && <p className="mt-1 text-xs font-semibold text-pine">{t.ladder.current}</p>}
              </li>
            );
          })}
        </ol>
      </PortalCard>

      {/* Earnings totals */}
      <PortalCard title={t.totals.title}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile icon={Wallet} tone="accent" label={t.totals.earnings} value={f.euro(totals.earningsCents)} />
          <StatTile icon={BadgeEuro} label={t.totals.commission} value={f.euro(totals.commissionCents)} />
          <StatTile icon={Send} label={t.totals.gross} value={f.euro(totals.grossCents)} />
        </div>
      </PortalCard>

      <Reviews />
    </div>
  );
}

const DISPUTE_CLASSES: Record<'open' | 'approved' | 'rejected', string> = {
  open: 'border-amber-200 bg-amber-50 text-amber-900',
  approved: 'border-sage bg-mint text-pine-dark',
  rejected: 'border-red-200 bg-red-50 text-red-700',
};

function Reviews() {
  const t = useMessages(messages).reviews;
  const errorText = useErrorText();
  const date = useBerlinDate();
  const { data, error, reload, setData } = useApi<{ reviews: WorkerReviewItem[] }>('/worker/reviews');

  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const close = () => {
    setDisputeId(null);
    setMessage('');
    setFormError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeId) return;
    const clean = message.trim();
    if (clean.length < 10) {
      setFormError(t.tooShort);
      return;
    }
    setFormError(null);
    setPending(true);
    try {
      await api.post(`/worker/reviews/${disputeId}/dispute`, { message: clean });
      setData((prev) =>
        prev
          ? {
              reviews: prev.reviews.map((r) =>
                r._id === disputeId ? { ...r, dispute: { status: 'open' as const, message: clean, adminNote: '' } } : r
              ),
            }
          : prev
      );
      toast.success(t.sent);
      close();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <PortalCard title={t.title}>
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <div className="space-y-3" role="status" aria-label={t.loading}>
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : data.reviews.length === 0 ? (
        <p className="text-sm text-muted-grey">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.reviews.map((r) => (
            <li key={r._id} className={cn('py-3', r.hidden && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-2">
                <StarDisplay value={r.rating} size={14} />
                <span className="text-sm font-semibold text-pine-dark">{r.rating}/5</span>
                {r.hidden && (
                  <span className="inline-flex rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                    {t.hidden}
                  </span>
                )}
                {r.dispute && (
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      DISPUTE_CLASSES[r.dispute.status]
                    )}
                  >
                    {t.dispute[r.dispute.status]}
                  </span>
                )}
              </div>
              {r.comment && <p className="mt-1.5 text-sm text-charcoal">{r.comment}</p>}
              <p className="mt-1 text-xs text-muted-grey">
                {date(r.createdAt)}
                {r.booking && (
                  <>
                    {' · '}
                    <span className="font-mono">{t.booking(r.booking.reference)}</span>
                  </>
                )}
              </p>
              {r.dispute?.adminNote && <p className="mt-1 text-xs text-muted-grey">{t.adminNote(r.dispute.adminNote)}</p>}
              {!r.dispute && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setMessage('');
                    setFormError(null);
                    setDisputeId(r._id);
                  }}
                >
                  {t.disputeCta}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={disputeId !== null} onOpenChange={(open) => !open && !pending && close()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.dialogTitle}</DialogTitle>
            <DialogDescription>{t.dialogText}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} noValidate className="space-y-3">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t.placeholder}
              maxLength={1000}
              rows={4}
              disabled={pending}
              aria-invalid={Boolean(formError)}
              className="text-base"
            />
            {formError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {formError}
              </p>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={close} disabled={pending}>
                {t.cancel}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {t.send}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PortalCard>
  );
}

function PerformancePage() {
  const { common: t } = useMessages(portalMessages);
  const { data, error, reload } = useWorkerOverview();
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <PageSkeleton label={t.loading} />;
  if (!data.canAccessJobs) return <NotAvailable text={t.approvedOnly} />;
  return (
    <>
      <Performance />
      <div className="mt-5">
        <WorkerComplaintsCard />
      </div>
    </>
  );
}

export default function WorkerPerformancePage() {
  return (
    <RequireRole roles={['worker']}>
      <PerformancePage />
    </RequireRole>
  );
}
