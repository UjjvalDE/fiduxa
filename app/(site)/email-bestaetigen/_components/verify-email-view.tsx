'use client';

// POST /auth/verify-email { token } exactly once, then show the result. On
// success the session user is refreshed (emailVerified → welcome offer applies).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CircleAlert, LoaderCircle, MailCheck, PartyPopper } from 'lucide-react';

import { api, getStoredToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale, useMessages } from '@/lib/i18n/client';
import type { User } from '@/lib/types';
import { formatPct } from '../../_shared/promotions';
import messages from '../_messages';

type View = { kind: 'confirming' } | { kind: 'success'; welcomePercent: number | null } | { kind: 'error' } | { kind: 'missing' };

export function VerifyEmailView() {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const { user, status, refresh } = useAuth();
  const token = useSearchParams()?.get('token') ?? '';
  const valid = token.length >= 10 && token.length <= 200;
  const [view, setView] = useState<View>(valid ? { kind: 'confirming' } : { kind: 'missing' });
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'already'>('idle');
  // Strict mode runs effects twice in development – the token is single use
  const started = useRef(false);

  useEffect(() => {
    if (!valid || started.current) return;
    started.current = true;
    api
      .post<{ welcomePercent: number | null; user: User }>('/auth/verify-email', { token })
      .then(async (res) => {
        setView({ kind: 'success', welcomePercent: res.welcomePercent ?? null });
        if (getStoredToken()) await refresh();
      })
      .catch(() => setView({ kind: 'error' }));
  }, [valid, token, refresh]);

  const onResend = async () => {
    setResend('sending');
    try {
      const res = await api.post<{ success: boolean; alreadyVerified?: boolean }>('/auth/resend-verification');
      if (res.alreadyVerified) {
        setResend('already');
        await refresh();
      } else setResend(res.success ? 'sent' : 'failed');
    } catch {
      setResend('failed');
    }
  };

  const loggedIn = status === 'authenticated' && user;

  return (
    <section className="bg-cream py-12 sm:py-16">
      <div className="shell">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-white p-6 text-center shadow-[0_12px_25px_rgba(36,49,43,0.05)] sm:p-10" aria-live="polite">
          {view.kind === 'confirming' && (
            <div role="status">
              <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-pine" aria-hidden="true" />
              <h1 className="!mx-auto !mb-0 !mt-4 !text-2xl !leading-tight">{t.confirming}</h1>
            </div>
          )}

          {view.kind === 'success' && (
            <>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint text-pine">
                {view.welcomePercent ? <PartyPopper className="h-7 w-7" aria-hidden="true" /> : <MailCheck className="h-7 w-7" aria-hidden="true" />}
              </span>
              <h1 className="!mx-auto !mb-0 !mt-4 !text-2xl !leading-tight sm:!text-3xl">
                {view.welcomePercent ? t.successWelcome(formatPct(view.welcomePercent, locale)) : t.successTitle}
              </h1>
              <p className="mx-auto mb-0 mt-3 max-w-md text-[15px] leading-relaxed text-muted-grey">
                {view.welcomePercent ? t.successWelcomeText : t.successText}
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link href="/buchung" className="button">
                  {t.bookNow} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                {loggedIn && user.role === 'consumer' && (
                  <Link href="/konto" className="button button-quiet">
                    {t.toAccount}
                  </Link>
                )}
              </div>
            </>
          )}

          {(view.kind === 'error' || view.kind === 'missing') && (
            <>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-amber-700">
                <CircleAlert className="h-7 w-7" aria-hidden="true" />
              </span>
              <h1 className="!mx-auto !mb-0 !mt-4 !text-2xl !leading-tight">{t.errorTitle}</h1>
              <p className="mx-auto mb-0 mt-3 max-w-md text-[15px] leading-relaxed text-muted-grey" role="alert">
                {view.kind === 'missing' ? t.missing : t.errorText}
              </p>
              <div className="mt-7 grid justify-items-center gap-3">
                {loggedIn && user.emailVerified ? (
                  <>
                    <p className="m-0 text-sm font-semibold text-pine">{t.alreadyVerified}</p>
                    <Link href="/buchung" className="button">
                      {t.bookNow} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </>
                ) : loggedIn ? (
                  <>
                    <button type="button" onClick={onResend} disabled={resend === 'sending' || resend === 'sent'} className="button">
                      {resend === 'sending' && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {resend === 'sending' ? t.resending : t.resend}
                    </button>
                    <p className="m-0 text-sm font-semibold text-pine-dark" role="status">
                      {resend === 'sent' ? t.resent : resend === 'failed' ? t.resendFailed : resend === 'already' ? t.alreadyVerified : ''}
                    </p>
                  </>
                ) : status === 'anonymous' ? (
                  <>
                    <p className="m-0 text-sm text-muted-grey">{t.loginForResend}</p>
                    <Link href={`/login?next=${encodeURIComponent('/konto')}`} className="button">
                      {t.login}
                    </Link>
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
