// Supported languages. German is the main language and the default.
export const LOCALES = ['de', 'en', 'pl'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'de';
export const LOCALE_COOKIE = 'fiduxa_locale';

export const LOCALE_NAMES: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
  pl: 'Polski',
};

/** BCP-47 tags for Intl (numbers, currency, dates) */
export const INTL_LOCALE: Record<Locale, string> = {
  de: 'de-DE',
  en: 'en-GB',
  pl: 'pl-PL',
};

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/**
 * A message module: one object per language with the same shape as German.
 * Values can be strings or functions (for interpolation), e.g.
 *   const de = { hello: (name: string) => `Hallo ${name}` };
 *   const en: typeof de = { hello: (name) => `Hello ${name}` };
 *   export default defineMessages({ de, en, pl });
 */
export type MessageModule<T> = Record<Locale, T>;

export const defineMessages = <T,>(module: MessageModule<T>) => module;
