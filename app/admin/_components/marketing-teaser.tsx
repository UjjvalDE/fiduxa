'use client';

import Link from 'next/link';
import { ArrowRight, BarChart3, Gift, Tag, type LucideIcon } from 'lucide-react';

import { Skeleton } from '@/componets/ui/skeleton';
import { defineMessages } from '@/lib/i18n/config';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { AdminPromotion, AnalyticsResponse } from '@/lib/types';

import { monthStart } from './promo-utils';
import { berlinToday, useApi } from './use-api';

const messages = defineMessages({
  de: {
    title: 'Aktionen & Gutscheine',
    live: 'Laufende Aktionen',
    liveHint: (n: number) => `${n} Einlösungen diesen Monat`,
    giftSold: 'Gutscheinverkauf (Monat)',
    giftSoldHint: (n: number) => `${n} verkauft`,
    discount: 'Aktionsrabatte (Monat)',
    discountHint: 'Zur Auswertung',
  },
  en: {
    title: 'Promotions & gift cards',
    live: 'Live promotions',
    liveHint: (n: number) => `${n} redemptions this month`,
    giftSold: 'Gift card sales (month)',
    giftSoldHint: (n: number) => `${n} sold`,
    discount: 'Promotion discounts (month)',
    discountHint: 'Open analytics',
  },
  pl: {
    title: 'Promocje i karty podarunkowe',
    live: 'Trwające promocje',
    liveHint: (n: number) => `${n} realizacji w tym miesiącu`,
    giftSold: 'Sprzedaż kart (miesiąc)',
    giftSoldHint: (n: number) => `${n} sprzedano`,
    discount: 'Rabaty promocyjne (miesiąc)',
    discountHint: 'Do analiz',
  },
});

function Tile({ href, icon: Icon, label, value, hint }: { href: string; icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-grey">{label}</span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-mint text-pine">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight text-pine-dark">{value}</span>
        <ArrowRight className="h-4 w-4 text-sage transition group-hover:translate-x-0.5 group-hover:text-pine" aria-hidden="true" />
      </div>
      {hint && <span className="-mt-2 text-xs text-muted-grey">{hint}</span>}
    </Link>
  );
}

/** Small dashboard teaser for promotions, gift cards and analytics */
export function MarketingTeaser() {
  const t = useMessages(messages);
  const f = useFormat();
  const today = berlinToday();
  const from = monthStart(today);
  const live = useApi<{ promotions: AdminPromotion[] }>('/admin/promotions?state=live');
  const analytics = useApi<AnalyticsResponse>(`/admin/analytics?from=${from}&to=${today}`);

  // Optional widget: stay silent on errors
  if (live.error && analytics.error) return null;

  return (
    <section aria-labelledby="marketing-teaser" className="mb-8">
      <h2 id="marketing-teaser" className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-grey">
        {t.title}
      </h2>
      {!live.data && !analytics.data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Tile
            href="/admin/aktionen?state=live"
            icon={Tag}
            label={t.live}
            value={live.data ? f.number(live.data.promotions.length) : '–'}
            hint={analytics.data ? t.liveHint(analytics.data.promotions.redemptions) : undefined}
          />
          <Tile
            href="/admin/gutscheine"
            icon={Gift}
            label={t.giftSold}
            value={analytics.data ? f.euro(analytics.data.giftCards.soldCents) : '–'}
            hint={analytics.data ? t.giftSoldHint(analytics.data.giftCards.soldCount) : undefined}
          />
          <Tile
            href={`/admin/auswertungen?from=${from}&to=${today}`}
            icon={BarChart3}
            label={t.discount}
            value={analytics.data ? f.euro(analytics.data.promotions.discountCents) : '–'}
            hint={t.discountHint}
          />
        </div>
      )}
    </section>
  );
}
