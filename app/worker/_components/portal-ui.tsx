'use client';

// Small building blocks shared by the cleaner portal pages.
import Link from 'next/link';
import { Check, Info, Lock } from 'lucide-react';

import { Skeleton } from '@/componets/ui/skeleton';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { PayoutStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

import portalMessages from '../_portal-messages';

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {children}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-pine-dark">{title}</h1>
        {subtitle && <p className="text-sm text-muted-grey">{subtitle}</p>}
      </div>
    </div>
  );
}

export function PortalCard({
  title,
  description,
  children,
  action,
  className,
  id,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      aria-labelledby={headingId}
      id={id}
      className={cn('rounded-2xl border border-border bg-white p-5 shadow-sm', className)}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h2 id={headingId} className="text-lg font-semibold text-pine-dark">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-sm text-muted-grey">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: typeof Info;
  tone?: 'default' | 'accent' | 'warn';
}) {
  return (
    <div
      className={cn(
        'flex min-h-[96px] flex-col justify-between rounded-2xl border p-4 shadow-sm',
        tone === 'accent' && 'border-sage bg-mint',
        tone === 'warn' && 'border-amber-200 bg-amber-50',
        tone === 'default' && 'border-border bg-white'
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-grey">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-pine" aria-hidden="true" />}
        {label}
      </p>
      <div className="mt-2 text-xl font-bold text-pine-dark">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-grey">{hint}</div>}
    </div>
  );
}

/** Multi-select chips (aria-pressed toggle buttons) */
export function ChipGroup({
  options,
  selected,
  onToggle,
  disabled,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onToggle(o.value)}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
              active ? 'border-pine bg-pine text-white' : 'border-border bg-white text-charcoal hover:border-sage'
            )}
          >
            {active && <Check className="h-4 w-4" aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-label={label}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

/** Shown on approved-only pages for workers who are not approved (yet) */
export function NotAvailable({ text }: { text: string }) {
  const t = useMessages(portalMessages).common;
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-white p-5 text-sm text-charcoal shadow-sm">
      <p className="flex items-start gap-2">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
        {text}
      </p>
      <Link
        href="/worker"
        className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 font-semibold text-pine hover:bg-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t.toHome}
      </Link>
    </div>
  );
}

/** Real timestamp → calendar date in Berlin ("19.11.2026") */
export function useBerlinDate() {
  const f = useFormat();
  return (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleDateString(f.tag, { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
      : '–';
}

export const PAYOUT_STATUS_CLASSES: Record<PayoutStatus, string> = {
  pending: 'border-sky-200 bg-sky-50 text-sky-800',
  due: 'border-sage bg-mint text-pine-dark',
  on_hold: 'border-red-200 bg-red-50 text-red-700',
  paid: 'border-gray-200 bg-gray-100 text-gray-700',
};

/** Status of a cleaner payout with dates ("Ausstehend bis 19.12.2026") */
export function PayoutStatusBadge({
  status,
  dueAt,
  paidAt,
  className,
}: {
  status: PayoutStatus;
  dueAt?: string | null;
  paidAt?: string | null;
  className?: string;
}) {
  const t = useMessages(portalMessages).earnings.status;
  const date = useBerlinDate();
  const label =
    status === 'pending' ? t.pending(date(dueAt)) : status === 'paid' ? t.paid(date(paidAt)) : status === 'due' ? t.due : t.on_hold;
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        PAYOUT_STATUS_CLASSES[status],
        className
      )}
    >
      {label}
    </span>
  );
}

/** Display status of a job payout: a pending payout past its due date is "due" (mirrors server displayPayoutStatus) */
export const payoutDisplayStatus = (p: { status: 'pending' | 'on_hold' | 'paid'; dueAt: string }): PayoutStatus =>
  p.status === 'pending' && new Date(p.dueAt).getTime() <= Date.now() ? 'due' : p.status;
