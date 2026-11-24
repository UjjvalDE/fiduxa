// Server-side i18n (server components, generateMetadata).
//
//   const t = getMessages(messages);   // messages for the request's language
//   const locale = getLocale();
//
// The language comes from the `fiduxa_locale` cookie (default German).
import { cookies } from 'next/headers';

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale, type MessageModule } from './config';
import { createFormatter } from './format';

export function getLocale(): Locale {
  const value = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function getMessages<T>(module: MessageModule<T>): T {
  return module[getLocale()] ?? module[DEFAULT_LOCALE];
}

export function getFormat() {
  return createFormatter(getLocale());
}
