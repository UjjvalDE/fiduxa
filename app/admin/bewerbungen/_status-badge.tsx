'use client';

import { useMessages } from '@/lib/i18n/client';
import type { ApplicationStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

import messages from './_messages';

const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  new: 'border-amber-200 bg-amber-50 text-amber-800',
  contacted: 'border-sky-200 bg-sky-50 text-sky-800',
  invited: 'border-sage bg-mint text-pine',
  rejected: 'border-red-200 bg-red-50 text-red-700',
};

export const APPLICATION_STATUSES: ApplicationStatus[] = ['new', 'contacted', 'invited', 'rejected'];

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const t = useMessages(messages);
  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', STATUS_CLASSES[status])}>
      {t.status[status]}
    </span>
  );
}
