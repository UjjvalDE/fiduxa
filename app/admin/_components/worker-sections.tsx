'use client';

// Extra sections of the admin cleaner detail page (/admin/reinigungskraefte/[id]).

import { useId, useState } from 'react';
import Link from 'next/link';
import { Banknote, CalendarOff, Clock, Loader2, RotateCcw, Save, Star } from 'lucide-react';
import { toast } from 'sonner';

import { StarDisplay } from '@/componets/site/star-rating';
import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import profileMessages from '@/lib/i18n/messages/profile';
import type { AdminPayoutRecord, AdminReview, Holiday, WeeklyWindow, WorkerProfile, WorkerStats } from '@/lib/types';
import { cn } from '@/lib/utils';

import adminMessages from '../_messages';
import messages from '../reinigungskraefte/_detail-messages';
import { centsToInput, parseEuroToCents } from './labels';
import { PayoutHistoryTable } from './payout-parts';
import { ReviewList } from './review-list';
import { ErrorState, InfoList, SectionCard } from './states';
import { useApi, useErrorText } from './use-api';

// ---------------------------------------------------------------------------
// Stats tiles
// ---------------------------------------------------------------------------

function Tile({ label, value, hint, children }: { label: string; value: React.ReactNode; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-grey">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-pine-dark">{value}</p>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-grey">{hint}</p>}
    </div>
  );
}

