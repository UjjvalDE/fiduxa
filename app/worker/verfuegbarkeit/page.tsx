'use client';

import { useId, useState } from 'react';
import { CalendarOff, Info, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Switch } from '@/componets/ui/switch';
import { RequireRole } from '@/lib/auth';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { Holiday, WeeklyWindow, WorkerOverview } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ErrorState } from '@/app/admin/_components/states';
import { useApi, useErrorText } from '@/app/admin/_components/use-api';

import autoMessages from '../_auto-messages';
import {
  type AutoWeekly,
  type AvailabilityResponse,
  type AvailabilitySettings,
  type WeekKey,
  MatchingCard,
  OverridesCalendar,
  WorkloadCard,
  isAutoMode,
} from '../_components/auto-assign';

import portalMessages from '../_portal-messages';
import { berlinToday } from '../_components/job-flow';
import { NotAvailable, PageSkeleton, PageTitle, PortalCard } from '../_components/portal-ui';
import { canEditProfile, useWorkerOverview } from '../_components/worker-context';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const DEFAULT_RANGE = { start: '08:00', end: '16:00' };

type Range = { start: string; end: string; weeks?: WeekKey };
type DayState = { on: boolean; ranges: Range[] };
type Week = Record<number, DayState>;

const toWeek = (windows: WeeklyWindow[]): Week => {
  const week: Week = {};
  WEEKDAYS.forEach((d) => {
    const ranges = windows.filter((w) => w.weekday === d).map((w) => ({ start: w.start, end: w.end, weeks: (w as AutoWeekly).weeks ?? 'all' }));
    week[d] = { on: ranges.length > 0, ranges: ranges.length ? ranges : [{ ...DEFAULT_RANGE }] };
  });
  return week;
};

const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

// ---------------------------------------------------------------------------
// Weekly hours
// ---------------------------------------------------------------------------

