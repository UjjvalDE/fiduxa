'use client';

// "Meine Gutscheine": GET /gift-cards/mine – status, value, balance, code
// (once paid), recipient and delivery. Open payments can be retried.
import { useState } from 'react';
import Link from 'next/link';
import { Gift, LoaderCircle, Lock } from 'lucide-react';

import { api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import type { CustomerGiftCard, GiftCardStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useApi, useErrorText } from '@/app/admin/_components/use-api';
import { formatBerlinDate } from '../../_shared/promotions';
import { ErrorBox } from '../../buchung/_components/form-field';
import giftMessages from '../../gutscheine/_messages';
import { GiftCardVisual } from '../../gutscheine/_components/gift-card-visual';

const STATUS_TONE: Record<GiftCardStatus, string> = {
  pending_payment: 'border-amber-200 bg-amber-50 text-amber-900',
  active: 'border-sage bg-mint text-pine-dark',
  redeemed: 'border-border bg-cream text-muted-grey',
  expired: 'border-border bg-cream text-muted-grey',
  disabled: 'border-red-200 bg-red-50 text-red-800',
  cancelled: 'border-border bg-cream text-muted-grey',
};

function GiftCardItem({ card }: { card: CustomerGiftCard }) {
  const t = useMessages(giftMessages);
  const ta = t.account;
  const f = useFormat();
  const { locale } = useLocale();
  const errorText = useErrorText();
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const pay = async () => {
    setPaying(true);
    setPayError(null);
    try {
      const res = await api.post<{ checkoutUrl: string }>(`/gift-cards/${encodeURIComponent(card.id)}/pay`, {});
      window.location.assign(res.checkoutUrl);
    } catch (error) {
      setPaying(false);
      setPayError(errorText(error));
    }
  };

  const delivery =
    card.deliveryStatus === 'sent' && card.deliveredAt
      ? ta.deliverySent(formatBerlinDate(card.deliveredAt, locale))
      : card.deliveryStatus === 'failed'
        ? ta.deliveryFailed
        : card.deliverAt
          ? ta.deliveryScheduled(formatBerlinDate(card.deliverAt, locale))
          : ta.deliveryAfterPayment;

  return (
    <li className="grid gap-5 rounded-2xl border border-border bg-white p-5 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-6">
      <GiftCardVisual design={card.design} amountCents={card.amountCents} code={card.code} size="sm" />
      <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-bold', STATUS_TONE[card.status])}>{t.status[card.status]}</span>
          <span className="text-xs text-muted-grey">{ta.purchased(formatBerlinDate(card.createdAt, locale))}</span>
        </div>
        <dl className="m-0 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-grey">{ta.amount}</dt>
            <dd className="m-0 font-bold tabular-nums text-pine-dark">{f.euro(card.amountCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-grey">{ta.balance}</dt>
            <dd className="m-0 font-bold tabular-nums text-pine-dark">{f.euro(card.balanceCents)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-grey">{ta.recipient}</dt>
            <dd className="m-0 break-words text-charcoal">
              {card.recipientName} <span className="text-muted-grey">({card.recipientEmail})</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-grey">{ta.delivery}</dt>
            <dd className="m-0 text-charcoal">{delivery}</dd>
          </div>
          {card.code && (
            <div>
              <dt className="text-xs text-muted-grey">{ta.code}</dt>
              <dd className="m-0 select-all font-mono font-bold tracking-wider text-pine-dark">{card.code}</dd>
            </div>
          )}
          {card.expiresAt && card.status !== 'pending_payment' && (
            <div>
              <dt className="text-xs text-muted-grey">{ta.validUntil}</dt>
              <dd className="m-0 text-charcoal">{formatBerlinDate(card.expiresAt, locale)}</dd>
            </div>
          )}
        </dl>
        {card.status === 'pending_payment' && (
          <div className="grid gap-2">
            <button type="button" onClick={pay} disabled={paying} className="button button-small min-h-[44px]">
              {paying ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />} {ta.payNow}
            </button>
            {payError && (
              <p className="m-0 text-xs font-semibold text-red-700" role="alert">
                {payError}
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function GiftCardsList() {
  const ta = useMessages(giftMessages).account;
  const { data, error, loading, reload } = useApi<{ giftCards: CustomerGiftCard[] }>('/gift-cards/mine');
  const cards = data?.giftCards ?? null;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="!m-0 !text-2xl !leading-tight sm:!text-3xl">{ta.title}</h1>
          <p className="mb-0 mt-1 text-sm text-muted-grey">{ta.lead}</p>
        </div>
        <Link href="/gutscheine" className="button button-small min-h-[44px]">
          <Gift className="h-4 w-4" aria-hidden="true" /> {ta.buy}
        </Link>
      </div>
      {loading && !cards ? (
        <p className="flex items-center gap-2 text-sm text-muted-grey" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {ta.loading}
        </p>
      ) : error && !cards ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : cards && cards.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border bg-white p-10 text-center">
          <Gift className="h-8 w-8 text-sage" aria-hidden="true" />
          <p className="m-0 text-sm text-muted-grey">{ta.empty}</p>
          <Link href="/gutscheine" className="button button-small min-h-[44px]">
            {ta.buy}
          </Link>
        </div>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0">
          {cards?.map((card) => <GiftCardItem key={card.id} card={card} />)}
        </ul>
      )}
    </div>
  );
}
