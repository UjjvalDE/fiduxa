'use client';

import { CircleAlert } from 'lucide-react';

import { Label } from '@/componets/ui/lable';
import { useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';

export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean | undefined;
  'aria-describedby': string | undefined;
}

/**
 * Label + control + hint + error, with aria wiring.
 *   <FormField id="email" label={t.email} error={errors.email}>
 *     {(p) => <Input {...p} type="email" … />}
 *   </FormField>
 */
export function FormField({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  optional?: boolean;
  children: (props: FieldControlProps) => React.ReactNode;
}) {
  const t = useMessages(common);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-sm font-bold text-pine-dark">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-grey">({t.states.optional})</span>}
      </Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && (
        <p id={hintId} className="text-xs leading-relaxed text-muted-grey">
          {hint}
        </p>
      )}
      {error && <FieldError id={errorId!}>{error}</FieldError>}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-xs font-semibold text-red-700">
      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Red inline box for request-level errors (with optional retry) */
export function ErrorBox({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  const t = useMessages(common);
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="m-0 min-w-0 flex-1">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-bold text-red-800 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
          {retryLabel ?? t.actions.retry}
        </button>
      )}
    </div>
  );
}

/** Shared input look for this area: larger touch targets, brand focus ring */
export const inputClass =
  'h-11 rounded-[10px] border-border bg-white text-base sm:text-sm focus-visible:ring-pine aria-[invalid=true]:border-red-500';
export const textareaClass =
  'min-h-[96px] rounded-[10px] border-border bg-white text-base sm:text-sm focus-visible:ring-pine aria-[invalid=true]:border-red-500';
