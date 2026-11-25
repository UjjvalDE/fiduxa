'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Banknote,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Hourglass,
  Lightbulb,
  ShieldCheck,
  Star,
  Timer,
  UserRound,
  Wallet,
} from 'lucide-react';

import { CleanerAvatar } from '@/componets/site/cleaner-avatar';
import { RatingBadge, StarDisplay } from '@/componets/site/star-rating';
import { Skeleton } from '@/componets/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { RequireRole } from '@/lib/auth';
import { useFormat, useMessages } from '@/lib/i18n/client';
import profileMessages from '@/lib/i18n/messages/profile';
import type { WorkerOverview } from '@/lib/types';
import { ErrorState } from '@/app/admin/_components/states';
import { type ApiState, useApi } from '@/app/admin/_components/use-api';

import cashMessages from './_cash-messages';
import { PendingWorkerFeedback } from './_components/job-feedback';
import { NeedsConfirmationList } from './_components/job-confirmation';
import messages from './_messages';
import portalMessages from './_portal-messages';
import { JobCard, type WorkerJobWithSlot } from './_components/job-card';
import { OpenJobsPanel, type OpenJobsResponse } from './_components/open-jobs';
import { AutoBoardInfo, AutoNotices, isAutoMode } from './_components/auto-assign';
import { PageSkeleton, PortalCard, StatTile } from './_components/portal-ui';
import { SetupChecklist } from './_components/setup';
import { StatusBanner } from './_components/status-banner';
import { canEditProfile, setupComplete, useWorkerOverview } from './_components/worker-context';

// ---------------------------------------------------------------------------
// Jobs tabs (open / today / upcoming / past)
// ---------------------------------------------------------------------------

type Scope = 'today' | 'upcoming' | 'past';
type JobsResponse = { jobs: WorkerJobWithSlot[]; unread?: Record<string, number> };

function JobsList({ scope }: { scope: Scope }) {
  const state = useApi<JobsResponse>(`/worker/jobs?scope=${scope}`);
  return <JobsListView scope={scope} state={state} />;
}

function JobsListView({ scope, state }: { scope: Scope; state: ApiState<JobsResponse> }) {
  const t = useMessages(messages).home;
  const { data, error, reload } = state;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data)
    return (
      <div className="space-y-3" role="status" aria-label={t.jobsLoading}>
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    );
  if (data.jobs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-white px-6 py-10 text-center">
        <CalendarCheck className="h-6 w-6 text-sage" aria-hidden="true" />
        <p className="text-sm text-muted-grey">{t.empty[scope]}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {data.jobs.map((job) => (
        <li key={job._id}>
          <JobCard job={job} unread={data.unread?.[job._id] ?? 0} />
        </li>
      ))}
    </ul>
  );
}

const tabTriggerClass =
  'min-h-[48px] whitespace-normal px-1 text-sm leading-tight data-[state=active]:bg-mint data-[state=active]:text-pine-dark sm:text-base';

