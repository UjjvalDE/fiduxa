'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Pencil,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { StatusBadge } from '@/componets/site/status-badge';
import { Button } from '@/componets/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/componets/ui/dialog';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Skeleton } from '@/componets/ui/skeleton';
import { api, qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminSlot, BookingStatus, PlatformSettings } from '@/lib/types';
import { cn } from '@/lib/utils';

import adminMessages from '../_messages';
import { ConfirmAction } from '../_components/confirm-action';
import { EmptyState, ErrorState, PageHeader } from '../_components/states';
import { berlinToday, useApi, useErrorText } from '../_components/use-api';
import slotMessages from './_messages';

// ---------------------------------------------------------------------------
// Calendar-day helpers (YYYY-MM-DD strings, computed in UTC – no DST issues)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const parseDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => toDay(parseDay(iso) + days * DAY_MS);
/** 1 = Monday … 7 = Sunday */
const isoWeekday = (iso: string) => {
  const d = new Date(parseDay(iso)).getUTCDay();
  return d === 0 ? 7 : d;
};
const mondayOf = (iso: string) => addDays(iso, 1 - isoWeekday(iso));
const daysBetween = (from: string, to: string) => Math.round((parseDay(to) - parseDay(from)) / DAY_MS);
const isValidDay = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(parseDay(iso));

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

type PresetKey = 'full' | 'morning' | 'afternoon' | 'custom';
const PRESETS: Record<Exclude<PresetKey, 'custom'>, { startTime: string; endTime: string }> = {
  full: { startTime: '08:00', endTime: '18:00' },
  morning: { startTime: '08:00', endTime: '13:00' },
  afternoon: { startTime: '13:00', endTime: '18:00' },
};

const MAX_RANGE_DAYS = 120;

type SlotsResponse = { from: string; to: string; slots: AdminSlot[] };

const useMessagesCancel = () => useMessages(adminMessages).ui.cancel;

// ---------------------------------------------------------------------------
// Booking layout inside a window (lanes = teams working in parallel)
// ---------------------------------------------------------------------------

type PlacedBooking = AdminSlot['bookings'][number] & { start: number; end: number; lane: number };

function layoutWindow(slot: AdminSlot) {
  const fallbackStart = toMinutes(slot.startTime);
  const items = slot.bookings
    .map((b) => {
      const start = b.startTime && TIME_RE.test(b.startTime) ? toMinutes(b.startTime) : fallbackStart;
      const end =
        b.endTime && TIME_RE.test(b.endTime) ? toMinutes(b.endTime) : start + Math.max(30, b.durationMinutes ?? 0);
      return { ...b, start, end: Math.max(end, start + 15) };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  // Greedy interval partitioning: lane count = peak number of overlapping jobs
  const laneEnds: number[] = [];
  const placed: PlacedBooking[] = items.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    return { ...item, lane };
  });
  const latestEnd = placed.reduce((max, b) => Math.max(max, b.end), 0);
  return { placed, peak: laneEnds.length, latestEnd };
}