export function WorkerStatsTiles({ stats }: { stats: WorkerStats | null | undefined }) {
  const t = useMessages(messages);
  const p = useMessages(profileMessages);
  const f = useFormat();
  if (!stats) return null;
  const pct = (v: number | null) => (v == null ? '–' : `${f.number(v, { maximumFractionDigits: 0 })} %`);
  const details = stats.ratingDetails
    ? ([
        [p.punctuality, stats.ratingDetails.punctuality],
        [p.quality, stats.ratingDetails.quality],
        [p.friendliness, stats.ratingDetails.friendliness],
      ] as [string, number | null][])
    : [];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label={t.statsLabel}>
      <Tile
        label={t.rating}
        value={
          stats.ratingAvg != null && stats.ratingCount > 0 ? (
            <span className="flex items-center gap-2">
              {f.number(stats.ratingAvg, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              <StarDisplay value={stats.ratingAvg} />
            </span>
          ) : (
            t.noRating
          )
        }
        hint={stats.ratingCount > 0 ? p.ratingsCount(stats.ratingCount) : undefined}
      >
        {details.some(([, v]) => v != null) && (
          <dl className="mt-2 space-y-0.5 text-xs">
            {details.map(([label, v]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="text-muted-grey">{label}</dt>
                <dd className="font-semibold text-charcoal">
                  {v == null ? '–' : f.number(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Tile>
      <Tile label={t.reliability} value={pct(stats.reliabilityPct)} hint={p.reliabilityHint} />
      <Tile label={t.punctuality} value={pct(stats.punctualityPct)} hint={p.punctualityHint} />
      <Tile label={t.jobsCompleted} value={f.number(stats.jobsCompleted)} />
      <Tile label={t.jobsHandedBack} value={f.number(stats.jobsHandedBack)} hint={t.jobsHandedBackHint} />
      <Tile label={t.repeatCustomers} value={f.number(stats.repeatCustomers)} hint={t.repeatCustomersHint} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile info
// ---------------------------------------------------------------------------

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <span className="text-muted-grey">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className="rounded-full border border-sage bg-mint px-2.5 py-0.5 text-xs font-medium text-pine">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function WorkerProfileInfo({ profile }: { profile: WorkerProfile }) {
  const t = useMessages(messages);
  const p = useMessages(profileMessages);
  return (
    <SectionCard id="faehigkeiten" title={t.profileInfo}>
      <div className="mb-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.bio}</h3>
        <p className={cn('mt-1 whitespace-pre-line break-words text-sm', profile.bio ? 'text-charcoal' : 'text-muted-grey')}>
          {profile.bio || t.noBio}
        </p>
      </div>
      <InfoList
        items={[
          [t.skills, <Chips key="s" items={(profile.specialties ?? []).map((s) => p.specialties[s] ?? s)} empty={t.noneGiven} />],
          [t.languages, <Chips key="l" items={(profile.languages ?? []).map((l) => p.languages[l] ?? l)} empty={t.noneGiven} />],
          [t.pets, profile.petsOk ? p.petsOk : p.noPets],
          [t.supplies, profile.bringsSupplies ? t.suppliesYes : t.suppliesNo],
          [t.visibility, profile.publicVisible === false ? t.hidden : t.visible],
        ]}
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Weekly hours & holidays (read-only)
// ---------------------------------------------------------------------------

export function WorkerSchedule({ availability, holidays }: { availability: WeeklyWindow[]; holidays: Holiday[] }) {
  const t = useMessages(messages);
  const f = useFormat();
  const byDay = t.weekdays.map((_, i) =>
    availability
      .filter((w) => w.weekday === i + 1)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((w) => `${w.start}–${w.end}`)
  );

  return (
    <SectionCard id="arbeitszeiten" title={t.scheduleTitle} description={t.scheduleHint}>
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-grey">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        {t.weekly}
      </h3>
      {availability.length === 0 ? (
        <p className="mt-1 text-sm text-charcoal">{t.alwaysAvailable}</p>
      ) : (
        <dl className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
          {t.weekdays.map((day, i) => (
            <div key={day} className="flex justify-between gap-3 px-3 py-1.5">
              <dt className="text-charcoal">{day}</dt>
              <dd className={cn('tabular-nums', byDay[i].length ? 'text-charcoal' : 'text-muted-grey')}>
                {byDay[i].length ? byDay[i].join(', ') : t.notAvailable}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <h3 className="mt-5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-grey">
        <CalendarOff className="h-3.5 w-3.5" aria-hidden="true" />
        {t.holidays}
      </h3>
      {holidays.length === 0 ? (
        <p className="mt-1 text-sm text-muted-grey">{t.noHolidays}</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {[...holidays]
            .sort((a, b) => a.from.localeCompare(b.from))
            .map((h) => (
              <li key={h.id} className="rounded-lg border border-border px-3 py-2">
                <span className="font-medium text-charcoal">
                  {h.from === h.to ? f.date(h.from) : `${f.date(h.from)} – ${f.date(h.to)}`}
                </span>
                {h.note && <span className="text-muted-grey"> · {h.note}</span>}
              </li>
            ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Hourly pay
// ---------------------------------------------------------------------------

export function WorkerPayRate({
  workerId,
  payRateCents,
  customPayRate,
  onChanged,
}: {
  workerId: string;
  payRateCents: number;
  customPayRate: boolean;
  onChanged: () => void;
}) {
  const t = useMessages(messages);
  const f = useFormat();
  const errorText = useErrorText();
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState(() => centsToInput(payRateCents));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'save' | 'reset' | null>(null);
  // The review endpoint returns no default rate – the open-payouts summary does.
  const { data: defaults } = useApi<{ defaultRateCents: number }>(customPayRate ? '/admin/payouts/open' : null);
  const defaultRate = customPayRate ? defaults?.defaultRateCents : payRateCents;

  const send = async (payRate: number | null) => {
    setPending(payRate === null ? 'reset' : 'save');
    setError(null);
    try {
      const res = await api.patch<{ payRateCents: number }>(`/admin/workers/${workerId}/pay-rate`, { payRateCents: payRate });
      toast.success(payRate === null ? t.payResetDone : t.paySaved(f.euro(res.payRateCents)));
      setValue(centsToInput(res.payRateCents));
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(null);
    }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseEuroToCents(value);
    if (cents == null || cents > 10000) {
      setError(t.payInvalid);
      return;
    }
    void send(cents);
  };

  return (
    <SectionCard
      id="stundenlohn"
      title={
        <span className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-pine" aria-hidden="true" /> {t.payTitle}
        </span>
      }
      description={t.payDescription}
    >
      <p className="text-2xl font-bold tabular-nums text-pine-dark">{t.perHour(f.euro(payRateCents))}</p>
      <p className="mt-1 text-xs text-muted-grey">
        <span
          className={cn(
            'mr-2 inline-flex rounded-full border px-2 py-0.5 font-semibold',
            customPayRate ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-sage bg-mint text-pine'
          )}
        >
          {customPayRate ? t.payCustom : t.payDefault}
        </span>
        {customPayRate && defaultRate != null && t.defaultIs(f.euro(defaultRate))}
      </p>

      <form onSubmit={save} className="mt-4 space-y-2" noValidate>
        <Label htmlFor={inputId}>{t.payInput}</Label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            disabled={pending !== null}
            className="max-w-[8rem]"
          />
          <Button type="submit" size="sm" className="h-10" disabled={pending !== null}>
            {pending === 'save' ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            {t.paySave}
          </Button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
      {customPayRate && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 px-2 text-muted-grey"
          onClick={() => void send(null)}
          disabled={pending !== null}
        >
          {pending === 'reset' ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
          )}
          {t.payReset}
        </Button>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Reviews & payouts of this cleaner
// ---------------------------------------------------------------------------

export function WorkerReviews({ workerId }: { workerId: string }) {
  const t = useMessages(messages);
  const a = useMessages(adminMessages);
  const { data, error, loading, reload, setData } = useApi<{ reviews: AdminReview[] }>(`/admin/reviews?worker=${workerId}`);
  const update = (next: AdminReview) =>
    setData((prev) => (prev ? { reviews: prev.reviews.map((r) => (r._id === next._id ? next : r)) } : prev));

  return (
    <SectionCard
      id="bewertungen"
      title={
        <span className="flex items-center gap-2">
          <Star className="h-4 w-4 text-pine" aria-hidden="true" /> {t.reviewsTitle}
        </span>
      }
      actions={
        <Link href="/admin/bewertungen" className="text-sm font-semibold text-pine underline-offset-4 hover:underline">
          {t.allReviews}
        </Link>
      }
    >
      {loading && !data ? (
        <p className="text-sm text-muted-grey" role="status">
          {a.ui.loading}…
        </p>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.reviews.length === 0 ? (
        <p className="text-sm text-muted-grey">{t.reviewsEmpty}</p>
      ) : (
        <ReviewList reviews={data.reviews} onChanged={update} showWorker={false} />
      )}
    </SectionCard>
  );
}

export function WorkerPayouts({ workerId }: { workerId: string }) {
  const t = useMessages(messages);
  const a = useMessages(adminMessages);
  const { data, error, loading, reload } = useApi<{ payouts: AdminPayoutRecord[] }>(`/admin/payouts?worker=${workerId}`);

  return (
    <SectionCard
      id="auszahlungen"
      title={
        <span className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-pine" aria-hidden="true" /> {t.payoutsTitle}
        </span>
      }
      actions={
        <Link href="/admin/auszahlungen" className="text-sm font-semibold text-pine underline-offset-4 hover:underline">
          {t.openPayouts}
        </Link>
      }
    >
      {loading && !data ? (
        <p className="text-sm text-muted-grey" role="status">
          {a.ui.loading}…
        </p>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.payouts.length === 0 ? (
        <p className="text-sm text-muted-grey">{t.payoutsEmpty}</p>
      ) : (
        <PayoutHistoryTable payouts={data.payouts} showWorker={false} />
      )}
    </SectionCard>
  );
}
