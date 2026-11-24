'use client';

import { forwardRef } from 'react';

import { cn } from '@/lib/utils';
import { FieldError } from '../form-field';

/** Heading of a wizard step – receives focus when the step changes */
export const StepHeader = forwardRef<HTMLHeadingElement, { title: string; lead?: React.ReactNode }>(function StepHeader({ title, lead }, ref) {
  return (
    <div className="mb-5">
      <h2 ref={ref} tabIndex={-1} className="m-0 text-2xl font-bold tracking-tight text-pine-dark outline-none sm:text-3xl">
        {title}
      </h2>
      {lead && <p className="mb-0 mt-2 text-[15px] leading-relaxed text-muted-grey">{lead}</p>}
    </div>
  );
});

/** Stacked white card with heading row and optional right-aligned action */
export function SectionCard({
  id,
  title,
  description,
  action,
  error,
  children,
  className,
}: {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Card-level error summary (field errors are shown inline too) */
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'scroll-mt-28 rounded-2xl border bg-white p-5 shadow-[0_10px_24px_rgba(36,49,43,0.04)] sm:p-7',
        error ? 'border-red-300' : 'border-border',
        className
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h3 id={headingId} className="m-0 text-lg font-bold tracking-tight text-pine-dark sm:text-xl">
          {title}
        </h3>
        {action}
      </div>
      {description && <p className="-mt-2 mb-4 text-sm leading-relaxed text-muted-grey">{description}</p>}
      {error && (
        <div className="mb-4">
          <FieldError>{error}</FieldError>
        </div>
      )}
      {children}
    </section>
  );
}