function JobsSection() {
  const t = useMessages(messages).home;
  // Auto mode: jobs are assigned automatically – no open-job board
  const auto = isAutoMode(useWorkerOverview().data);
  const openJobs = useApi<OpenJobsResponse>(auto ? null : '/worker/jobs/open');
  const todayJobs = useApi<JobsResponse>('/worker/jobs?scope=today');
  const [tabChoice, setTabChoice] = useState<string | null>(null);
  const openCount = openJobs.data?.jobs.length ?? 0;
  // Default: open jobs first when there is something to grab and nothing to do today
  const tab =
    tabChoice ?? (!auto && openJobs.data && todayJobs.data && openCount > 0 && todayJobs.data.jobs.length === 0 ? 'open' : 'today');

  // Auto-refresh the open jobs every 60 s while that tab is shown and the page is visible
  const reloadOpen = openJobs.reload;
  useEffect(() => {
    if (tab !== 'open') return;
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') reloadOpen();
    };
    const timer = window.setInterval(refreshIfVisible, 60_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [tab, reloadOpen]);

  return (
    <section aria-labelledby="jobs-title" className="space-y-3">
      <h2 id="jobs-title" className="text-lg font-semibold text-pine-dark">
        {t.jobsTitle}
      </h2>
      <Tabs value={tab} onValueChange={setTabChoice}>
        <TabsList className={`grid h-auto w-full ${auto ? 'grid-cols-3' : 'grid-cols-4'} gap-1 bg-white p-1`}>
          <TabsTrigger value="open" className={tabTriggerClass} hidden={auto}>
            <span className="flex flex-wrap items-center justify-center gap-1">
              {t.tabs.open}
              {openCount > 0 && (
                <span
                  aria-hidden="true"
                  className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-pine px-1.5 text-xs font-bold text-white"
                >
                  {openCount}
                </span>
              )}
            </span>
            {openCount > 0 && <span className="sr-only"> ({t.openCount(openCount)})</span>}
          </TabsTrigger>
          <TabsTrigger value="today" className={tabTriggerClass}>
            {t.tabs.today}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className={tabTriggerClass}>
            {t.tabs.upcoming}
          </TabsTrigger>
          <TabsTrigger value="past" className={tabTriggerClass}>
            {t.tabs.past}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="mt-3">
          {auto ? <AutoBoardInfo /> : <OpenJobsPanel
            state={openJobs}
            onAccepted={() => {
              openJobs.reload();
              todayJobs.reload();
              setTabChoice('upcoming');
            }}
          />}
        </TabsContent>
        <TabsContent value="today" className="mt-3">
          <JobsListView scope="today" state={todayJobs} />
        </TabsContent>
        <TabsContent value="upcoming" className="mt-3">
          <JobsList scope="upcoming" />
        </TabsContent>
        <TabsContent value="past" className="mt-3">
          <JobsList scope="past" />
        </TabsContent>
      </Tabs>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dashboard (approved)
// ---------------------------------------------------------------------------

type Hint = { text: string; href?: string; action?: string };

function useHints(data: WorkerOverview): Hint[] {
  const t = useMessages(portalMessages).dashboard;
  const f = useFormat();
  const profile = data.worker.workerProfile;
  const stats = data.stats;
  const hints: Hint[] = [];
  if (!data.worker.avatarUrl) hints.push({ text: t.hints.photo, href: '/worker/profil', action: t.hintAction.photo });
  else if (!profile?.bio?.trim()) hints.push({ text: t.hints.bio, href: '/worker/profil', action: t.hintAction.profile });
  else if (!profile?.specialties?.length)
    hints.push({ text: t.hints.skills, href: '/worker/profil', action: t.hintAction.profile });

  if (stats) {
    if (stats.reliabilityPct != null && stats.reliabilityPct < 90) hints.push({ text: t.hints.reliabilityLow(stats.reliabilityPct) });
    else if (stats.punctualityPct != null && stats.punctualityPct < 85)
      hints.push({ text: t.hints.punctualityLow(stats.punctualityPct) });

    const rating = stats.ratingAvg != null && stats.ratingCount > 0 ? stats.ratingAvg : null;
    const r = rating != null ? f.number(rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '';
    if (rating == null) hints.push({ text: t.hints.noRatings });
    else if (rating >= 4.5) hints.push({ text: t.hints.ratingGreat(r) });
    else if (rating >= 3.8) hints.push({ text: t.hints.ratingGood(r) });
    else hints.push({ text: t.hints.ratingLow(r) });
  }
  if (hints.length === 0) hints.push({ text: t.hints.allGood });
  return hints.slice(0, 2);
}

function Dashboard({ data }: { data: WorkerOverview }) {
  const t = useMessages(portalMessages).dashboard;
  const home = useMessages(messages).home;
  const pm = useMessages(profileMessages);
  const cm = useMessages(cashMessages).dashboard;
  const f = useFormat();
  const hints = useHints(data);
  const { worker, stats, earnings } = data;
  const firstName = worker.name.split(' ')[0];
  const waiting = earnings ? earnings.pendingCents + earnings.dueCents : null;
  const pct = (v: number | null | undefined) => (v == null ? t.noValue : `${f.number(v)} %`);
  // Waiting sums are net (pay minus cash kept) and can be negative = owed to Fiduxa
  const cashHeld = earnings?.cashHeldCents ?? 0;
  const waitingHint = [
    earnings && earnings.dueCents > 0 ? t.waitingDue(f.euro(earnings.dueCents)) : null,
    cashHeld > 0 ? cm.netHint : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-5">
      <AutoNotices overview={data} />
      <div className="flex items-center gap-4">
        <CleanerAvatar name={worker.name} src={worker.avatarUrl} size="md" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-pine-dark">{home.hello(firstName)}</h1>
          <p className="text-sm text-muted-grey">{t.subtitle}</p>
        </div>
      </div>

      {!setupComplete(data) && (
        <Link
          href="/worker/einrichtung"
          className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="flex-1">{t.setupIncomplete}</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}

      {/* Internal feedback pop-up for completed jobs (until answered or dismissed) */}
      <PendingWorkerFeedback />
      <section aria-labelledby="stats-title" className="space-y-3">
        <h2 id="stats-title" className="sr-only">
          {t.statsTitle}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile icon={Wallet} tone="accent" label={t.thisMonth} value={f.euro(earnings?.thisMonthCents ?? 0)} />
          <StatTile
            icon={Hourglass}
            tone={(waiting ?? 0) < 0 ? 'warn' : 'default'}
            label={t.waiting}
            value={
              (waiting ?? 0) < 0 ? (
                <span className="text-base text-red-700">{cm.owed(f.euro(-(waiting ?? 0)))}</span>
              ) : (
                f.euro(waiting ?? 0)
              )
            }
            hint={waitingHint || undefined}
          />
          {cashHeld > 0 && (
            <StatTile icon={Banknote} tone="warn" label={cm.cashTile} value={f.euro(cashHeld)} hint={cm.cashTileHint} />
          )}
          <StatTile
            icon={Star}
            label={t.rating}
            value={
              stats?.ratingAvg && stats.ratingCount ? (
                <span className="flex flex-wrap items-center gap-2">
                  {f.number(stats.ratingAvg, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  <StarDisplay value={stats.ratingAvg} size={14} />
                </span>
              ) : (
                <RatingBadge avg={null} count={0} />
              )
            }
            hint={stats?.ratingCount ? pm.ratingsCount(stats.ratingCount) : undefined}
          />
          <StatTile icon={ShieldCheck} label={pm.reliability} value={pct(stats?.reliabilityPct)} hint={pm.reliabilityHint} />
          <StatTile icon={Timer} label={pm.punctuality} value={pct(stats?.punctualityPct)} hint={pm.punctualityHint} />
          <StatTile icon={CheckCircle2} label={t.jobsCompleted} value={f.number(stats?.jobsCompleted ?? 0)} />
          <StatTile icon={CalendarClock} label={t.upcoming} value={f.number(data.upcomingCount)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/worker/verdienst"
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-pine hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t.toEarnings} <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/worker/kalender"
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-pine hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t.toCalendar} <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="hint-title" className="rounded-2xl border border-sage bg-mint/60 p-4">
        <h2 id="hint-title" className="flex items-center gap-2 text-sm font-semibold text-pine-dark">
          <Lightbulb className="h-4 w-4" aria-hidden="true" />
          {t.hintTitle}
        </h2>
        <ul className="mt-2 space-y-2">
          {hints.map((hint) => (
            <li key={hint.text} className="text-sm text-charcoal">
              {hint.text}
              {hint.href && (
                <Link
                  href={hint.href}
                  className="ml-1 inline-flex min-h-[44px] items-center font-semibold text-pine underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {hint.action}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <NeedsConfirmationList />
      <JobsSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not approved (yet): compact status with links
// ---------------------------------------------------------------------------

function LinkCard({ href, icon: Icon, title, text, cta }: { href: string; icon: typeof Clock; title: string; text: string; cta: string }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-border bg-white p-5 shadow-sm transition hover:border-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="flex items-center gap-2 text-base font-semibold text-pine-dark">
        <Icon className="h-5 w-5 text-pine" aria-hidden="true" />
        {title}
      </p>
      <p className="mt-1 text-sm text-muted-grey">{text}</p>
      <span className="mt-3 flex items-center text-sm font-semibold text-pine">
        {cta} <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
}

function PendingHome({ data }: { data: WorkerOverview }) {
  const t = useMessages(portalMessages).pendingHome;
  const home = useMessages(messages).home;
  const firstName = data.worker.name.split(' ')[0];
  const done = Object.values(data.checklist).filter(Boolean).length;
  const total = Object.values(data.checklist).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-pine-dark">{home.hello(firstName)}</h1>
        <p className="text-sm text-muted-grey">{home.subtitle}</p>
      </div>

      <StatusBanner overview={data} />

      <PortalCard title={t.title} description={t.progress(done, total)}>
        <div
          className="mb-4 h-2 overflow-hidden rounded-full bg-cream"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={t.progress(done, total)}
        >
          <div className="h-full rounded-full bg-pine transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <SetupChecklist overview={data} />
        <Link
          href="/worker/einrichtung"
          className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-pine px-5 text-base font-semibold text-white hover:bg-pine-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
        >
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
          {t.setupCta}
        </Link>
      </PortalCard>

      {canEditProfile(data) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <LinkCard href="/worker/profil" icon={UserRound} title={t.profileTitle} text={t.profileText} cta={t.profileCta} />
          <LinkCard
            href="/worker/verfuegbarkeit"
            icon={Clock}
            title={t.availabilityTitle}
            text={t.availabilityText}
            cta={t.availabilityCta}
          />
        </div>
      )}
    </div>
  );
}

function WorkerHome() {
  const t = useMessages(portalMessages).common;
  const { data, error, reload } = useWorkerOverview();

  // Refresh stats & earnings when coming back to the overview (the portal keeps the data between pages)
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    if (data) reload();
  }, [data, reload]);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <PageSkeleton label={t.loading} />;
  return data.canAccessJobs ? <Dashboard data={data} /> : <PendingHome data={data} />;
}

export default function WorkerHomePage() {
  return (
    <RequireRole roles={['worker']}>
      <WorkerHome />
    </RequireRole>
  );
}
