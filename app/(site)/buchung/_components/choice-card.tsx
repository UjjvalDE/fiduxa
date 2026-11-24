'use client';

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Selectable card backed by a real (visually hidden) radio/checkbox input,
 * so keyboard (Tab / arrows / Space) and screen readers work natively.
 */
export function ChoiceCard({
  type,
  name,
  value,
  checked,
  onChange,
  disabled,
  describedBy,
  className,
  children,
}: {
  type: 'radio' | 'checkbox';
  name: string;
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  describedBy?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn('relative block h-full', disabled ? 'cursor-not-allowed' : 'cursor-pointer', className)}>
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={cn(
          'flex h-full flex-col rounded-[14px] border bg-white p-4 text-left transition-[color,background-color,border-color,transform] duration-150 ease-out',
          !disabled && 'motion-safe:active:scale-[0.99]',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-cream',
          checked ? 'border-pine bg-mint' : 'border-border hover:border-sage',
          disabled && 'bg-gray-50 opacity-70 hover:border-border'
        )}
      >
        {children}
      </span>
      {checked && (
        <span
          className="pointer-events-none absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-pine text-white motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75 motion-safe:duration-150"
          aria-hidden="true"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      )}
    </label>
  );
}

/** Fieldset with a visible legend, used for each group of cards */
export function ChoiceGroup({
  legend,
  description,
  error,
  errorId,
  children,
  className,
}: {
  legend: React.ReactNode;
  description?: React.ReactNode;
  error?: string;
  errorId?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn('m-0 min-w-0 border-0 p-0', className)} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1 p-0 text-base font-bold text-pine-dark">{legend}</legend>
      {description && <p className="mb-3 text-sm text-muted-grey">{description}</p>}
      {!description && <div className="mb-3" />}
      {children}
    </fieldset>
  );
}