const BLOCK_CLASSES: Partial<Record<BookingStatus, string>> = {
  payment_pending: 'bg-amber-100 text-amber-900 border-amber-300',
  in_progress: 'bg-sky-100 text-sky-900 border-sky-300',
  completed: 'bg-gray-200 text-gray-700 border-gray-300',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminSlotsPage() {
  const t = useMessages(slotMessages);
  const f = useFormat();
  const today = berlinToday();
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [createOpen, setCreateOpen] = useState(false);
  const weekEnd = addDays(weekStart, 6);

  const { data, error, loading, reload } = useApi<SlotsResponse>(`/admin/slots${qs({ from: weekStart, to: weekEnd })}`);
  const settings = useApi<{ settings: PlatformSettings }>('/admin/settings');
  const current = data && data.from === weekStart ? data : null;

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const byDay = useMemo(() => {
    const map = new Map<string, AdminSlot[]>();
    current?.slots.forEach((slot) => {
      const list = map.get(slot.date) ?? [];
      list.push(slot);
      map.set(slot.date, list);
    });
    map.forEach((list) => list.sort((a, b) => Number(b.active) - Number(a.active) || a.startTime.localeCompare(b.startTime)));
    return map;
  }, [current]);

  const totals = useMemo(() => {
    const slots = current?.slots ?? [];
    const capacity = slots.filter((s) => s.active).reduce((sum, s) => sum + (s.capacityMinutes ?? 0), 0);
    const booked = slots.reduce((sum, s) => sum + (s.bookedMinutes ?? 0), 0);
    return { capacity, booked, pct: capacity > 0 ? Math.round((booked / capacity) * 100) : 0 };
  }, [current]);

  const rules = settings.data?.settings.booking;

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            {t.create}
          </Button>
        }
      />

      <section
        aria-labelledby="slots-info-title"
        className="mb-6 flex gap-3 rounded-2xl border border-sage bg-mint/40 p-4 text-sm text-charcoal"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
        <div>
          <h2 id="slots-info-title" className="font-semibold text-pine-dark">
            {t.info.title}
          </h2>
          <p className="mt-1 font-medium text-charcoal">{t.info.fit}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-grey">
            <li>{t.info.capacity}</li>
            {rules && (
              <li>
                {t.info.rules(rules.startStepMinutes, rules.teamBufferMinutes)}{' '}
                <Link href="/admin/einstellungen#buchungsregeln" className="font-medium text-pine underline-offset-4 hover:underline">
                  {t.info.rulesLink}
                </Link>
              </li>
            )}
            <li>{t.info.hold}</li>
            <li>{t.info.switchTip}</li>
          </ul>
        </div>
      </section>

      {/* Week navigation */}
      <nav
        aria-label={t.week.navigation}
        className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label={t.week.previous}
            title={t.week.previous}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(mondayOf(today))}
            disabled={weekStart === mondayOf(today)}
          >
            {t.week.today}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label={t.week.next}
            title={t.week.next}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <p className="ml-2 text-sm font-semibold text-pine-dark" aria-live="polite">
            <span className="sr-only">{t.week.label}: </span>
            {t.week.range(f.date(weekStart), f.date(weekEnd))}
          </p>
        </div>
        {current && totals.capacity > 0 && (
          <p className="text-xs text-muted-grey">{t.week.summary(f.hours(totals.booked), f.hours(totals.capacity), totals.pct)}</p>
        )}
      </nav>

      {error && !current ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !current ? (
        <div className="space-y-3" role="status" aria-label={t.loading}>
          {days.map((d) => (
            <Skeleton key={d} className="h-24 rounded-2xl" />
          ))}
          <span className="sr-only">{t.loading}…</span>
        </div>
      ) : (
        <div aria-busy={loading} className={cn('transition-opacity', loading && 'opacity-60')}>
          {error && <ErrorState message={error} onRetry={reload} className="mb-3" />}
          {current.slots.length === 0 && (
            <div className="mb-4">
              <EmptyState
                icon={CalendarClock}
                title={t.emptyWeekTitle}
                description={t.emptyWeekText}
                action={
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}>
                    <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t.create}
                  </Button>
                }
              />
            </div>
          )}
          <ol className="space-y-3">
            {days.map((day) => {
              const slots = byDay.get(day) ?? [];
              const isToday = day === today;
              const isPast = day < today;
              const headingId = `day-${day}`;
              return (
                <li
                  key={day}
                  aria-labelledby={headingId}
                  className={cn(
                    'flex min-w-0 flex-col gap-3 rounded-2xl border bg-white p-4 md:flex-row',
                    isToday ? 'border-pine ring-1 ring-pine/30' : 'border-border',
                    isPast && 'bg-white/60'
                  )}
                >
                  <h3 id={headingId} className="shrink-0 md:w-36" aria-current={isToday ? 'date' : undefined}>
                    <span className={cn('block text-sm font-semibold', isPast ? 'text-muted-grey' : 'text-pine-dark')}>
                      {f.date(day, { weekday: 'long', day: undefined, month: undefined, year: undefined })}
                    </span>
                    <span className="text-xs text-muted-grey">
                      {f.date(day)}
                      {isToday && (
                        <span className="ml-1 rounded-full bg-mint px-1.5 py-0.5 text-[10px] font-bold uppercase text-pine">
                          {t.day.today}
                        </span>
                      )}
                    </span>
                  </h3>
                  <div className="min-w-0 flex-1">
                    {slots.length === 0 ? (
                      <p className="py-1 text-sm text-muted-grey">{t.day.empty}</p>
                    ) : (
                      <ul className="space-y-3">
                        {slots.map((slot) => (
                          <li key={slot.id}>
                            {slot.endTime ? (
                              <WindowCard slot={slot} dayLabel={f.dateShort(day)} onChanged={reload} />
                            ) : (
                              <LegacySlotCard slot={slot} dayLabel={f.dateShort(day)} onChanged={reload} />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <CreateWindowsDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        today={today}
        onCreated={(from) => {
          setWeekStart(mondayOf(from));
          reload();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Window card with timeline
// ---------------------------------------------------------------------------

function WindowCard({ slot, dayLabel, onChanged }: { slot: AdminSlot; dayLabel: string; onChanged: () => void }) {
  const t = useMessages(slotMessages);
  const f = useFormat();
  const time = f.slot(slot.startTime, slot.endTime);
  const label = `${dayLabel}, ${time}`;
  const layout = useMemo(() => layoutWindow(slot), [slot]);
  const capacityMinutes = slot.capacityMinutes ?? 0;
  const bookedMinutes = slot.bookedMinutes ?? 0;
  const pct = slot.utilisationPct ?? (capacityMinutes > 0 ? Math.round((bookedMinutes / capacityMinutes) * 100) : 0);
  const full = slot.active && capacityMinutes > 0 && slot.remaining <= 0;

  return (
    <article
      aria-label={label}
      className={cn(
        'rounded-xl border p-3 text-sm',
        slot.active ? 'border-border bg-cream/40' : 'border-dashed border-gray-300 bg-gray-50 text-muted-grey'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className={cn('font-semibold tabular-nums', slot.active ? 'text-pine-dark' : 'text-muted-grey line-through')}>
              {time}
            </span>
            <span className="text-xs text-muted-grey">· {t.window.teams(slot.capacity)}</span>
            {!slot.active ? (
              <span className="rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                {t.window.inactive}
              </span>
            ) : full ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                {t.window.full}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-grey">
            <span className={cn('font-semibold', pct >= 90 ? 'text-amber-800' : 'text-charcoal')}>{t.window.utilisation(pct)}</span>
            {' · '}
            {t.window.hours(f.hours(bookedMinutes), f.hours(capacityMinutes))}
          </p>
          {!slot.active && slot.bookings.length > 0 && <p className="mt-0.5 text-xs">{t.window.inactiveNote}</p>}
          {slot.note && <p className="mt-0.5 break-words text-xs italic text-muted-grey">{slot.note}</p>}
        </div>
        <SlotActions slot={slot} label={label} peak={layout.peak} latestEnd={layout.latestEnd} onChanged={onChanged} />
      </div>

      <Timeline slot={slot} placed={layout.placed} peak={layout.peak} pct={pct} />

      {slot.bookings.length > 0 && (
        <ul aria-label={t.window.bookingsLabel(label)} className="mt-2 space-y-1 border-t border-border pt-2">
          {layout.placed.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className="font-semibold tabular-nums text-charcoal">{f.slot(toTime(b.start), toTime(b.end))}</span>
              <Link
                href={`/admin/buchungen/${b.id}`}
                className="rounded font-mono font-semibold text-pine hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {b.reference}
              </Link>
              <span className="text-charcoal">{b.customerName}</span>
              <span className="text-muted-grey">· {b.workerName ?? t.window.noWorker}</span>
              <span className="origin-left scale-90">
                <StatusBadge kind="booking" status={b.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

const LANE_PX = 26;

function Timeline({ slot, placed, peak, pct }: { slot: AdminSlot; placed: PlacedBooking[]; peak: number; pct: number }) {
  const t = useMessages(slotMessages);
  const f = useFormat();
  const start = toMinutes(slot.startTime);
  const end = toMinutes(slot.endTime);
  const span = Math.max(1, end - start);
  const lanes = Math.max(1, slot.capacity, peak);
  const pos = (minutes: number) => `${Math.min(100, Math.max(0, ((minutes - start) / span) * 100))}%`;

  // Hour ticks; label every 2 h for long windows
  const ticks: number[] = [];
  for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) ticks.push(m);
  const labelEvery = span > 6 * 60 ? 120 : 60;

  return (
    <div className="mt-3">
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, pct)}
        aria-label={t.window.utilisationLabel(pct, f.hours(slot.bookedMinutes ?? 0), f.hours(slot.capacityMinutes ?? 0))}
        className={cn(
          'relative overflow-hidden rounded-lg border bg-white',
          slot.active ? 'border-border' : 'border-dashed border-gray-300'
        )}
        style={{ height: lanes * LANE_PX + 4 }}
      >
        {/* Team lanes */}
        {Array.from({ length: lanes }).map((_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className={cn('absolute inset-x-0', i % 2 === 1 && 'bg-cream/60', i >= slot.capacity && 'bg-red-50')}
            style={{ top: i * LANE_PX + 2, height: LANE_PX }}
          />
        ))}
        {/* Hour grid */}
        {ticks.map((m) => (
          <div key={m} aria-hidden="true" className="absolute inset-y-0 w-px bg-border" style={{ left: pos(m) }} />
        ))}
        {/* Booked jobs (the list below is the accessible version) */}
        {placed.map((b) => {
          const text = `${f.slot(toTime(b.start), toTime(b.end))} · ${b.customerName} · ${b.workerName ?? t.window.noWorker}`;
          return (
            <Link
              key={b.id}
              href={`/admin/buchungen/${b.id}`}
              tabIndex={-1}
              aria-hidden="true"
              title={`${b.reference} · ${text}`}
              className={cn(
                'absolute overflow-hidden truncate whitespace-nowrap rounded-md border px-1.5 text-[11px] font-medium leading-[20px] hover:brightness-95',
                BLOCK_CLASSES[b.status] ?? 'border-pine bg-pine text-white'
              )}
              style={{
                top: b.lane * LANE_PX + 4,
                height: LANE_PX - 4,
                left: pos(b.start),
                width: `calc(${pos(b.end)} - ${pos(b.start)})`,
                minWidth: 4,
              }}
            >
              {text}
            </Link>
          );
        })}
      </div>
      <div aria-hidden="true" className="relative mt-0.5 h-4 text-[10px] tabular-nums text-muted-grey">
        {ticks
          .filter((m) => (m - ticks[0]) % labelEvery === 0)
          .map((m) => (
            <span
              key={m}
              className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              style={{ left: pos(m) }}
            >
              {String(Math.floor(m / 60)).padStart(2, '0')}
            </span>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legacy fixed-start slot (no end time)
// ---------------------------------------------------------------------------

function LegacySlotCard({ slot, dayLabel, onChanged }: { slot: AdminSlot; dayLabel: string; onChanged: () => void }) {
  const t = useMessages(slotMessages);
  const f = useFormat();
  const label = `${dayLabel}, ${slot.startTime}`;
  return (
    <article
      aria-label={label}
      className={cn(
        'rounded-xl border p-3 text-sm',
        slot.active ? 'border-border bg-cream/40' : 'border-dashed border-gray-300 bg-gray-50 text-muted-grey'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex flex-wrap items-center gap-2">
            <span className={cn('font-semibold tabular-nums', slot.active ? 'text-pine-dark' : 'line-through')}>
              {slot.startTime}
            </span>
            <span className="text-xs text-muted-grey">· {t.window.legacy}</span>
            {!slot.active && (
              <span className="rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                {t.window.inactive}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-grey">{t.window.legacyOccupancy(slot.booked, slot.capacity)}</p>
        </div>
        <SlotActions slot={slot} label={label} peak={slot.booked} latestEnd={0} onChanged={onChanged} />
      </div>
      {slot.bookings.length > 0 && (
        <ul aria-label={t.window.bookingsLabel(label)} className="mt-2 space-y-1 border-t border-border pt-2">
          {slot.bookings.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-2 text-xs">
              <Link href={`/admin/buchungen/${b.id}`} className="font-mono font-semibold text-pine hover:underline">
                {b.reference}
              </Link>
              <span>{b.customerName}</span>
              <span className="text-muted-grey">· {b.workerName ?? t.window.noWorker}</span>
              {b.durationMinutes ? <span className="text-muted-grey">· {f.hours(b.durationMinutes)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Actions: edit, (de)activate, delete
// ---------------------------------------------------------------------------

function SlotActions({
  slot,
  label,
  peak,
  latestEnd,
  onChanged,
}: {
  slot: AdminSlot;
  label: string;
  peak: number;
  latestEnd: number;
  onChanged: () => void;
}) {
  const t = useMessages(slotMessages);
  const errorText = useErrorText();
  const [editOpen, setEditOpen] = useState(false);
  const [activating, setActivating] = useState(false);

  const setActive = async (active: boolean) => {
    await api.patch(`/admin/slots/${slot.id}`, { active });
    toast.success(active ? t.window.activated : t.window.deactivated);
    onChanged();
  };

  const activate = async () => {
    if (activating) return;
    setActivating(true);
    try {
      await setActive(true);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setActivating(false);
    }
  };

  const remove = async () => {
    await api.delete(`/admin/slots/${slot.id}`);
    toast.success(t.window.deleted);
    onChanged();
  };

  return (
    <div role="group" aria-label={t.window.actionsLabel(label)} className="flex flex-wrap gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setEditOpen(true)}
        aria-label={`${t.window.edit}: ${label}`}
        title={t.window.edit}
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </Button>

      {slot.active ? (
        <ConfirmAction
          trigger={
            <>
              <PowerOff className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">
                {t.window.deactivate}: {label}
              </span>
            </>
          }
          triggerVariant="ghost"
          triggerSize="icon"
          triggerClassName="h-8 w-8"
          title={t.window.deactivateTitle}
          description={
            <>
              <span className="block font-medium text-charcoal">{label}</span>
              {t.window.deactivateDescription}
            </>
          }
          confirmLabel={t.window.deactivate}
          onConfirm={() => setActive(false)}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-pine"
          onClick={activate}
          disabled={activating}
          aria-label={`${t.window.activate}: ${label}`}
          title={t.window.activate}
        >
          {activating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Power className="h-4 w-4" aria-hidden="true" />}
        </Button>
      )}

      {slot.bookings.length === 0 && (
        <ConfirmAction
          trigger={
            <>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">
                {t.window.delete}: {label}
              </span>
            </>
          }
          triggerVariant="ghost"
          triggerSize="icon"
          triggerClassName="h-8 w-8 text-red-700 hover:bg-red-50 hover:text-red-800"
          title={t.window.deleteTitle}
          description={t.window.deleteDescription(label)}
          confirmLabel={t.window.delete}
          destructive
          onConfirm={remove}
        />
      )}

      <EditWindowDialog
        slot={slot}
        label={label}
        peak={peak}
        latestEnd={latestEnd}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onChanged}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit dialog (capacity, end time, active, note)
// ---------------------------------------------------------------------------

function EditWindowDialog({
  slot,
  label,
  peak,
  latestEnd,
  open,
  onOpenChange,
  onSaved,
}: {
  slot: AdminSlot;
  label: string;
  peak: number;
  latestEnd: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useMessages(slotMessages);
  const errorText = useErrorText();
  const cancelLabel = useMessagesCancel();
  const [capacity, setCapacity] = useState(String(slot.capacity));
  const [endTime, setEndTime] = useState(slot.endTime);
  const [active, setActive] = useState(slot.active);
  const [note, setNote] = useState(slot.note);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { capacity: useId(), end: useId(), active: useId(), note: useId() };

  useEffect(() => {
    if (open) {
      setCapacity(String(slot.capacity));
      setEndTime(slot.endTime);
      setActive(slot.active);
      setNote(slot.note);
      setError(null);
    }
  }, [open, slot.capacity, slot.endTime, slot.active, slot.note]);

  const minCapacity = Math.max(1, peak);
  const latest = latestEnd > 0 ? toTime(latestEnd) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < minCapacity || cap > 100) {
      setError(t.edit.errorCapacity(minCapacity));
      return;
    }
    if (slot.endTime && (!TIME_RE.test(endTime) || endTime <= slot.startTime)) {
      setError(t.edit.errorEnd);
      return;
    }
    if (latest && slot.endTime && toMinutes(endTime) < latestEnd) {
      setError(t.edit.errorEndBooked(latest));
      return;
    }
    const patch: { capacity?: number; endTime?: string; active?: boolean; note?: string } = {};
    if (cap !== slot.capacity) patch.capacity = cap;
    if (endTime !== slot.endTime) patch.endTime = endTime;
    if (active !== slot.active) patch.active = active;
    if (note.trim() !== slot.note) patch.note = note.trim();
    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.patch(`/admin/slots/${slot.id}`, patch);
      toast.success(t.edit.saved);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t.edit.title}</DialogTitle>
            <DialogDescription>{t.edit.description(label)}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={ids.capacity}>{t.edit.capacity}</Label>
            <Input
              id={ids.capacity}
              type="number"
              inputMode="numeric"
              min={minCapacity}
              max={100}
              step={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              disabled={pending}
              aria-describedby={peak > 0 ? `${ids.capacity}-hint` : undefined}
              required
            />
            {peak > 0 && (
              <p id={`${ids.capacity}-hint`} className="text-xs text-muted-grey">
                {t.edit.capacityHint(peak)}
              </p>
            )}
          </div>

          {slot.endTime && (
            <div className="space-y-1.5">
              <Label htmlFor={ids.end}>{t.edit.endTime}</Label>
              <Input
                id={ids.end}
                type="time"
                step={300}
                min={latest ?? slot.startTime}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={pending}
                aria-describedby={latest ? `${ids.end}-hint` : undefined}
              />
              {latest && (
                <p id={`${ids.end}-hint`} className="text-xs text-muted-grey">
                  {t.edit.endTimeHint(latest)}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              id={ids.active}
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-[#174D3A]"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              disabled={pending}
            />
            <Label htmlFor={ids.active} className="cursor-pointer">
              {t.edit.active}
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.note}>{t.edit.note}</Label>
            <Input
              id={ids.note}
              value={note}
              maxLength={200}
              placeholder={t.edit.notePlaceholder}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {cancelLabel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t.edit.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Create dialog (one window per day, bulk over a date range)
// ---------------------------------------------------------------------------

function CreateWindowsDialog({
  open,
  onOpenChange,
  today,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  onCreated: (from: string) => void;
}) {
  const t = useMessages(slotMessages);
  const f = useFormat();
  const errorText = useErrorText();
  const cancelLabel = useMessagesCancel();
  const [preset, setPreset] = useState<PresetKey>('full');
  const [startTime, setStartTime] = useState(PRESETS.full.startTime);
  const [endTime, setEndTime] = useState(PRESETS.full.endTime);
  const [capacity, setCapacity] = useState('1');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [note, setNote] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = {
    preset: useId(),
    start: useId(),
    end: useId(),
    capacity: useId(),
    from: useId(),
    to: useId(),
    weekdays: useId(),
    note: useId(),
    replace: useId(),
    preview: useId(),
  };

  // Reset the form every time the dialog opens
  useEffect(() => {
    if (!open) return;
    const first = addDays(today, 1);
    setPreset('full');
    setStartTime(PRESETS.full.startTime);
    setEndTime(PRESETS.full.endTime);
    setCapacity('1');
    setFrom(first);
    setTo(addDays(first, 55));
    setWeekdays([1, 2, 3, 4, 5]);
    setNote('');
    setReplaceExisting(true);
    setError(null);
  }, [open, today]);

  const choosePreset = (key: PresetKey) => {
    setPreset(key);
    if (key !== 'custom') {
      setStartTime(PRESETS[key].startTime);
      setEndTime(PRESETS[key].endTime);
    }
  };

  const timesValid = TIME_RE.test(startTime) && TIME_RE.test(endTime) && endTime > startTime;
  const windowMinutes = timesValid ? toMinutes(endTime) - toMinutes(startTime) : 0;
  const teams = Number(capacity);
  const teamsValid = Number.isInteger(teams) && teams >= 1 && teams <= 100;

  const dateCount = useMemo(() => {
    if (!isValidDay(from) || !isValidDay(to) || to < from) return 0;
    const span = daysBetween(from, to);
    if (span > MAX_RANGE_DAYS) return 0;
    let n = 0;
    for (let i = 0; i <= span; i++) if (weekdays.includes(isoWeekday(addDays(from, i)))) n++;
    return n;
  }, [from, to, weekdays]);

  const validate = (): string | null => {
    if (!timesValid) return t.form.errors.times;
    if (!teamsValid) return t.form.errors.capacity;
    if (!isValidDay(from) || !isValidDay(to) || to < from) return t.form.errors.dates;
    if (from < today) return t.form.errors.past;
    if (daysBetween(from, to) > MAX_RANGE_DAYS) return t.form.errors.range;
    if (weekdays.length === 0) return t.form.errors.weekdays;
    if (dateCount === 0) return t.form.previewNone;
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await api.post<{ created: number; updated: number; skipped: number; replaced?: number }>('/admin/slots', {
        from,
        to,
        weekdays: [...weekdays].sort((a, b) => a - b),
        times: [{ startTime, endTime }],
        capacity: teams,
        note: note.trim(),
        // A window with the same start time is overwritten (capacity, end, note) and reactivated
        updateExisting: true,
        replaceExisting,
      });
      toast.success(t.form.resultTitle, {
        description: t.form.result(res.created ?? 0, res.updated ?? 0, res.replaced ?? 0),
        duration: 8000,
      });
      onOpenChange(false);
      onCreated(from);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  const toggleWeekday = (day: number) =>
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));

  const presetOptions: { key: PresetKey; label: string; range?: string }[] = [
    { key: 'full', label: t.form.presetFull, range: `${PRESETS.full.startTime}–${PRESETS.full.endTime}` },
    { key: 'morning', label: t.form.presetMorning, range: `${PRESETS.morning.startTime}–${PRESETS.morning.endTime}` },
    { key: 'afternoon', label: t.form.presetAfternoon, range: `${PRESETS.afternoon.startTime}–${PRESETS.afternoon.endTime}` },
    { key: 'custom', label: t.form.presetCustom },
  ];

  const previewOk = dateCount > 0 && timesValid && teamsValid;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>{t.form.title}</DialogTitle>
            <DialogDescription>{t.form.description}</DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium leading-none">{t.form.window}</legend>
            <div className="grid gap-2 pt-1 sm:grid-cols-4">
              {presetOptions.map((o) => {
                const id = `${ids.preset}-${o.key}`;
                const checked = preset === o.key;
                return (
                  <label
                    key={o.key}
                    htmlFor={id}
                    className={cn(
                      'flex cursor-pointer select-none flex-col rounded-xl border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring',
                      checked ? 'border-pine bg-mint text-pine-dark' : 'border-border bg-white text-charcoal hover:border-sage'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        id={id}
                        type="radio"
                        name={ids.preset}
                        className="h-3.5 w-3.5 accent-[#174D3A]"
                        checked={checked}
                        onChange={() => choosePreset(o.key)}
                        disabled={pending}
                      />
                      <span className="font-semibold">{o.label}</span>
                    </span>
                    {o.range && <span className="pl-5 text-xs tabular-nums text-muted-grey">{o.range}</span>}
                  </label>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <div className="space-y-1">
                <Label htmlFor={ids.start} className="text-xs">
                  {t.form.start}
                </Label>
                <Input
                  id={ids.start}
                  type="time"
                  step={300}
                  className="w-32"
                  value={startTime}
                  onChange={(e) => {
                    setPreset('custom');
                    setStartTime(e.target.value);
                  }}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={ids.end} className="text-xs">
                  {t.form.end}
                </Label>
                <Input
                  id={ids.end}
                  type="time"
                  step={300}
                  className="w-32"
                  min={startTime || undefined}
                  value={endTime}
                  onChange={(e) => {
                    setPreset('custom');
                    setEndTime(e.target.value);
                  }}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={ids.capacity} className="text-xs">
                  {t.form.capacity}
                </Label>
                <Input
                  id={ids.capacity}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  step={1}
                  className="w-32"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  disabled={pending}
                  aria-describedby={`${ids.capacity}-hint`}
                  required
                />
              </div>
            </div>
            <p id={`${ids.capacity}-hint`} className="text-xs text-muted-grey">
              {t.form.capacityHint}
            </p>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.from}>{t.form.from}</Label>
              <Input
                id={ids.from}
                type="date"
                min={today}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.to}>{t.form.to}</Label>
              <Input
                id={ids.to}
                type="date"
                min={from || today}
                max={from && isValidDay(from) ? addDays(from, MAX_RANGE_DAYS) : undefined}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={pending}
                required
              />
            </div>
          </div>

          <fieldset className="space-y-2" aria-describedby={ids.weekdays}>
            <legend className="text-sm font-medium leading-none">{t.form.weekdays}</legend>
            <div className="flex flex-wrap items-center gap-2">
              {t.form.weekdayLabels.map((short, i) => {
                const day = i + 1;
                const checked = weekdays.includes(day);
                const id = `${ids.weekdays}-${day}`;
                return (
                  <label
                    key={day}
                    htmlFor={id}
                    className={cn(
                      'inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring',
                      checked ? 'border-pine bg-mint text-pine-dark' : 'border-border bg-white text-muted-grey hover:text-pine'
                    )}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[#174D3A] focus:outline-none"
                      checked={checked}
                      onChange={() => toggleWeekday(day)}
                      disabled={pending}
                    />
                    <span aria-hidden="true">{short}</span>
                    <span className="sr-only">{t.form.weekdayNames[i]}</span>
                  </label>
                );
              })}
              <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
              <Button type="button" variant="ghost" size="sm" onClick={() => setWeekdays([1, 2, 3, 4, 5])} disabled={pending}>
                {t.form.workdays}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setWeekdays([1, 2, 3, 4, 5, 6, 7])} disabled={pending}>
                {t.form.allDays}
              </Button>
            </div>
            <span id={ids.weekdays} className="sr-only">
              {weekdays
                .slice()
                .sort((a, b) => a - b)
                .map((d) => t.form.weekdayNames[d - 1])
                .join(', ')}
            </span>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor={ids.note}>{t.form.note}</Label>
            <Input id={ids.note} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} disabled={pending} />
          </div>

          <div
            className={cn(
              'flex items-start gap-2 rounded-xl border p-3',
              replaceExisting ? 'border-sage bg-mint/40' : 'border-border'
            )}
          >
            <input
              id={ids.replace}
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-input accent-[#174D3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              disabled={pending}
              aria-describedby={`${ids.replace}-hint`}
            />
            <div>
              <Label htmlFor={ids.replace} className="cursor-pointer">
                {t.form.replace}
              </Label>
              <p id={`${ids.replace}-hint`} className="mt-1 text-xs text-muted-grey">
                {replaceExisting ? t.form.replaceHint : t.form.keepHint}
              </p>
            </div>
          </div>

          <p
            id={ids.preview}
            aria-live="polite"
            className={cn(
              'rounded-xl px-3 py-2 text-sm font-medium',
              previewOk ? 'bg-mint text-pine-dark' : 'bg-amber-50 text-amber-900'
            )}
          >
            {dateCount === 0
              ? t.form.previewNone
              : !timesValid
                ? t.form.errors.times
                : !teamsValid
                  ? t.form.errors.capacity
                  : t.form.preview(dateCount, f.hours(windowMinutes), teams, f.hours(windowMinutes * teams))}
          </p>

          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {cancelLabel}
            </Button>
            <Button type="submit" disabled={pending || !previewOk} aria-describedby={ids.preview}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {pending ? t.form.saving : t.form.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
