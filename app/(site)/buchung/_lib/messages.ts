// Error helpers for the customer area. API messages (English) are translated
// with lib/i18n/api-errors; field-level 422 details are mapped to the
// caller's own (translated) field messages.
import { ApiError } from '@/lib/api';
import { translateApiError, translateApiMessage } from '@/lib/i18n/api-errors';
import type { Locale } from '@/lib/i18n/config';

export { translateApiError, translateApiMessage };

/**
 * Field errors of a 422 response keyed by top-level field name.
 * `messages` provides the translated text per field; unknown fields fall back
 * to the translated API message.
 */
export function apiFieldErrors(error: unknown, locale: Locale, messages: Record<string, string> = {}): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const result: Record<string, string> = {};
  Object.entries(error.fieldErrors).forEach(([path, message]) => {
    const field = path.split('.')[0];
    if (!field || result[field]) return;
    result[field] = messages[field] ?? translateApiMessage(message, locale);
  });
  return result;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only allow same-site relative redirects (prevents open redirects) */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}
