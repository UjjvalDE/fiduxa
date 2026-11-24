// "08:00–11:00 (3 Std.)" – appointment time as a range with its duration.
// Used by the booking confirmation, account and payment pages.
import type { Formatter } from '@/lib/i18n/format';

const TIME = /^(\d{2}):(\d{2})$/;

/** "08:00" + 180 → "11:00" (null when the start is not a clock time, e.g. legacy "morning") */
export function addMinutes(start: string | null | undefined, minutes: number | null | undefined): string | null {
  const match = TIME.exec(start ?? '');
  if (!match || minutes == null || !Number.isFinite(minutes)) return null;
  const total = (Number(match[1]) * 60 + Number(match[2]) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Time range of a booking. `end` falls back to start + duration; the duration
 * is appended in brackets when known: "08:00–11:00 (3 Std.)".
 */
export function slotRange(
  f: Formatter,
  start: string | null | undefined,
  end?: string | null,
  durationMinutes?: number | null
): string {
  if (!start) return '–';
  const range = f.slot(start, end || addMinutes(start, durationMinutes));
  return durationMinutes ? `${range} (${f.hours(durationMinutes)})` : range;
}
