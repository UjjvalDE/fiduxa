'use client';

import { Globe } from 'lucide-react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/config';
import { useLocale, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import { cn } from '@/lib/utils';

/**
 * DE / EN / PL switcher. Stores the choice in a cookie and – for signed-in
 * users – as preferred language (used for their emails).
 */
export function LanguageSwitcher({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const { locale, setLocale } = useLocale();
  const { user } = useAuth();
  const t = useMessages(common);

  const change = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    if (user) {
      api.patch('/users/me', { preferredLanguage: next }).catch(() => undefined);
    }
  };

  return (
    <div role="group" aria-label={t.language.change} className={cn('inline-flex items-center gap-1', className)}>
      <Globe className={cn('mr-1 h-4 w-4', tone === 'light' ? 'text-white/70' : 'text-muted-grey')} aria-hidden="true" />
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            onClick={() => change(code)}
            aria-pressed={active}
            aria-label={LOCALE_NAMES[code]}
            title={LOCALE_NAMES[code]}
            className={cn(
              'rounded-md px-1.5 py-1 text-xs font-bold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tone === 'light'
                ? active
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:text-white'
                : active
                  ? 'bg-mint text-pine'
                  : 'text-muted-grey hover:text-pine'
            )}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
