'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarOff, ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react';

import { Button } from '@/componets/ui/button';
import { Skeleton } from '@/componets/ui/skeleton';
import { RequireRole } from '@/lib/auth';
import { useFormat, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { CalendarJob, Holiday, WeeklyWindow, WorkerCalendarResponse } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ErrorState } from '@/app/admin/_components/states';
import { useApi } from '@/app/admin/_components/use-api';

import portalMessages from '../_portal-messages';
import { JobStatusBadge } from '../_components/job-card';
import cashMessages from '../_cash-messages';
import { CashBadge, useJobTime } from '../_components/cash';
import { berlinToday } from '../_components/job-flow';
import { JOB_STATUS_CLASSES } from '../_components/labels';
import { NotAvailable, PageSkeleton, PageTitle, PortalCard } from '../_components/portal-ui';
import { useWorkerOverview } from '../_components/worker-context';

// Calendar days are handled as "YYYY-MM-DD" strings (UTC midnight = Berlin calendar day)
const DAY_MS = 86_400_000;
const parse = (day: string) => Date.parse(`${day}T00:00:00Z`);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => fmt(parse(day) + n * DAY_MS);
/** 1 = Monday … 7 = Sunday */
const weekdayOf = (day: string) => ((new Date(parse(day)).getUTCDay() + 6) % 7) + 1;
const pad = (n: number) => String(n).padStart(2, '0');

const DOT_CLASSES: Partial<Record<CalendarJob['status'], string>> = {
  confirmed: 'bg-pine',
  in_progress: 'bg-amber-500',
  completed: 'bg-gray-400',
};

function useMonthGrid(year: number, month: number) {
  return useMemo(() => {
    const first = `${year}-${pad(month + 1)}-01`;
    const last = fmt(Date.UTC(year, month + 1, 0));
    const from = addDays(first, -(weekdayOf(first) - 1));
    const to = addDays(last, 7 - weekdayOf(last));
    const days: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    return { first, last, from, to, days, prefix: `${year}-${pad(month + 1)}` };
  }, [year, month]);
}

const isHoliday = (day: string, holidays: Holiday[]) => holidays.some((h) => h.from <= day && day <= h.to);

