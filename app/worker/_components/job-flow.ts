'use client';

// Helpers for the cleaner's job flow: marketplace error texts, Berlin time checks, checklist storage.
import { useCallback } from 'react';

import { ApiError } from '@/lib/api';
import { useLocale } from '@/lib/i18n/client';
import type { Locale } from '@/lib/i18n/config';
import { translateApiError } from '@/lib/i18n/api-errors';

import workerMessages from '../_messages';

/** Server: OPERATIONS.workerReleaseCutoffHours (default 24 h) – the server enforces it anyway */
export const RELEASE_CUTOFF_HOURS = 24;

/** Translate an English marketplace message, or null if it is not one of ours */
export function translateWorkerMessage(message: string, locale: Locale): string | null {
  const t = workerMessages[locale].apiErrors;
  if (message === 'This job is no longer available.') return t.noLongerAvailable;
  if (message === 'Only confirmed jobs that have not started can be handed back.') return t.releaseOnlyConfirmed;
  if (message === 'Job accepted.') return t.jobAccepted;
  if (message === 'Job declined.') return t.jobDeclined;
  if (message === 'Job handed back.') return t.jobReleased;
  if (message === 'Customer informed.') return t.customerInformed;
  const conflict = message.match(/^You already have job (\S+) at that time\.$/);
  if (conflict) return t.alreadyHaveJob(conflict[1]);
  const cutoff = message.match(/^Jobs can be handed back up to (\d+) hours before the start/);
  if (cutoff) return t.releaseCutoff(Number(cutoff[1]));
  return null;
}

/** User-facing text for any error of the worker job API (marketplace messages first, then the shared table) */
export function translateWorkerError(error: unknown, locale: Locale): string {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    const own = translateWorkerMessage(error.message, locale);
    if (own) return own;
  }
  return translateApiError(error, locale);
}

/** Hook: `const errorText = useWorkerErrorText(); toast.error(errorText(err));` */
export function useWorkerErrorText() {
  const { locale } = useLocale();
  return useCallback((error: unknown) => translateWorkerError(error, locale), [locale]);
}

export const isConflict = (error: unknown) => error instanceof ApiError && error.status === 409;

// ---------------------------------------------------------------------------
// Berlin calendar & time
// ---------------------------------------------------------------------------

const LEGACY_SLOT_START: Record<string, string> = { morning: '08:00', afternoon: '13:00' };

/** Today's calendar day in Berlin as YYYY-MM-DD */
export const berlinToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

/** Booking dates are UTC midnight of the calendar day → YYYY-MM-DD */
export const calendarDay = (iso: string) => iso.slice(0, 10);

export const isBerlinToday = (iso: string) => calendarDay(iso) === berlinToday();

/** Start instant of a slot on a booking day in Europe/Berlin (mirrors server slotStartInstant) */
export function berlinSlotStart(preferredDate: string, slot: string): Date {
  const day = new Date(`${calendarDay(preferredDate)}T00:00:00Z`);
  const start = LEGACY_SLOT_START[slot] ?? slot;
  const [hours, minutes] = start.split(':').map(Number);
  const noonUtc = new Date(day.getTime() + 12 * 60 * 60 * 1000);
  const berlinHourAtNoonUtc = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(noonUtc)
  );
  const offsetHours = berlinHourAtNoonUtc - 12;
  return new Date(day.getTime() + ((hours || 0) - offsetHours) * 60 * 60 * 1000 + (minutes || 0) * 60 * 1000);
}

/** Can the job still be handed back online (more than the cutoff before the start)? */
export const canReleaseNow = (preferredDate: string, slot: string, now = Date.now()) =>
  berlinSlotStart(preferredDate, slot).getTime() - RELEASE_CUTOFF_HOURS * 60 * 60 * 1000 > now;

// ---------------------------------------------------------------------------
// Checklist (local progress per job, sessionStorage)
// ---------------------------------------------------------------------------

const checklistKey = (jobId: string) => `fiduxa.worker.checklist.${jobId}`;

export function loadChecklist(jobId: string): string[] {
  try {
    const raw = window.sessionStorage.getItem(checklistKey(jobId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveChecklist(jobId: string, keys: string[]) {
  try {
    window.sessionStorage.setItem(checklistKey(jobId), JSON.stringify(keys));
  } catch {
    // storage full or blocked – progress just isn't persisted
  }
}

export function clearChecklist(jobId: string) {
  try {
    window.sessionStorage.removeItem(checklistKey(jobId));
  } catch {
    // ignore
  }
}
