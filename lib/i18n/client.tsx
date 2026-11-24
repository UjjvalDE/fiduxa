'use client';

// Client-side i18n.
//
//   import messages from './messages';            // a defineMessages({ de, en, pl }) module
//   const t = useMessages(messages);               // → messages for the current language
//   const { locale, setLocale } = useLocale();
//   const f = useFormat();                         // f.euro(12000), f.date(iso), f.slot('08:00', '10:00') …

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, type MessageModule } from './config';
import { createFormatter } from './format';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
});

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const router = useRouter();

  const setLocale = useCallback(
    (next: Locale) => {
      // 1 year, whole site
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      setLocaleState(next);
      // Re-render server components (metadata, server-rendered text) in the new language
      router.refresh();
    },
    [router]
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

/** Messages of a module for the current language */
export function useMessages<T>(module: MessageModule<T>): T {
  const { locale } = useLocale();
  return module[locale] ?? module[DEFAULT_LOCALE];
}

/** Locale-aware formatters (currency, dates, hours, slot times) */
export function useFormat() {
  const { locale } = useLocale();
  return useMemo(() => createFormatter(locale), [locale]);
}
