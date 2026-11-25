'use client';

import Link from 'next/link';

import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminComplaintsResponse, ComplaintStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

import { SectionCard } from '../_components/states';
import { useApi } from '../_components/use-api';
import messages from './_messages';

const STATUS_CLASS: Record<ComplaintStatus, string> = {
  open: 'border-amber-200 bg-amber-50 text-amber-900',
  in_review: 'border-sky-200 bg-sky-50 text-sky-900',
  resolved: 'border-sage bg-mint text-pine-dark',
  rejected: 'border-border bg-cream text-charcoal',
};

export function ComplaintStatusBadge({ status }: { status: ComplaintStatus }) {
  const t = useMessages(messages);
  return <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', STATUS_CLASS[status])}>{t.status[status]}</span>;
}

/** Admin cleaner detail: how many complaints this cleaner has (latest five) */
export function WorkerComplaintsCard({ workerId }: { workerId: string }) {
  const t = useMessages(messages);
  const f = useFormat();
  const { data } = useApi<AdminComplaintsResponse>(`/admin/complaints?worker=${encodeURIComponent(workerId)}&limit=5`);
  if (!data) return null;
  return (
    <SectionCard
      id="beschwerden"
      title={`${t.cardTitle} (${data.counts.total})`}
      description={data.counts.total ? t.counts(data.counts.open, data.counts.in_review) : undefined}
      actions={
        data.counts.total > 0 ? (
          <Link href={`/admin/beschwerden?worker=${encodeURIComponent(workerId)}`} className="text-sm font-medium text-pine hover:underline">
            {t.cardAll}
          </Link>
        ) : undefined
      }
    >
      {data.complaints.length === 0 ? (
        <p className="text-sm text-muted-grey">{t.cardEmpty}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {data.complaints.map((c) => (
            <li key={c._id} className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/admin/beschwerden/${c._id}`} className="font-medium text-pine hover:underline">
                {c.bookingRef} · {t.categories[c.category]}
              </Link>
              <span className="flex items-center gap-2 text-xs text-muted-grey">
                {f.dateShort(c.createdAt)} <ComplaintStatusBadge status={c.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
