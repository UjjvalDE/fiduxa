'use client';

// "Continue with Google / Apple" for customers (login, registration and the
// account step of the booking wizard). Buttons appear only for providers the
// API reports as configured. The flow is a full-page redirect through the API;
// failures come back as ?oauth_error=<code>.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { api, apiUrl } from '@/lib/api';
import { useLocale, useMessages } from '@/lib/i18n/client';
import authMessages from '../_auth-messages';
import { safeNext } from '../_lib/messages';
import { ErrorBox } from './form-field';

type Providers = { google: boolean; apple: boolean };
type Origin = 'login' | 'register' | 'checkout';

let cached: Promise<Providers> | null = null;
const loadProviders = () => {
  cached ??= api
    .get<{ providers: Providers }>('/auth/providers')
    .then((r) => r.providers)
    .catch(() => {
      cached = null;
      return { google: false, apple: false };
    });
  return cached;
};

function GoogleLogo() {
  // Official multicolour "G" (Google Identity branding guidelines)
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 17 20" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M14.2 10.63c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.39-.92-2.41-3.66zM11.93 3.88c.63-.77 1.06-1.83.94-2.88-.91.04-2.01.6-2.66 1.37-.58.68-1.09 1.76-.95 2.8 1.01.08 2.04-.51 2.67-1.29z" />
    </svg>
  );
}

const buttonBase =
  'flex min-h-[44px] w-full items-center justify-center gap-3 rounded-[12px] px-4 py-2.5 text-[15px] font-medium no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine';

export function SocialLogin({ from, next }: { from: Origin; next?: string | null }) {
  const t = useMessages(authMessages);
  const { locale } = useLocale();
  const params = useSearchParams();
  const [providers, setProviders] = useState<Providers | null>(null);
  const errorCode = params.get('oauth_error');

  useEffect(() => {
    let alive = true;
    loadProviders().then((p) => alive && setProviders(p));
    return () => {
      alive = false;
    };
  }, []);

  const errors = t.social.errors as Record<string, string>;
  const errorText = errorCode ? errors[errorCode] ?? errors.generic : null;
  const anyProvider = Boolean(providers?.google || providers?.apple);
  if (!anyProvider && !errorText) return null;

  const href = (provider: 'google' | 'apple') => {
    const q = new URLSearchParams({ from, lang: locale });
    const target = safeNext(next ?? null);
    if (target) q.set('next', target);
    return apiUrl(`/auth/oauth/${provider}/start?${q}`);
  };

  return (
    <div className="mb-5 grid gap-3">
      {errorText && <ErrorBox message={errorText} />}
      {providers?.google && (
        <a href={href('google')} className={`${buttonBase} border border-[#747775] bg-white text-[#1F1F1F] hover:bg-[#F8F9FA]`} style={{ fontFamily: 'Roboto, Arial, sans-serif' }}>
          <GoogleLogo />
          {t.social.google}
        </a>
      )}
      {providers?.apple && (
        <a href={href('apple')} className={`${buttonBase} bg-black text-white hover:bg-[#1d1d1f]`} style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif' }}>
          <AppleLogo />
          {t.social.apple}
        </a>
      )}
      {anyProvider && (
        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-muted-grey" aria-hidden="true">
          <span className="h-px flex-1 bg-current opacity-30" />
          {t.social.divider}
          <span className="h-px flex-1 bg-current opacity-30" />
        </div>
      )}
    </div>
  );
}
