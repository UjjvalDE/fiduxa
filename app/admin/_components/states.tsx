'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Inbox, RotateCw, type LucideIcon } from 'lucide-react';

import { Button } from '@/componets/ui/button';
import { Skeleton } from '@/componets/ui/skeleton';
import { useMessages } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { Pagination } from '@/lib/types';

import adminMessages from '../_messages';

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  const t = useMessages(adminMessages);
  return (
    <div className="mb-6 space-y-3">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-grey hover:text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel ?? t.ui.back}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-pine-dark">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-grey">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={cn('rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6', className)}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && (
              <h2 id={headingId} className="text-base font-semibold text-pine-dark">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-sm text-muted-grey">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Label/value pairs */
export function InfoList({ items, className }: { items: [string, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2', className)}>
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-grey">{label}</dt>
          <dd className="mt-0.5 break-words text-charcoal">{value === '' || value == null ? '–' : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useMessages(adminMessages);
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="bg-white">
          <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {t.ui.retry}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-white px-6 py-12 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-mint text-pine">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="font-semibold text-pine-dark">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-grey">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ListSkeleton({ rows = 6, label: labelProp }: { rows?: number; label?: string }) {
  const t = useMessages(adminMessages);
  const label = labelProp ?? t.ui.loadingData;
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-white p-4" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function DetailSkeleton() {
  const t = useMessages(adminMessages);
  return (
    <div className="space-y-4" role="status" aria-label={t.ui.loading}>
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 lg:col-span-2" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-40" />
      <span className="sr-only">{t.ui.loading}…</span>
    </div>
  );
}

export function PaginationBar({
  pagination,
  onPageChange,
  disabled,
}: {
  pagination: Pagination | undefined | null;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const t = useMessages(adminMessages);
  if (!pagination || pagination.pages <= 1) {
    return pagination ? (
      <p className="mt-3 text-xs text-muted-grey">{t.ui.entries(pagination.total)}</p>
    ) : null;
  }
  const { page, pages, total } = pagination;
  return (
    <nav aria-label={t.ui.pagination} className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-grey">{t.ui.pageOf(page, pages, total)}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
          {t.ui.back}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          {t.ui.next}
          <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

/** Native select styled like shadcn inputs – keyboard friendly and URL friendly */
export function NativeSelect({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  const t = useMessages(adminMessages);
  return active ? (
    <span className="inline-flex rounded-full border border-sage bg-mint px-2.5 py-0.5 text-xs font-semibold text-pine">{t.ui.active}</span>
  ) : (
    <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
      {t.ui.inactive}
    </span>
  );
}
