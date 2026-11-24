'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CalendarX2, Info, LoaderCircle, Users } from 'lucide-react';
import { de as dfDe, enGB as dfEn, pl as dfPl } from 'date-fns/locale';

import { Calendar } from '@/componets/ui/calendar';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import type { Slot } from '@/lib/types';
import { cn } from '@/lib/utils';
import messages from '../../_messages';
import flowMessages from '../../_flow-messages';
import { ErrorBox, FieldError } from '../form-field';
import { SectionCard } from './step-header';
import type { DetailsProps } from './step-details';
import { bookableRange, dateValueToIso, fromDateValue, toDateValue } from '../../_lib/wizard';

const DATE_FNS_LOCALES = { de: dfDe, en: dfEn, pl: dfPl };
/** Days shown in the horizontal strip on phones */
const STRIP_DAYS = 21;

type Group = 'morning' | 'midday' | 'afternoon';
const GROUPS: Group[] = ['morning', 'midday', 'afternoon'];

/** Vormittag < 12:00 ≤ Mittag < 14:00 ≤ Nachmittag */
const groupOf = (start: string): Group => (start < '12:00' ? 'morning' : start < '14:00' ? 'midday' : 'afternoon');

function Loading({ label }: { label: string }) {
  return (
    <p className="m-0 flex items-center gap-2 text-sm text-muted-grey" role="status">
      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {label}
    </p>
  );
}

