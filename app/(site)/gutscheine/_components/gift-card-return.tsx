'use client';

// Return page after paying a gift card.
//   PayPal: POST /gift-cards/:id/paypal/capture { orderId } – exactly once
//   Stripe: poll GET /gift-cards/:id until the webhook activated the card
// 402 → retry (POST /gift-cards/:id/pay) · 409 → purchase expired (not charged)
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CircleAlert, CircleCheck, Copy, Gift, LoaderCircle, RefreshCw, TimerOff } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { useLocale, useMessages } from '@/lib/i18n/client';
import type { CustomerGiftCard } from '@/lib/types';
import { useErrorText } from '@/app/admin/_components/use-api';
import { formatBerlinDate } from '../../_shared/promotions';
import messages from '../_messages';
import { GiftCardVisual } from './gift-card-visual';

const OBJECT_ID = /^[a-f\d]{24}$/i;
const ORDER_ID = /^[A-Z0-9-]{5,64}$/i;
const POLL_MS = 2000;
const POLL_MAX = 30; // ≈ 1 minute

type View =
  | { kind: 'confirming' }
  | { kind: 'waiting'; slow: boolean }
  | { kind: 'success'; card: CustomerGiftCard }
  | { kind: 'failed' | 'error'; error: unknown }
  | { kind: 'expired' }
  | { kind: 'missing' };

const isPaid = (card: CustomerGiftCard) => ['active', 'redeemed', 'expired'].includes(card.status);

