'use client';

// Admin booking detail: change history (booking.changeLog) and the
// post-cleaning feedback card (booking.feedback + job.actualDurationMinutes).
// The backend fields are not part of lib/types yet – they are typed locally
// here (see BookingWithInsights).
import { ThumbsDown, ThumbsUp } from 'lucide-react';

import { useFormat, useMessages } from '@/lib/i18n/client';
import catalogue, { type ExtraId } from '@/lib/i18n/messages/catalogue';
import common from '@/lib/i18n/messages/common';
import type { Booking, Condition, ServiceId } from '@/lib/types';

import bookingMessages from '../buchungen/_messages';
import { InfoList, SectionCard } from './states';

// ---------------------------------------------------------------------------
// Local extension of the Booking type (changeLog / feedback are not in
// lib/types yet)
// ---------------------------------------------------------------------------

interface BookingChange {
  field: string;
  from?: string;
  to?: string;
}

interface BookingChangeLogEntry {
  at: string;
  by?: string | { _id: string; name?: string };
  role?: 'consumer' | 'admin';
  changes?: BookingChange[];
}

interface BookingFeedback {
  emailedAt?: string;
  customer?: {
    actualDurationMinutes?: number;
    recommend?: boolean;
    keepCleaner?: 'same' | 'different' | 'auto';
    submittedAt?: string;
  };
  durationMismatch?: boolean;
}

export type BookingWithInsights = Booking & {
  changeLog?: BookingChangeLogEntry[];
  feedback?: BookingFeedback;
  job?: NonNullable<Booking['job']> & { actualDurationMinutes?: number };
};

const OBJECT_ID = /^[0-9a-f]{24}$/i;

// ---------------------------------------------------------------------------
// Änderungsverlauf
// ---------------------------------------------------------------------------

export function ChangeLogCard({ booking }: { booking: Booking }) {
  const t = useMessages(bookingMessages);
  const c18 = useMessages(common);
  const cat = useMessages(catalogue);
  const f = useFormat();
  const b = booking as BookingWithInsights;
  const entries = [...(b.changeLog ?? [])].reverse();
  if (entries.length === 0) return null;

  const value = (field: string, raw: string | undefined): string => {
    const v = (raw ?? '').trim();
    if (!v) return t.changeLog.emptyValue;
    const n = Number(v);
    switch (field) {
      case 'preferredDate':
        return f.date(v);
      case 'durationMinutes':
        return Number.isFinite(n) ? f.hours(n) : v;
      case 'totalCents':
        return Number.isFinite(n) ? f.euro(n) : v;
      case 'areaM2':
        return `${v} m²`;
      case 'serviceId':
        return c18.services[v as ServiceId] ?? v;
      case 'condition':
        return c18.conditions[v as Condition]?.label ?? v;
      case 'extras':
        return v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((id) => cat.extras[id as ExtraId]?.label ?? id)
          .join(', ');
      case 'assignedWorker':
        return OBJECT_ID.test(v) ? `#${v.slice(-6)}` : v;
      default:
        return v;
    }
  };

  return (
    <SectionCard id="aenderungsverlauf" title={t.changeLog.title} description={t.changeLog.description}>
      <ol className="space-y-3">
        {entries.map((entry, i) => (
          <li key={`${entry.at}-${i}`} className="rounded-xl border border-border bg-cream/40 p-3">
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-grey">
              <span>{f.dateTime(entry.at)}</span>
              <span
                className={
                  entry.role === 'consumer'
                    ? 'inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-semibold text-sky-800'
                    : 'inline-flex rounded-full border border-sage bg-mint px-2 py-0.5 font-semibold text-pine'
                }
              >
                {entry.role === 'consumer' ? t.changeLog.roleConsumer : t.changeLog.roleAdmin}
              </span>
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {(entry.changes ?? []).map((c, j) => (
                <li key={`${c.field}-${j}`} className="break-words text-charcoal">
                  <span className="font-medium">{t.changeLog.fields[c.field] ?? c.field}:</span>{' '}
                  <span className="text-muted-grey">{value(c.field, c.from)}</span>
                  <span aria-hidden="true"> → </span>
                  <span className="sr-only">→ </span>
                  {value(c.field, c.to)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Feedback & Dauer
// ---------------------------------------------------------------------------

export function FeedbackCard({ booking }: { booking: Booking }) {
  const t = useMessages(bookingMessages);
  const f = useFormat();
  const b = booking as BookingWithInsights;
  const fb = b.feedback;
  const customer = fb?.customer;
  const cleanerMinutes = b.job?.actualDurationMinutes;

  const hasAny = Boolean(
    fb?.emailedAt ||
      fb?.durationMismatch ||
      customer?.submittedAt ||
      customer?.actualDurationMinutes != null ||
      customer?.recommend != null ||
      customer?.keepCleaner ||
      cleanerMinutes != null
  );
  if (booking.status !== 'completed' || !hasAny) return null;

  const keepLabel =
    customer?.keepCleaner === 'same'
      ? t.feedback.keepSame
      : customer?.keepCleaner === 'different'
        ? t.feedback.keepDifferent
        : customer?.keepCleaner === 'auto'
          ? t.feedback.keepAuto
          : null;

  const items: [string, React.ReactNode][] = [
    [t.feedback.planned, f.hours(booking.estimate?.durationMinutes)],
    [t.feedback.cleanerReported, cleanerMinutes != null ? f.hours(cleanerMinutes) : '–'],
    [
      t.feedback.customerReported,
      customer?.actualDurationMinutes != null ? f.hours(customer.actualDurationMinutes) : '–',
    ],
  ];
  if (customer?.recommend != null) {
    items.push([
      t.feedback.recommend,
      <span key="recommend" className="inline-flex items-center gap-1.5">
        {customer.recommend ? (
          <ThumbsUp className="h-4 w-4 text-pine" aria-hidden="true" />
        ) : (
          <ThumbsDown className="h-4 w-4 text-red-600" aria-hidden="true" />
        )}
        {customer.recommend ? t.feedback.recommendYes : t.feedback.recommendNo}
      </span>,
    ]);
  }
  if (keepLabel) items.push([t.feedback.keepCleaner, keepLabel]);

  return (
    <SectionCard
      id="feedback"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t.feedback.title}
          {fb?.durationMismatch && (
            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              {t.feedback.mismatch}
            </span>
          )}
        </span>
      }
      description={
        customer?.submittedAt
          ? t.feedback.submitted(f.dateTime(customer.submittedAt))
          : fb?.emailedAt
            ? `${t.feedback.emailed(f.dateTime(fb.emailedAt))} · ${t.feedback.notSubmitted}`
            : t.feedback.notSubmitted
      }
    >
      <InfoList items={items} />
      <p className="mt-4 text-xs text-muted-grey">{t.feedback.noAutoCharge}</p>
    </SectionCard>
  );
}
