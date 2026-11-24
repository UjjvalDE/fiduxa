'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Clock,
  Languages,
  LoaderCircle,
  MapPin,
  PawPrint,
  Repeat,
  SearchX,
  Sparkles,
  SprayCan,
  Star,
  type LucideIcon,
} from 'lucide-react';

import { CleanerAvatar } from '@/componets/site/cleaner-avatar';
import { RatingBadge, StarDisplay } from '@/componets/site/star-rating';
import { useFormat, useMessages } from '@/lib/i18n/client';
import profileMessages from '@/lib/i18n/messages/profile';
import type { CleanerProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useApi } from '@/app/admin/_components/use-api';
import { ErrorBox } from '../../buchung/_components/form-field';
import messages from '../_messages';

function Section({ title, icon: Icon, children, className }: { title: string; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-border bg-white p-5 sm:p-6', className)}>
      <h2 className="!m-0 flex items-center gap-2 !text-lg !font-bold !tracking-tight text-pine-dark">
        {Icon && <Icon className="h-5 w-5 shrink-0 text-pine" aria-hidden="true" />}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Chips({ items, label }: { items: string[]; label: string }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={label}>
      {items.map((item) => (
        <li key={item} className="rounded-full border border-border bg-cream px-3 py-1 text-sm font-semibold text-pine-dark">
          {item}
        </li>
      ))}
    </ul>
  );
}

function PercentTile({ label, value, hint, icon: Icon, noData }: { label: string; value: number | null; hint: string; icon: LucideIcon; noData: string }) {
  return (
    <div className="rounded-2xl border border-border bg-cream p-4">
      <p className="m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-grey">
        <Icon className="h-4 w-4 text-pine" aria-hidden="true" /> {label}
      </p>
      {value == null ? (
        <p className="m-0 mt-2 text-sm text-muted-grey">{noData}</p>
      ) : (
        <>
          <p className="m-0 mt-1 text-3xl font-bold tabular-nums text-pine-dark">{value} %</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" aria-hidden="true">
            <div className="h-full rounded-full bg-pine" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
          </div>
        </>
      )}
      <p className="m-0 mt-2 text-xs leading-relaxed text-muted-grey">{hint}</p>
    </div>
  );
}

function NumberTile({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-border bg-cream p-4">
      <p className="m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-grey">
        <Icon className="h-4 w-4 text-pine" aria-hidden="true" /> {label}
      </p>
      <p className="m-0 mt-1 text-3xl font-bold tabular-nums text-pine-dark">{value}</p>
    </div>
  );
}

export function CleanerProfileView({ id }: { id: string }) {
  const t = useMessages(messages);
  const tp = useMessages(profileMessages);
  const f = useFormat();
  const { data, error, errorStatus, loading, reload } = useApi<{ cleaner: CleanerProfile }>(`/cleaners/${encodeURIComponent(id)}`);
  const cleaner = data?.cleaner ?? null;

  const backLink = (
    <Link href="/konto" className="text-link w-fit">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t.profile.back}
    </Link>
  );

  if (loading && !cleaner) {
    return (
      <div className="shell flex min-h-[50vh] items-center justify-center text-sm text-muted-grey" role="status">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> {t.loading}
      </div>
    );
  }

  if (!cleaner) {
    const notFound = errorStatus === 404 || errorStatus === 400;
    return (
      <section className="bg-cream py-12 sm:py-16">
        <div className="shell grid gap-6">
          {backLink}
          {notFound || !error ? (
            <div className="mx-auto grid max-w-lg justify-items-center gap-3 rounded-2xl border border-border bg-white p-8 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-cream text-muted-grey">
                <SearchX className="h-7 w-7" aria-hidden="true" />
              </span>
              <h1 className="!m-0 !text-2xl !leading-tight">{t.profile.notFoundTitle}</h1>
              <p className="m-0 text-sm leading-relaxed text-muted-grey">{t.profile.notFoundText}</p>
              <Link href="/konto" className="button button-small mt-2">
                {t.profile.back}
              </Link>
            </div>
          ) : (
            <ErrorBox message={error} onRetry={reload} retryLabel={t.retry} />
          )}
        </div>
      </section>
    );
  }

  const stats = cleaner.stats;
  const details = stats.ratingDetails;
  const memberSince = cleaner.memberSince
    ? new Date(cleaner.memberSince).toLocaleDateString(f.tag, { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })
    : null;
  const languages = cleaner.languages.map((l) => tp.languages[l] ?? l);
  const skills = cleaner.specialties.map((s) => tp.specialties[s] ?? s);

  return (
    <>
      <section className="border-b border-border bg-cream">
        <div className="shell grid gap-6 py-8 sm:py-12">
          {backLink}
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <CleanerAvatar name={cleaner.firstName} src={cleaner.avatarUrl} size="xl" alt={tp.photoAlt(cleaner.firstName)} className="shadow-lg" />
            <div className="grid min-w-0 gap-2">
              <h1 className="!m-0 !text-4xl !leading-tight sm:!text-5xl">{cleaner.firstName}</h1>
              <RatingBadge avg={stats.ratingAvg} count={stats.ratingCount} className="w-fit text-base" />
              <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-sm text-charcoal">
                {memberSince && (
                  <li className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4 text-pine" aria-hidden="true" /> {tp.memberSince} {memberSince}
                  </li>
                )}
                {cleaner.experienceYears > 0 && (
                  <li className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-pine" aria-hidden="true" /> {tp.experience(cleaner.experienceYears)}
                  </li>
                )}
              </ul>
              {(cleaner.petsOk || cleaner.bringsSupplies) && (
                <ul className="m-0 mt-1 flex list-none flex-wrap gap-2 p-0">
                  {cleaner.petsOk && (
                    <li className="inline-flex items-center gap-1.5 rounded-full bg-lime px-3 py-1 text-sm font-bold text-pine-dark">
                      <PawPrint className="h-4 w-4" aria-hidden="true" /> {tp.petsOk}
                    </li>
                  )}
                  {cleaner.bringsSupplies && (
                    <li className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-sm font-bold text-pine-dark">
                      <SprayCan className="h-4 w-4" aria-hidden="true" /> {tp.bringsSupplies}
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-8 sm:py-12">
        <div className="shell grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 gap-5">
            <Section title={t.profile.about(cleaner.firstName)}>
              <p className="m-0 whitespace-pre-line text-[15px] leading-relaxed text-charcoal">{cleaner.bio || <span className="text-muted-grey">{t.profile.noBio}</span>}</p>
            </Section>

            {skills.length > 0 && (
              <Section title={tp.skills} icon={Sparkles}>
                <Chips items={skills} label={tp.skills} />
              </Section>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              {languages.length > 0 && (
                <Section title={tp.spokenLanguages} icon={Languages}>
                  <Chips items={languages} label={tp.spokenLanguages} />
                </Section>
              )}
              {cleaner.serviceAreas.length > 0 && (
                <Section title={tp.areas} icon={MapPin}>
                  <Chips items={cleaner.serviceAreas} label={tp.areas} />
                </Section>
              )}
            </div>

            <Section title={t.profile.reviewsTitle} icon={Star}>
              {cleaner.reviews.length === 0 ? (
                <p className="m-0 text-sm text-muted-grey">{t.profile.noReviews}</p>
              ) : (
                <ul className="m-0 grid list-none gap-4 p-0">
                  {cleaner.reviews.map((r) => (
                    <li key={r._id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <StarDisplay value={r.rating} />
                        <span className="text-xs text-muted-grey">{f.date(r.createdAt, { timeZone: 'Europe/Berlin' })}</span>
                      </div>
                      {r.comment && <p className="mb-0 mt-2 whitespace-pre-line text-sm leading-relaxed text-charcoal">{r.comment}</p>}
                      <p className="mb-0 mt-1 text-xs font-bold text-pine-dark">{r.author || t.profile.anonymous}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <aside className="grid gap-5 lg:sticky lg:top-28">
            <Section title={t.profile.statsTitle}>
              <div className="rounded-2xl border border-border bg-cream p-4">
                <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-grey">{tp.rating}</p>
                {stats.ratingAvg && stats.ratingCount ? (
                  <>
                    <p className="m-0 mt-1 flex items-center gap-3">
                      <span className="text-3xl font-bold tabular-nums text-pine-dark">{f.number(stats.ratingAvg, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                      <StarDisplay value={stats.ratingAvg} size={18} />
                    </p>
                    <p className="m-0 text-xs text-muted-grey">{tp.ratingsCount(stats.ratingCount)}</p>
                    {details && (
                      <dl className="m-0 mt-3 grid gap-1.5 border-t border-border pt-3">
                        {(['punctuality', 'quality', 'friendliness'] as const).map((key) =>
                          details[key] != null ? (
                            <div key={key} className="flex items-center justify-between gap-3 text-sm">
                              <dt className="text-charcoal">{tp[key]}</dt>
                              <dd className="m-0 flex items-center gap-2">
                                <StarDisplay value={details[key] as number} size={14} />
                                <span className="w-7 text-right font-bold tabular-nums text-pine-dark">
                                  {f.number(details[key] as number, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                </span>
                              </dd>
                            </div>
                          ) : null
                        )}
                      </dl>
                    )}
                  </>
                ) : (
                  <p className="m-0 mt-2 text-sm text-muted-grey">{tp.noRatings}</p>
                )}
              </div>
              <div className="mt-3 grid gap-3">
                <PercentTile label={tp.reliability} value={stats.reliabilityPct} hint={tp.reliabilityHint} icon={BadgeCheck} noData={t.profile.noData} />
                <PercentTile label={tp.punctuality} value={stats.punctualityPct} hint={tp.punctualityHint} icon={Clock} noData={t.profile.noData} />
                <div className="grid grid-cols-2 gap-3">
                  <NumberTile label={t.profile.jobsLabel} value={stats.jobsCompleted} icon={Sparkles} />
                  <NumberTile label={tp.repeatCustomers} value={stats.repeatCustomers} icon={Repeat} />
                </div>
              </div>
            </Section>

            <section className="rounded-2xl bg-pine-dark p-5 text-white sm:p-6">
              <h2 className="!m-0 !text-xl !font-bold !tracking-tight !text-white">{t.profile.bookTitle}</h2>
              <p className="mb-0 mt-2 text-sm leading-relaxed text-white/75">{t.profile.bookText}</p>
              <Link href="/buchung" className="button button-light mt-5 w-full justify-center">
                {t.profile.bookButton} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>
          </aside>
        </div>
      </section>
    </>
  );
}
