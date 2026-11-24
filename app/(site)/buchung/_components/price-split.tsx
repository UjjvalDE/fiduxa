'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { useFormat, useMessages } from '@/lib/i18n/client';
import type { HomeTrust, Quote } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useApi } from '@/app/admin/_components/use-api';
import pricingMessages from '../../_shared/pricing-messages';

/** Collapsible "Where does your money go?" under the price box */
export function PriceSplit({ quote }: { quote: Quote }) {
  const t = useMessages(pricingMessages).split;
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const trust = useApi<HomeTrust>(open ? '/home/trust' : null);
  const share = trust.data?.cleanerShare ?? null;
  const total = quote.lines.totalCents;
  const vat = quote.lines.vatCents;
  const range = (min: number, max: number) => (min === max ? f.euro(min) : `${f.euro(min)} – ${f.euro(max)}`);

  return (
    <div className="mt-4 rounded-[12px] border border-border" data-testid="price-split">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-bold text-pine-dark"
      >
        {t.title}
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && share && (
        <dl className="m-0 grid gap-2 border-t border-border px-4 py-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-charcoal">{t.cleaner}</dt>
            <dd className="m-0 font-semibold tabular-nums text-pine-dark">
              {share.minPct}–{share.maxPct} % ({range(Math.round((total * share.minPct) / 100), Math.round((total * share.maxPct) / 100))})
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-charcoal">{t.vat}</dt>
            <dd className="m-0 font-semibold tabular-nums text-pine-dark">{f.euro(vat)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-charcoal">{t.fiduxa}</dt>
            <dd className="m-0 font-semibold tabular-nums text-pine-dark">
              {range(
                Math.max(0, total - Math.round((total * share.maxPct) / 100) - vat),
                Math.max(0, total - Math.round((total * share.minPct) / 100) - vat)
              )}
            </dd>
          </div>
          <p className="m-0 text-xs text-muted-grey">{t.note}</p>
        </dl>
      )}
    </div>
  );
}
