'use client';

// Small, dismissible hint for customers who have not confirmed their email
// address yet. The welcome percentage comes from GET /promotions/active.
import { useEffect, useState } from 'react';
import { LoaderCircle, MailWarning, X } from 'lucide-react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale, useMessages } from '@/lib/i18n/client';
import type { PromotionBanner } from '@/lib/types';
import { useApi } from '@/app/admin/_components/use-api';
import { formatDiscount } from '../../_shared/promotions';
import verifyMessages from '../../email-bestaetigen/_messages';
import pricingMessages from '../../_shared/pricing-messages';

const DISMISS_KEY = 'fiduxa_verify_banner_dismissed';

export function VerifyEmailBanner() {
  const { user, refresh } = useAuth();
  const t = useMessages(verifyMessages);
  const tw = useMessages(pricingMessages).welcome;
  const { locale } = useLocale();
  const [dismissed, setDismissed] = useState(true);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const unverified = user?.role === 'consumer' && user.emailVerified === false;
  const promos = useApi<{ promotions: PromotionBanner[] }>(unverified ? '/promotions/active' : null);
  const welcome = promos.data?.promotions.find((p) => p.kind === 'welcome');

  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!unverified || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const resend = async () => {
    setState('sending');
    try {
      const res = await api.post<{ success: boolean; alreadyVerified?: boolean }>('/auth/resend-verification');
      if (res.alreadyVerified) await refresh();
      setState(res.success ? 'sent' : 'failed');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950" role="region" aria-label={t.banner.title}>
      <MailWarning className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="grid min-w-0 flex-1 gap-2">
        <p className="m-0 text-sm font-bold">{t.banner.title}</p>
        <p className="m-0 text-sm leading-relaxed">
          {welcome ? t.banner.textWelcome(formatDiscount(welcome.discountType, welcome.discountValue, locale)) : t.banner.text}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={resend} disabled={state === 'sending' || state === 'sent'} className="button button-small min-h-[44px]">
            {state === 'sending' && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {state === 'sending' ? tw.resending : tw.resend}
          </button>
          <span className="text-xs font-semibold" role="status" aria-live="polite">
            {state === 'sent' ? tw.resent : state === 'failed' ? tw.resendFailed : ''}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-900"
        aria-label={t.banner.dismiss}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
