'use client';

// Cash bookings (customer pays the cleaner at the end) and flexible job times.
import { useCallback } from 'react';
import { Banknote } from 'lucide-react';

import { useFormat, useMessages } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import cashMessages from '../_cash-messages';

const HHMM = /^(\d{1,2}):(\d{2})$/;
const toMinutes = (time: string | undefined | null) => {
  const m = time ? HHMM.exec(time) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const toHHMM = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Time of a job as a range with its length: "08:00–11:30 · 3,5 Std.".
 * Uses slotEnd when known, otherwise start + duration; the length comes from
 * durationMinutes, or from the range.
 */
export function useJobTime() {
  const f = useFormat();
  return useCallback(
    (slot: string | undefined | null, slotEnd?: string | null, durationMinutes?: number | null) => {
      const start = toMinutes(slot);
      let end = slotEnd || null;
      if (!end && start !== null && durationMinutes) end = toHHMM(start + durationMinutes);
      let duration = durationMinutes ?? null;
      if (!duration && start !== null) {
        const endMin = toMinutes(end);
        if (endMin !== null && endMin > start) duration = endMin - start;
      }
      const range = f.slot(slot, end);
      return duration ? `${range} · ${f.hours(duration)}` : range;
    },
    [f]
  );
}

/** Small amber "Bar" pill for cash jobs */
export function CashBadge({ className, long = false, amount }: { className?: string; long?: boolean; amount?: string }) {
  const t = useMessages(cashMessages);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900',
        className
      )}
    >
      <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
      {long ? t.badgeLong : t.badge}
      {amount && <span className="font-bold">· {amount}</span>}
    </span>
  );
}

/** "87,50" / "87.50" / "87" → 8750; null when not a valid non-negative amount */
export function parseEuroToCents(input: string): number | null {
  const s = input.trim().replace(/\s|€/g, '');
  if (!s) return null;
  // Accept one decimal separator (comma or dot) with up to 2 decimals; thousands separators are not expected here
  const m = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= 1_000_000 ? cents : null;
}

/** 8750 → "87,50" (de/pl) or "87.50" (en) for an editable input */
export function centsToInput(cents: number, locale: string): string {
  const s = (cents / 100).toFixed(2);
  return locale === 'en' ? s : s.replace('.', ',');
}