function HoursEditor({ data, editable, currentWeek }: { data: WorkerOverview; editable: boolean; currentWeek?: 'A' | 'B' }) {
  const t = useMessages(portalMessages).availability;
  const at = useMessages(autoMessages);
  const auto = isAutoMode(data);
  const errorText = useErrorText();
  const { setData } = useWorkerOverview();
  const [mode, setMode] = useState<'flexible' | 'fixed'>(data.worker.availability.length || isAutoMode(data) ? 'fixed' : 'flexible');
  const [week, setWeek] = useState<Week>(() => toWeek(data.worker.availability));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayErrors, setDayErrors] = useState<Record<number, string>>({});
  const modeName = useId();
  const disabled = !editable || pending;

  const updateDay = (d: number, patch: Partial<DayState>) => setWeek((w) => ({ ...w, [d]: { ...w[d], ...patch } }));
  const updateRange = (d: number, i: number, patch: Partial<Range>) =>
    setWeek((w) => ({ ...w, [d]: { ...w[d], ranges: w[d].ranges.map((r, j) => (j === i ? { ...r, ...patch } : r)) } }));

  const save = async () => {
    setError(null);
    const errs: Record<number, string> = {};
    const weekly: AutoWeekly[] = [];
    if (mode === 'fixed') {
      WEEKDAYS.forEach((d) => {
        const day = week[d];
        if (!day.on) return;
        const sorted = [...day.ranges].sort((a, b) => a.start.localeCompare(b.start));
        if (sorted.some((r) => !r.start || !r.end || r.start >= r.end)) errs[d] = t.errRange;
        else if (sorted.some((r, i) => i > 0 && r.start < sorted[i - 1].end && (r.weeks ?? 'all') === (sorted[i - 1].weeks ?? 'all'))) errs[d] = t.errOverlap;
        sorted.forEach((r) => weekly.push({ weekday: d, start: r.start, end: r.end, weeks: r.weeks ?? 'all' }));
      });
      setDayErrors(errs);
      if (Object.keys(errs).length) return;
      if (weekly.length === 0) return setError(t.errNoDay);
      if (weekly.length > 42) return setError(t.errTooMany);
    } else {
      setDayErrors({});
    }

    setPending(true);
    try {
      const res = await api.put<{ availability: WeeklyWindow[] }>('/worker/availability', { weekly });
      setData((prev) => (prev ? { ...prev, availabilityPrompt: null, worker: { ...prev.worker, availability: res.availability } } as WorkerOverview : prev));
      toast.success(t.hoursSaved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <PortalCard title={t.hoursTitle}>
      {auto && currentWeek && <p className="mb-3 text-sm text-muted-grey">{at.currentWeek(currentWeek)}</p>}
      <fieldset hidden={auto}>
        <legend className="mb-2 text-sm font-medium text-charcoal">{t.modeLegend}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['flexible', 'fixed'] as const).map((m) => (
            <label
              key={m}
              className={cn(
                'flex min-h-[44px] cursor-pointer gap-3 rounded-xl border p-3 focus-within:ring-2 focus-within:ring-ring',
                mode === m ? 'border-pine bg-mint' : 'border-border bg-white',
                disabled && 'cursor-not-allowed opacity-70'
              )}
            >
              <input
                type="radio"
                name={modeName}
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                disabled={disabled}
                className="mt-1 h-4 w-4 accent-pine"
              />
              <span>
                <span className="block font-semibold text-pine-dark">{m === 'flexible' ? t.modeFlexible : t.modeFixed}</span>
                <span className="block text-sm text-muted-grey">{m === 'flexible' ? t.modeFlexibleHint : t.modeFixedHint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === 'fixed' && (
        <ul className="mt-5 divide-y divide-border">
          {WEEKDAYS.map((d) => {
            const day = week[d];
            const dayName = t.weekdays[d - 1];
            const switchId = `day-${d}`;
            return (
              <li key={d} className="py-3">
                <div className="flex min-h-[44px] items-center justify-between gap-3">
                  <Label htmlFor={switchId} className="text-base font-medium text-charcoal">
                    {dayName}
                  </Label>
                  <div className="flex items-center gap-3">
                    {!day.on && <span className="text-sm text-muted-grey">{t.dayOff}</span>}
                    <Switch
                      id={switchId}
                      checked={day.on}
                      onCheckedChange={(on) => updateDay(d, { on })}
                      disabled={disabled}
                      className="data-[state=checked]:bg-pine"
                    />
                  </div>
                </div>
                {day.on && (
                  <div className="mt-2 space-y-2">
                    {day.ranges.map((r, i) => (
                      <div key={i} className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                          <Label htmlFor={`${switchId}-${i}-from`} className="text-xs text-muted-grey">
                            {t.from}
                          </Label>
                          <Input
                            id={`${switchId}-${i}-from`}
                            type="time"
                            step={900}
                            value={r.start}
                            onChange={(e) => updateRange(d, i, { start: e.target.value })}
                            disabled={disabled}
                            className="h-11 w-[8.5rem] text-base"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${switchId}-${i}-to`} className="text-xs text-muted-grey">
                            {t.to}
                          </Label>
                          <Input
                            id={`${switchId}-${i}-to`}
                            type="time"
                            step={900}
                            value={r.end}
                            onChange={(e) => updateRange(d, i, { end: e.target.value })}
                            disabled={disabled}
                            className="h-11 w-[8.5rem] text-base"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${switchId}-${i}-weeks`} className="text-xs text-muted-grey">
                            {at.weeksLabel}
                          </Label>
                          <select
                            id={`${switchId}-${i}-weeks`}
                            value={r.weeks ?? 'all'}
                            onChange={(e) => updateRange(d, i, { weeks: e.target.value as WeekKey })}
                            disabled={disabled}
                            className="h-11 rounded-md border border-input bg-white px-2 text-base"
                          >
                            {(['all', 'A', 'B'] as const).map((w) => (
                              <option key={w} value={w}>
                                {at.weeks[w]}
                              </option>
                            ))}
                          </select>
                        </div>
                        {day.ranges.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-11 w-11 p-0 text-muted-grey"
                            disabled={disabled}
                            aria-label={t.removeRange(dayName)}
                            onClick={() => updateDay(d, { ranges: day.ranges.filter((_, j) => j !== i) })}
                          >
                            <X className="h-5 w-5" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {dayErrors[d] && (
                      <p role="alert" className="text-sm text-red-700">
                        {dayErrors[d]}
                      </p>
                    )}
                    {day.ranges.length < 6 && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 px-2 text-pine"
                        disabled={disabled}
                        onClick={() => {
                          const last = day.ranges[day.ranges.length - 1];
                          updateDay(d, { ranges: [...day.ranges, { start: last?.end ?? '13:00', end: '18:00' }] });
                        }}
                      >
                        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                        {t.addRange}
                        <span className="sr-only"> ({dayName})</span>
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {editable && (
        <Button type="button" onClick={save} disabled={pending} className="mt-5 h-12 w-full text-base sm:w-auto">
          {pending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-5 w-5" aria-hidden="true" />}
          {t.saveHours}
        </Button>
      )}
    </PortalCard>
  );
}

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

function Holidays({ holidays, editable }: { holidays: Holiday[]; editable: boolean }) {
  const t = useMessages(portalMessages).availability;
  const f = useFormat();
  const errorText = useErrorText();
  const { setData } = useWorkerOverview();
  const today = berlinToday();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = { from: useId(), to: useId(), note: useId() };

  const store = (list: Holiday[]) =>
    setData((prev) => (prev ? { ...prev, worker: { ...prev.worker, holidays: list.filter((h) => h.to >= today) } } : prev));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const end = to || from;
    if (!from || end < from) return setError(t.errHolidayDates);
    if (from < today) return setError(t.errHolidayPast);
    setPending(true);
    try {
      const res = await api.post<{ holidays: Holiday[] }>('/worker/holidays', { from, to: end, note: note.trim() });
      store(res.holidays);
      setFrom('');
      setTo('');
      setNote('');
      toast.success(t.holidayAdded);
    } catch (err) {
      // 409: a job is already accepted in that period – the translated server message names it
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  const remove = async (id: string) => {
    setDeleting(id);
    try {
      const res = await api.delete<{ holidays: Holiday[] }>(`/worker/holidays/${id}`);
      store(res.holidays);
      toast.success(t.holidayRemoved);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <PortalCard title={t.holidaysTitle} description={t.holidaysHint}>
      {holidays.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-grey">
          <CalendarOff className="h-4 w-4" aria-hidden="true" />
          {t.noHolidays}
        </p>
      ) : (
        <ul className="space-y-2">
          {holidays.map((h) => {
            const range = h.from === h.to ? f.date(h.from) : `${f.date(h.from)} – ${f.date(h.to)}`;
            return (
              <li key={h.id} className="flex items-center gap-3 rounded-xl border border-border bg-cream/50 px-4 py-2">
                <CalendarOff className="h-5 w-5 shrink-0 text-pine" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-charcoal">{range}</p>
                  <p className="text-sm text-muted-grey">
                    {t.days(dayCount(h.from, h.to))}
                    {h.from <= today && ` · ${t.current}`}
                    {h.note && ` · ${h.note}`}
                  </p>
                </div>
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 w-11 shrink-0 p-0 text-red-700 hover:bg-red-50 hover:text-red-800"
                    disabled={deleting !== null}
                    aria-label={t.deleteHoliday(range)}
                    onClick={() => remove(h.id)}
                  >
                    {deleting === h.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-5 w-5" aria-hidden="true" />
                    )}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <form onSubmit={add} noValidate className="mt-5 space-y-3 border-t border-border pt-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.from}>{t.holidayFrom}</Label>
              <Input
                id={ids.from}
                type="date"
                min={today}
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  if (!to || to < e.target.value) setTo(e.target.value);
                }}
                disabled={pending}
                required
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.to}>{t.holidayTo}</Label>
              <Input
                id={ids.to}
                type="date"
                min={from || today}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={pending}
                className="h-12 text-base"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.note}>{t.holidayNote}</Label>
            <Input
              id={ids.note}
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.holidayNotePlaceholder}
              disabled={pending}
              className="h-12 text-base"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="h-12 w-full text-base sm:w-auto">
            {pending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <Plus className="mr-2 h-5 w-5" aria-hidden="true" />}
            {t.addHoliday}
          </Button>
        </form>
      )}
    </PortalCard>
  );
}

function AvailabilityPage() {
  const { availability: t, common } = useMessages(portalMessages);
  const at = useMessages(autoMessages);
  const { data, error, reload } = useWorkerOverview();
  const extra = useApi<AvailabilityResponse>(data ? '/worker/availability' : null);
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <PageSkeleton label={common.loading} />;
  const editable = canEditProfile(data);
  const auto = isAutoMode(data);
  const rules = auto ? at.autoRules : t.rules;
  const setSettings = (settings: AvailabilitySettings) => extra.setData((prev) => (prev ? { ...prev, settings } : prev));

  return (
    <div className="space-y-5">
      <PageTitle title={t.title} subtitle={t.subtitle} />
      {!editable && <NotAvailable text={common.locked} />}

      <section aria-labelledby="rules-title" className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-900">
        <h2 id="rules-title" className="flex items-center gap-2 text-sm font-semibold">
          <Info className="h-4 w-4" aria-hidden="true" />
          {t.rulesTitle}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <HoursEditor data={data} editable={editable} currentWeek={extra.data?.settings.currentWeek} />
      {extra.data && <OverridesCalendar settings={extra.data.settings} editable={editable} onSaved={setSettings} />}
      <Holidays holidays={data.worker.holidays} editable={editable} />
      {extra.data && (
        <>
          <WorkloadCard settings={extra.data.settings} editable={editable} onSaved={setSettings} />
          <MatchingCard
            matching={extra.data.matching}
            editable={editable}
            onSaved={(matching) => {
              extra.setData((prev) => (prev ? { ...prev, matching } : prev));
              reload();
            }}
          />
        </>
      )}
    </div>
  );
}

export default function WorkerAvailabilityPage() {
  return (
    <RequireRole roles={['worker']}>
      <AvailabilityPage />
    </RequireRole>
  );
}
