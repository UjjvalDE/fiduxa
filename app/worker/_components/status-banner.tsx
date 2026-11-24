'use client';

import { Clock, PartyPopper, ShieldAlert, XCircle } from 'lucide-react';

import { useMessages } from '@/lib/i18n/client';
import type { WorkerOverview } from '@/lib/types';
import { cn } from '@/lib/utils';

import messages from '../_messages';

export function StatusBanner({ overview }: { overview: WorkerOverview }) {
  const t = useMessages(messages).banner;
  const { workerStatus, reviewNote } = overview.worker;
  const done = Object.values(overview.checklist).every(Boolean);

  const config = {
    pending_review: done
      ? {
          icon: Clock,
          className: 'border-sky-200 bg-sky-50 text-sky-900',
          title: t.reviewDoneTitle,
          text: t.reviewDoneText,
        }
      : {
          icon: Clock,
          className: 'border-amber-200 bg-amber-50 text-amber-900',
          title: t.reviewTodoTitle,
          text: t.reviewTodoText,
        },
    approved: {
      icon: PartyPopper,
      className: 'border-sage bg-mint text-pine-dark',
      title: t.approvedTitle,
      text: t.approvedText,
    },
    rejected: {
      icon: XCircle,
      className: 'border-red-200 bg-red-50 text-red-900',
      title: t.rejectedTitle,
      text: reviewNote ? t.rejectedReason(reviewNote) : t.rejectedText,
    },
    suspended: {
      icon: ShieldAlert,
      className: 'border-red-200 bg-red-50 text-red-900',
      title: t.suspendedTitle,
      text: t.suspendedText,
    },
    invited: {
      icon: Clock,
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      title: t.invitedTitle,
      text: t.invitedText,
    },
    not_applicable: null,
  }[workerStatus];

  if (!config) return null;
  const Icon = config.icon;
  return (
    <div role="status" className={cn('flex gap-3 rounded-2xl border p-4', config.className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{config.title}</p>
        <p className="mt-0.5 text-sm">{config.text}</p>
      </div>
    </div>
  );
}
