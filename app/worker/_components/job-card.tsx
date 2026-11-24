'use client';

import Link from 'next/link';
import { CalendarDays, ChevronRight, Clock, MapPin, MessageSquare, PawPrint } from 'lucide-react';

import { useFormat, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { BookingStatus, WorkerJob } from '@/lib/types';
import { cn } from '@/lib/utils';

import messages from '../_messages';
import portalMessages from '../_portal-messages';
import { CashBadge, useJobTime } from './cash';
import { JOB_STATUS_CLASSES } from './labels';

type WorkerPayout = NonNullable<WorkerJob['workerPayout']>;

/** The API also returns the slot end time ("HH:MM"), when the job was assigned and the cash kept from the customer */
export type WorkerJobWithSlot = Omit<WorkerJob, 'workerPayout'> & {
  slotEnd?: string;
  assignedAt?: string;
  workerPayout?: (WorkerPayout & { cashHeldCents?: number }) | null;
};

export function JobStatusBadge({ status }: { status: BookingStatus }) {
  const t = useMessages(messages);
  const c = useMessages(common);
  const label =
    (t.jobStatus as Partial<Record<BookingStatus, string>>)[status] ?? c.bookingStatus[status]?.label ?? status;
  const className = JOB_STATUS_CLASSES[status] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', className)}>
      {label}
    </span>
  );
}

export function JobCard({ job, unread = 0 }: { job: WorkerJobWithSlot; unread?: number }) {
  const t = useMessages(messages);
  const p = useMessages(portalMessages).jobExtra;
  const c = useMessages(common);
  const f = useFormat();
  const jobTime = useJobTime();
  const service = c.services[job.serviceId] ?? job.serviceId;

  return (
    <Link
      href={`/worker/jobs/${job._id}`}
      className="block rounded-2xl border border-border bg-white p-4 shadow-sm transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-pine-dark">{service}</p>
          <p className="font-mono text-xs text-muted-grey">{job.reference}</p>
        </div>
        <JobStatusBadge status={job.status} />
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-charcoal">
        <li className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
          {f.dateLong(job.preferredDate)}
        </li>
        <li className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
          {jobTime(job.slot, job.slotEnd, job.estimate?.durationMinutes)}
        </li>
        <li className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
          <span className="truncate">
            {job.customerDetails.address}, {job.customerDetails.postcode}
          </span>
        </li>
      </ul>
      {(job.pets || unread > 0 || job.cash) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {job.cash && <CashBadge amount={job.cash.collected ? undefined : f.euro(job.cash.amountCents)} />}
          {unread > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pine px-2.5 py-0.5 text-xs font-semibold text-white">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              {p.unread(unread)}
            </span>
          )}
          {job.pets && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              <PawPrint className="h-3.5 w-3.5" aria-hidden="true" />
              {p.petsShort}
            </span>
          )}
        </div>
      )}
      <span className="mt-3 flex items-center justify-end text-sm font-semibold text-pine">
        {t.card.details} <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
}
