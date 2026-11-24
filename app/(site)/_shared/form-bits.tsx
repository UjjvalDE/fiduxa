import { AlertCircle } from 'lucide-react';

/** id used for an input bound to a dotted API field path, e.g. company.email → f-company-email */
export const fieldId = (field: string) => `f-${field.replace(/\./g, '-')}`;
export const errorId = (field: string) => `${fieldId(field)}-error`;

/** Props that link an input to its error message */
export const fieldA11y = (field: string, errors: Record<string, string>) => ({
  id: fieldId(field),
  'aria-invalid': errors[field] ? true : undefined,
  'aria-describedby': errors[field] ? errorId(field) : undefined,
});

export function FieldError({ field, errors }: { field: string; errors: Record<string, string> }) {
  const message = errors[field];
  if (!message) return null;
  return (
    <p id={errorId(field)} className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-red-700">
      <AlertCircle size={14} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

/** Move focus to the first field that has an error (in DOM order). */
export const focusFirstError = (errors: Record<string, string>) => {
  if (typeof document === 'undefined') return;
  const ids = Object.keys(errors).map(fieldId);
  const elements = ids
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  elements[0]?.focus();
};

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