export function GiftCardReturn() {
  const t = useMessages(messages).paid;
  const { locale } = useLocale();
  const errorText = useErrorText();
  const params = useSearchParams();
  const cardId = params?.get('card') ?? '';
  const provider = params?.get('provider') === 'paypal' ? 'paypal' : params?.get('provider') === 'stripe' ? 'stripe' : null;
  const orderId = params?.get('token') ?? '';
  const valid = OBJECT_ID.test(cardId) && (provider === 'stripe' || (provider === 'paypal' && ORDER_ID.test(orderId)));

  const [view, setView] = useState<View>(valid ? { kind: 'confirming' } : { kind: 'missing' });
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);
  // Strict mode runs effects twice in development – capture only once
  const started = useRef(false);
  // Polling stops when the page is left (survives the strict-mode remount)
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!valid || started.current) return;
    started.current = true;
    const path = `/gift-cards/${encodeURIComponent(cardId)}`;

    if (provider === 'paypal') {
      api
        .post<{ giftCard: CustomerGiftCard }>(`${path}/paypal/capture`, { orderId })
        .then((res) => setView({ kind: 'success', card: res.giftCard }))
        .catch((error: unknown) => {
          const status = error instanceof ApiError ? error.status : 0;
          const expired = status === 409 && !/verified/i.test(error instanceof Error ? error.message : '');
          setView(expired ? { kind: 'expired' } : { kind: status === 402 ? 'failed' : 'error', error });
        });
      return;
    }

    // Stripe: the webhook activates the card – poll until it is paid
    let attempts = 0;
    const poll = async () => {
      if (!mounted.current) return;
      attempts += 1;
      try {
        const { giftCard } = await api.get<{ giftCard: CustomerGiftCard }>(path);
        if (isPaid(giftCard)) {
          setView({ kind: 'success', card: giftCard });
          return;
        }
        if (giftCard.status === 'cancelled') {
          setView({ kind: 'expired' });
          return;
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setView({ kind: 'error', error });
          return;
        }
      }
      setView({ kind: 'waiting', slow: attempts >= POLL_MAX });
      if (attempts < POLL_MAX && mounted.current) window.setTimeout(poll, POLL_MS);
    };
    void poll();
    // Runs once per mount (guarded) – the URL does not change on this page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      const res = await api.post<{ checkoutUrl: string }>(`/gift-cards/${encodeURIComponent(cardId)}/pay`, provider ? { method: provider } : {});
      window.location.assign(res.checkoutUrl);
    } catch (error) {
      setRetrying(false);
      if (error instanceof ApiError && error.status === 409) setView({ kind: 'expired' });
      else setView({ kind: 'error', error });
    }
  }, [cardId, provider]);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable – the code is visible and selectable */
    }
  };

  return (
    <section className="bg-cream py-12 sm:py-16">
      <div className="shell">
        <div className="mx-auto max-w-2xl" aria-live="polite">
          {(view.kind === 'confirming' || view.kind === 'waiting') && (
            <div className="rounded-2xl border border-border bg-white p-6 text-center sm:p-10" role="status">
              <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-pine" aria-hidden="true" />
              <h1 className="!mx-auto !mb-0 !mt-4 !text-2xl !leading-tight">{t.confirming}</h1>
              <p className="mx-auto mb-0 mt-3 max-w-md text-sm leading-relaxed text-muted-grey">
                {view.kind === 'waiting' && view.slow ? t.stillWaiting : t.waiting}
              </p>
              {view.kind === 'waiting' && view.slow && (
                <Link href="/konto/gutscheine" className="button button-quiet mt-6">
                  {t.toAccount}
                </Link>
              )}
            </div>
          )}

          {view.kind === 'success' && (
            <div className="grid gap-6">
              <div className="rounded-2xl border border-border bg-white p-6 text-center sm:p-8">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint text-pine">
                  <CircleCheck className="h-7 w-7" aria-hidden="true" />
                </span>
                <h1 className="!mx-auto !mb-0 !mt-4 !text-2xl !leading-tight sm:!text-3xl">{t.successTitle}</h1>
                <p className="mx-auto mb-0 mt-3 max-w-md text-[15px] leading-relaxed text-muted-grey">
                  {view.card.deliverAt && view.card.deliveryStatus !== 'sent' && new Date(view.card.deliverAt) > new Date()
                    ? t.scheduled(view.card.recipientEmail, formatBerlinDate(view.card.deliverAt, locale, true))
                    : t.sentNow(view.card.recipientEmail)}
                </p>
              </div>
              <GiftCardVisual
                design={view.card.design}
                amountCents={view.card.amountCents}
                recipientName={view.card.recipientName}
                senderName={view.card.senderName}
                message={view.card.message}
                code={view.card.code}
                validUntil={view.card.expiresAt ? t.validUntil(formatBerlinDate(view.card.expiresAt, locale)) : null}
              />
              {view.card.code && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white p-5">
                  <div>
                    <p className="m-0 text-xs font-bold uppercase tracking-wider text-muted-grey">{t.code}</p>
                    <p className="m-0 select-all font-mono text-lg font-bold tracking-wider text-pine-dark">{view.card.code}</p>
                  </div>
                  <button type="button" onClick={() => copy(view.card.code!)} className="button button-quiet min-h-[44px]">
                    <Copy className="h-4 w-4" aria-hidden="true" /> {copied ? t.copied : t.copy}
                  </button>
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/konto/gutscheine" className="button">
                  <Gift className="h-4 w-4" aria-hidden="true" /> {t.toAccount}
                </Link>
                <Link href="/gutscheine" className="button button-quiet">
                  {t.another}
                </Link>
              </div>
            </div>
          )}

          {view.kind === 'failed' && (
            <div className="rounded-2xl border border-border bg-white p-6 text-center sm:p-10">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-amber-700">
                <CircleAlert className="h-7 w-7" aria-hidden="true" />
              </span>
              <h1 className="!mx-auto !mb-0 !mt-4 !text-2xl !leading-tight">{t.failedTitle}</h1>
              <p className="mx-auto mb-0 mt-3 max-w-md text-sm leading-relaxed text-red-700" role="alert">
                {errorText(view.error)}
              </p>
              <p className="mx-auto mb-0 mt-2 max-w-md text-sm leading-relaxed text-muted-grey">{t.failedText}</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <button type="button" onClick={retry} disabled={retrying} className="button">
                  {retrying ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />} {t.retry}
                </button>
                <Link href="/konto/gutscheine" className="button button-quiet">
                  {t.toAccount}
                </Link>
              </div>
            </div>
          )}

          {view.kind === 'expired' && (
            <div className="rounded-2xl border border-border bg-white p-6 text-center sm:p-10">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cream text-muted-grey">
                <TimerOff className="h-7 w-7" aria-hidden="true" />
              </span>
              <h1 className="!mx-auto !mb-0 !mt-4 !text-2xl !leading-tight">{t.expiredTitle}</h1>
              <p className="mx-auto mb-0 mt-3 max-w-md text-sm leading-relaxed text-muted-grey" role="alert">
                {t.expiredText}
              </p>
              <Link href="/gutscheine" className="button mt-7">
                <Gift className="h-4 w-4" aria-hidden="true" /> {t.another}
              </Link>
            </div>
          )}

          {(view.kind === 'error' || view.kind === 'missing') && (
            <div className="rounded-2xl border border-border bg-white p-6 text-center sm:p-10">
              <h1 className="!mx-auto !m-0 !text-2xl !leading-tight">{t.errorTitle}</h1>
              <p className="mx-auto mb-0 mt-3 max-w-md text-sm text-red-700" role="alert">
                {view.kind === 'missing' ? t.missing : errorText(view.error)}
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                {view.kind === 'error' && OBJECT_ID.test(cardId) && (
                  <button type="button" onClick={retry} disabled={retrying} className="button">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t.retry}
                  </button>
                )}
                <Link href="/konto/gutscheine" className="button button-quiet">
                  {t.toAccount}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