function HoursSummary({ availability }: { availability: WeeklyWindow[] }) {
  const { calendar: t, availability: a } = useMessages(portalMessages);
  return (
    <PortalCard
      title={t.hoursTitle}
      action={
        <Link
          href="/worker/verfuegbarkeit"
          className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-pine hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.editHours}
        </Link>
      }
    >
      {availability.length === 0 ? (
        <p className="text-sm text-muted-grey">{t.flexible}</p>
      ) : (
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const ranges = availability.filter((w) => w.weekday === d);
            return (
              <li key={d} className="flex gap-2">
                <span className="w-24 shrink-0 font-medium text-charcoal">{a.weekdays[d - 1]}</span>
                <span className={ranges.length ? 'text-charcoal' : 'text-muted-grey'}>
                  {ranges.length ? ranges.map((r) => `${r.start}–${r.end}`).join(', ') : a.dayOff}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </PortalCard>
  );
}

function CalendarView() {
  const { calendar: t, availability: a } = useMessages(portalMessages);
  const c = useMessages(common);
  const f = useFormat();
  const jobTime = useJobTime();
  const cm = useMessages(cashMessages);
  const today = berlinToday();
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const grid = useMonthGrid(cursor.year, cursor.month);
  const { data, error, loading, reload } = useApi<WorkerCalendarResponse>(`/worker/calendar?from=${grid.from}&to=${grid.to}`);
  // useApi keeps the previous month while loading – don't draw it into the new grid
  const current = data && (data.from === grid.from || !loading) ? data : null;

  const jobsByDay = useMemo(() => {
    const map = new Map<string, CalendarJob[]>();
    (current?.jobs ?? []).forEach((j) => {
      const list = map.get(j.date) ?? [];
      list.push(j);
      map.set(j.date, list);
    });
    return map;
  }, [current]);

  const holidays = current?.holidays ?? [];
  const availability = current?.availability ?? [];
  const workdays = new Set(availability.map((w) => w.weekday));
  const monthJobs = (current?.jobs ?? []).filter((j) => j.date.startsWith(grid.prefix));
  const monthTitle = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString(f.tag, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const shift = (n: number) =>
    setCursor(({ year, month }) => {
      const m = month + n;
      return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  const monthHolidays = holidays.filter((h) => h.to >= grid.first && h.from <= grid.last);

  return (
    <div className="space-y-5">
      <PageTitle title={t.title} subtitle={t.subtitle} />

      <section aria-labelledby="month-title" className="rounded-2xl border border-border bg-white p-3 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" className="h-11 w-11 p-0" onClick={() => shift(-1)} aria-label={t.prev}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <div className="text-center">
            <h2 id="month-title" className="text-lg font-semibold capitalize text-pine-dark" aria-live="polite">
              {monthTitle}
            </h2>
            {!today.startsWith(grid.prefix) ? (
              <button
                type="button"
                onClick={() => setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 })}
                className="min-h-[32px] text-xs font-semibold text-pine underline-offset-2 hover:underline"
              >
                {t.today}
              </button>
            ) : null}
          </div>
          <Button type="button" variant="ghost" className="h-11 w-11 p-0" onClick={() => shift(1)} aria-label={t.next}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        {error && !current ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1" aria-hidden="true">
              {a.weekdaysShort.map((name, i) => (
                <div key={name} className="flex flex-col items-center pb-1 text-xs font-semibold text-muted-grey">
                  {name}
                  <span
                    className={cn('mt-0.5 h-1 w-4 rounded-full', workdays.has(i + 1) ? 'bg-sage' : 'bg-transparent')}
                    title={workdays.has(i + 1) ? t.workday : undefined}
                  />
                </div>
              ))}
            </div>
            {!current ? (
              <div role="status" aria-label={t.loading}>
                <Skeleton className="h-[22rem] rounded-xl" />
              </div>
            ) : (
              <ol className="grid grid-cols-7 gap-1">
                {grid.days.map((day) => {
                  const inMonth = day.startsWith(grid.prefix);
                  const jobs = jobsByDay.get(day) ?? [];
                  const holiday = isHoliday(day, holidays);
                  const isToday = day === today;
                  const dayNum = Number(day.slice(8, 10));
                  const srLabel = [
                    f.dateLong(day),
                    holiday ? t.holiday : null,
                    jobs.length ? t.jobsOnDay(jobs.length) : null,
                  ]
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <li
                      key={day}
                      className={cn(
                        'relative flex min-h-[56px] flex-col rounded-lg border p-1 sm:min-h-[96px]',
                        inMonth ? 'border-border bg-white' : 'border-transparent bg-cream/50 text-muted-grey',
                        holiday && 'border-amber-200 bg-amber-50 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(245,158,11,0.12)_6px,rgba(245,158,11,0.12)_12px)]',
                        isToday && 'ring-2 ring-pine'
                      )}
                    >
                      <span className="sr-only">{srLabel}</span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'text-xs font-semibold sm:text-sm',
                          isToday ? 'text-pine' : inMonth ? 'text-charcoal' : 'text-muted-grey'
                        )}
                      >
                        {dayNum}
                      </span>
                      {holiday && (
                        <span aria-hidden="true" className="hidden truncate text-[10px] font-medium text-amber-800 sm:block">
                          {t.holiday}
                        </span>
                      )}
                      {/* Phones: dots, the whole cell jumps to the agenda entry */}
                      {jobs.length > 0 && (
                        <a
                          href={`#day-${day}`}
                          className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
                          aria-label={srLabel}
                        >
                          <span className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5" aria-hidden="true">
                            {jobs.slice(0, 3).map((j) => (
                              <span key={j._id} className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASSES[j.status] ?? 'bg-gray-400')} />
                            ))}
                          </span>
                        </a>
                      )}
                      {/* Larger screens: job chips */}
                      <ul className="mt-1 hidden space-y-1 sm:block">
                        {jobs.slice(0, 3).map((j) => (
                          <li key={j._id}>
                            <Link
                              href={`/worker/jobs/${j._id}`}
                              title={`${jobTime(j.slot, j.slotEnd, j.durationMinutes)} · ${c.services[j.serviceId] ?? j.serviceId}${j.cash ? ` · ${cm.badgeLong}` : ''}`}
                              className={cn(
                                'block truncate rounded border px-1 py-0.5 text-[11px] font-medium leading-tight hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                JOB_STATUS_CLASSES[j.status] ?? 'border-gray-200 bg-gray-100 text-gray-700'
                              )}
                            >
                              <span className="block truncate">{jobTime(j.slot, j.slotEnd, j.durationMinutes)}</span>
                              <span className="flex items-center gap-1">
                                {j.cash && (
                                  <span className="shrink-0 rounded bg-amber-200 px-1 text-[10px] font-bold text-amber-900">
                                    {cm.badge}
                                  </span>
                                )}
                                <span className="truncate">{c.services[j.serviceId] ?? j.serviceId}</span>
                              </span>
                            </Link>
                          </li>
                        ))}
                        {jobs.length > 3 && (
                          <li>
                            <a href={`#day-${day}`} className="text-[11px] font-semibold text-pine hover:underline">
                              +{jobs.length - 3}
                            </a>
                          </li>
                        )}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-grey" aria-hidden="true">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-pine" /> {c.bookingStatus.confirmed?.label ?? 'confirmed'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> {c.bookingStatus.in_progress?.label ?? 'in_progress'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> {c.bookingStatus.completed?.label ?? 'completed'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm border border-amber-200 bg-amber-100" /> {t.holiday}
              </span>
              {workdays.size > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-4 rounded-full bg-sage" /> {t.workday}
                </span>
              )}
            </div>
          </>
        )}
      </section>

      {current && (
        <PortalCard title={t.agendaTitle}>
          {monthHolidays.length > 0 && (
            <ul className="mb-4 space-y-1">
              {monthHolidays.map((h) => (
                <li key={h.id} className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <CalendarOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t.holidayRange(h.from === h.to ? f.date(h.from) : `${f.date(h.from)} – ${f.date(h.to)}`)}
                  {h.note && <span className="text-amber-800/80">· {h.note}</span>}
                </li>
              ))}
            </ul>
          )}
          {monthJobs.length === 0 ? (
            <p className="text-sm text-muted-grey">{t.noJobs}</p>
          ) : (
            <ul className="space-y-2">
              {monthJobs.map((j, i) => (
                <li key={j._id} id={i === 0 || monthJobs[i - 1].date !== j.date ? `day-${j.date}` : undefined} className="scroll-mt-32">
                  <Link
                    href={`/worker/jobs/${j._id}`}
                    className="flex items-center gap-3 rounded-xl border border-border p-3 transition hover:border-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div
                      className={cn(
                        'flex w-12 shrink-0 flex-col items-center rounded-lg py-1 text-center',
                        j.date === today ? 'bg-pine text-white' : 'bg-cream text-pine-dark'
                      )}
                    >
                      <span className="text-[11px] font-medium uppercase">{a.weekdaysShort[weekdayOf(j.date) - 1]}</span>
                      <span className="text-lg font-bold leading-none">{Number(j.date.slice(8, 10))}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-2 font-semibold text-pine-dark">
                        <span className="truncate">{c.services[j.serviceId] ?? j.serviceId}</span>
                        {j.cash && <CashBadge className="shrink-0" />}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-3 text-sm text-charcoal">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-pine" aria-hidden="true" />
                          {jobTime(j.slot, j.slotEnd, j.durationMinutes)}
                        </span>
                        {j.postcode && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-pine" aria-hidden="true" />
                            {j.postcode}
                          </span>
                        )}
                      </p>
                    </div>
                    <JobStatusBadge status={j.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PortalCard>
      )}

      <HoursSummary availability={availability} />
    </div>
  );
}

function CalendarPage() {
  const { common: t } = useMessages(portalMessages);
  const { data, error, reload } = useWorkerOverview();
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <PageSkeleton label={t.loading} />;
  if (!data.canAccessJobs) return <NotAvailable text={t.approvedOnly} />;
  return <CalendarView />;
}

export default function WorkerCalendarPage() {
  return (
    <RequireRole roles={['worker']}>
      <CalendarPage />
    </RequireRole>
  );
}
