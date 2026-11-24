'use client';

import Link from 'next/link';

import { useFormat, useMessages } from '@/lib/i18n/client';
import siteMessages from './messages';
import { usePricing } from './use-pricing';

/** Compact pricing basis (hourly rate + minimum) loaded from GET /pricing. */
export function PricingFacts({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { pricing, loading } = usePricing();
  const t = useMessages(siteMessages).pricing;
  const f = useFormat();
  const muted = tone === 'dark' ? 'text-white/65' : 'text-muted-grey';
  const strong = tone === 'dark' ? 'text-lime' : 'text-pine-dark';

  if (loading) {
    return (
      <div aria-busy="true" className="grid gap-3 sm:grid-cols-2">
        <span className="sr-only">{t.loading}</span>
        {[0, 1].map((i) => (
          <div key={i} className={`h-[74px] animate-pulse rounded-xl ${tone === 'dark' ? 'bg-white/10' : 'bg-mint'}`} aria-hidden="true" />
        ))}
      </div>
    );
  }

  if (!pricing) {
    return (
      <p className={`text-sm ${muted}`}>
        {t.unavailableBefore}{' '}
        <Link href="/preise" className="font-bold underline underline-offset-2">
          {t.unavailableLink}
        </Link>
        .
      </p>
    );
  }

  return (
    <div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className={`rounded-xl border p-4 ${tone === 'dark' ? 'border-white/15' : 'border-border bg-white'}`}>
          <dt className={`text-xs font-bold uppercase tracking-wider ${muted}`}>{t.hourlyRate}</dt>
          <dd className={`mt-1 text-2xl font-extrabold tracking-tight ${strong}`}>{f.euro(pricing.hourlyRateCents)}</dd>
        </div>
        <div className={`rounded-xl border p-4 ${tone === 'dark' ? 'border-white/15' : 'border-border bg-white'}`}>
          <dt className={`text-xs font-bold uppercase tracking-wider ${muted}`}>{t.minimumBooking}</dt>
          <dd className={`mt-1 text-2xl font-extrabold tracking-tight ${strong}`}>
            {f.hours(pricing.minimumMinutes)} <span className="text-base font-semibold">· {f.euro(pricing.minimumChargeCents)}</span>
          </dd>
        </div>
      </dl>
      {pricing.pricesIncludeVat && <p className={`mt-3 text-xs ${muted}`}>{t.inclVat}</p>}
    </div>
  );
}