const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/* f) Date (days that fit the total duration) & start time ------------------ */
export function DateCard({
  errors,
  availabilityDuration,
  days,
  daysLoading,
  daysError,
  onRetryDays,
  date,
  onDateChange,
  startTime,
  onTimeChange,
  slots,
  slotsLoading,
  slotsError,
  onRetrySlots,
  timeNote,
}: DetailsProps) {
  const t = useMessages(messages).date;
  const tf = useMessages(flowMessages).time;
  const { locale } = useLocale();
  const f = useFormat();
  const [range] = useState(() => bookableRange());
  const [showCalendar, setShowCalendar] = useState(false);

  // YYYY-MM-DD → number of free start times
  const freeByDay = useMemo(() => new Map((days ?? []).filter((d) => d.freeSlots > 0).map((d) => [d.date, d.freeSlots])), [days]);
  const freeDays = useMemo(() => (days ?? []).filter((d) => d.freeSlots > 0).map((d) => d.date), [days]);
  const firstFree = freeDays[0] ?? null;

  const [month, setMonth] = useState<Date>(() => firstOfMonth(fromDateValue(date || range.min)));

  // Jump to the first month with free days once they are known (unless a day is chosen)
  useEffect(() => {
    if (!date && firstFree) setMonth(firstOfMonth(fromDateValue(firstFree)));
  }, [firstFree, date]);

  const dateSelected = Boolean(date) && freeByDay.has(date);
  const dateErrorId = errors.preferredDate ? 'date-error' : undefined;
  const slotError = errors.startTime ?? errors.slotId;
  const hours = availabilityDuration ? f.hours(availabilityDuration) : null;

  const grouped = useMemo(() => {
    const map = new Map<Group, Slot[]>();
    (slots ?? []).filter((s) => s.available !== false).forEach((s) => {
      const g = groupOf(s.startTime);
      map.set(g, [...(map.get(g) ?? []), s]);
    });
    return GROUPS.filter((g) => map.has(g)).map((g) => [g, map.get(g)!] as const);
  }, [slots]);

  const noDays = days !== null && !daysLoading && freeByDay.size === 0;
  // Strip: the next free days (plus the chosen one, if it is further out)
  const stripDays = useMemo(() => {
    const list = freeDays.slice(0, STRIP_DAYS);
    if (date && freeByDay.has(date) && !list.includes(date)) list.push(date);
    return list;
  }, [freeDays, freeByDay, date]);

  return (
    <SectionCard id="card-date" title={t.title} description={hours && !noDays ? tf.lead(hours) : undefined}>
      {timeNote && (
        <p className="mb-4 mt-0 flex gap-2 rounded-[12px] border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900" role="status">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {timeNote}
        </p>
      )}

      {!availabilityDuration && !daysError && <Loading label={tf.waitingDuration} />}
      {availabilityDuration && !days && daysLoading && <Loading label={t.loadingDays} />}
      {!days && daysError && <ErrorBox message={daysError} onRetry={onRetryDays} />}

      {noDays && (
        <div className="flex flex-col items-start gap-3 rounded-[14px] border border-dashed border-border bg-cream p-5" role="status">
          <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-white text-pine" aria-hidden="true">
            <CalendarX2 className="h-5 w-5" />
          </span>
          <p className="m-0 text-base font-bold text-pine-dark">{t.noDaysTitle}</p>
          <p className="m-0 text-sm leading-relaxed text-muted-grey">{hours ? tf.noTimesForDuration(hours) : t.noDaysText}</p>
          <Link href="/kontakt" className="button button-small button-quiet">
            {t.noDaysLink}
          </Link>
        </div>
      )}

      {days && !noDays && (
        <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
          <div className="min-w-0">
            {/* Phones: horizontal strip of the next free days */}
            <div className="md:hidden">
              <p id="day-strip-label" className="mb-2 mt-0 text-sm font-bold text-pine-dark">
                {tf.stripLabel}
              </p>
              <div
                role="group"
                aria-labelledby="day-strip-label"
                aria-describedby={dateErrorId}
                className={cn('-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-2', daysLoading && 'opacity-60')}
                aria-busy={daysLoading}
              >
                {stripDays.map((value) => {
                  const d = fromDateValue(value);
                  const selected = value === date;
                  const iso = dateValueToIso(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${f.dateLong(iso)}, ${tf.freeStarts(freeByDay.get(value) ?? 0)}`}
                      onClick={() => onDateChange(value)}
                      className={cn(
                        'flex min-h-[64px] w-[60px] shrink-0 snap-start flex-col items-center justify-center rounded-[14px] border text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine',
                        selected ? 'border-pine bg-pine text-white' : 'border-sage bg-mint text-pine-dark'
                      )}
                    >
                      <span className="text-[11px] font-semibold uppercase">{d.toLocaleDateString(f.tag, { weekday: 'short' })}</span>
                      <span className="text-lg font-bold tabular-nums leading-tight">{d.getDate()}</span>
                      <span className="text-[10px]">{d.toLocaleDateString(f.tag, { month: 'short' })}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setShowCalendar((v) => !v)}
                aria-expanded={showCalendar}
                aria-controls="booking-calendar"
                className="mt-1 inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-pine underline-offset-2 hover:underline"
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {showCalendar ? tf.hideCalendar : tf.showCalendar}
              </button>
            </div>

            {/* Calendar (always on tablets/desktop, on demand on phones) */}
            <div id="booking-calendar" className={cn(showCalendar ? 'block' : 'hidden', 'md:block')}>
              <div
                className={cn('w-fit rounded-[14px] border bg-white', errors.preferredDate ? 'border-red-300' : 'border-border', daysLoading && 'opacity-60')}
                aria-busy={daysLoading}
                aria-describedby={dateErrorId}
              >
                <Calendar
                  mode="single"
                  locale={DATE_FNS_LOCALES[locale]}
                  weekStartsOn={1}
                  showOutsideDays={false}
                  selected={dateSelected ? fromDateValue(date) : undefined}
                  onSelect={(day) => {
                    if (day) onDateChange(toDateValue(day));
                  }}
                  month={month}
                  onMonthChange={setMonth}
                  fromMonth={firstOfMonth(fromDateValue(range.min))}
                  toMonth={firstOfMonth(fromDateValue(range.max))}
                  disabled={(day) => !freeByDay.has(toDateValue(day))}
                  modifiers={{ available: (day) => freeByDay.has(toDateValue(day)) }}
                  modifiersClassNames={{ available: 'fiduxa-day-available' }}
                  labels={{
                    labelPrevious: () => t.prevMonth,
                    labelNext: () => t.nextMonth,
                    labelDay: (day) => {
                      const value = toDateValue(day);
                      const free = freeByDay.get(value);
                      return `${f.dateLong(dateValueToIso(value))}, ${free ? tf.freeStarts(free) : t.legendUnavailable}`;
                    },
                  }}
                  className="p-3 sm:p-4"
                  classNames={{
                    caption_label: 'text-sm font-bold text-pine-dark capitalize',
                    nav_button:
                      'inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-pine hover:bg-mint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:opacity-30',
                    head_cell: 'w-10 text-[0.75rem] font-semibold text-muted-grey',
                    cell: 'h-10 w-10 p-0.5 text-center text-sm',
                    day: cn(
                      'inline-flex h-9 w-9 items-center justify-center rounded-full text-sm tabular-nums transition-colors',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine',
                      '[&.fiduxa-day-available]:bg-mint [&.fiduxa-day-available]:font-bold [&.fiduxa-day-available]:text-pine-dark [&.fiduxa-day-available:hover]:bg-sage'
                    ),
                    day_selected: '!bg-pine !text-white hover:!bg-pine',
                    day_today: 'underline underline-offset-4',
                    day_disabled: 'cursor-not-allowed text-muted-grey/50',
                  }}
                />
              </div>
              {/* Legend */}
              <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted-grey" aria-label={t.calendarLabel}>
                <li className="flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 rounded-full bg-mint ring-1 ring-sage" aria-hidden="true" /> {t.legendAvailable}
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 rounded-full bg-pine" aria-hidden="true" /> {t.legendSelected}
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 rounded-full border border-border bg-white" aria-hidden="true" /> {t.legendUnavailable}
                </li>
              </ul>
            </div>
            {daysLoading && days && (
              <p className="mb-0 mt-2 flex items-center gap-2 text-xs text-muted-grey" role="status">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {tf.updating}
              </p>
            )}
            {errors.preferredDate && (
              <div className="mt-2">
                <FieldError id="date-error">{errors.preferredDate}</FieldError>
              </div>
            )}
          </div>

          {/* Start times – each chip shows the whole range of the job */}
          <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={['times-hint', slotError ? 'slot-error' : null].filter(Boolean).join(' ')}>
            <legend className="mb-1 p-0 text-sm font-bold text-pine-dark">
              {dateSelected ? t.slotsLegend(f.dateLong(dateValueToIso(date))) : t.timeLegend}
            </legend>
            <p id="times-hint" className="mb-3 mt-0 text-xs leading-relaxed text-muted-grey">
              {hours ? tf.depends(hours) : ''}
            </p>
            {!dateSelected && <p className="m-0 text-sm text-muted-grey">{t.pickDayFirst}</p>}
            {dateSelected && slotsLoading && !slots && <Loading label={t.loadingSlots} />}
            {dateSelected && slotsError && <ErrorBox message={slotsError} onRetry={onRetrySlots} />}
            {dateSelected && slots && grouped.length === 0 && !slotsLoading && (
              <p className="m-0 text-sm text-muted-grey">{hours ? tf.noTimesForDuration(hours) : t.noSlotsForDay}</p>
            )}
            {dateSelected && slotsLoading && slots && (
              <p className="mb-2 mt-0 flex items-center gap-2 text-xs text-muted-grey" role="status">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {tf.updating}
              </p>
            )}
            {dateSelected && grouped.length > 0 && (
              <div className={cn('grid gap-4', slotsLoading && 'opacity-60')} aria-busy={slotsLoading}>
                {grouped.map(([group, list]) => (
                  <div key={group} role="group" aria-labelledby={`times-${group}`}>
                    <p id={`times-${group}`} className="mb-2 mt-0 text-xs font-bold uppercase tracking-wider text-muted-grey">
                      {tf.groups[group]}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
                      {list.map((s) => {
                        const checked = startTime === s.startTime;
                        const lastTeam = s.remaining === 1;
                        return (
                          <label key={s.startTime} className="relative block cursor-pointer">
                            <input
                              type="radio"
                              name="start-time"
                              value={s.startTime}
                              checked={checked}
                              onChange={() => onTimeChange(s)}
                              className="peer sr-only"
                              aria-label={`${tf.rangeSr(s.startTime, s.endTime)}${lastTeam ? `, ${tf.lastTeam}` : ''}`}
                            />
                            <span
                              className={cn(
                                'flex min-h-[52px] flex-col items-center justify-center rounded-[12px] border px-2 py-2 text-center transition-colors',
                                'peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2',
                                checked ? 'border-pine bg-pine text-white' : 'border-border bg-white text-pine-dark hover:border-sage hover:bg-mint'
                              )}
                              aria-hidden="true"
                            >
                              <span className="text-[15px] font-bold tabular-nums">
                                {s.startTime} – {s.endTime}
                              </span>
                              {lastTeam && (
                                <span className={cn('mt-0.5 flex items-center gap-1 text-[11px] font-bold', checked ? 'text-white' : 'text-amber-800')}>
                                  <Users className="h-3 w-3" /> {tf.lastTeam}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {slotError && (
              <div className="mt-2">
                <FieldError id="slot-error">{slotError}</FieldError>
              </div>
            )}
          </fieldset>
        </div>
      )}
    </SectionCard>
  );
}
