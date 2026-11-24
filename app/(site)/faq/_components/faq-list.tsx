'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/componets/ui/accordion';
import { useFormat, useMessages } from '@/lib/i18n/client';
import { usePricing } from '../../_shared/use-pricing';
import messages from '../_messages';

// Fallbacks mirror server/src/config/pricing.js until GET /pricing has loaded.
const FALLBACK = { cancellationCutoffHours: 24, holdMinutes: 35, maxBookingDaysAhead: 90, areaM2PerHour: 30, durationStepMinutes: 30, minimumMinutes: 120 };

export function FaqList() {
  const t = useMessages(messages);
  const f = useFormat();
  const { pricing } = usePricing();
  const [query, setQuery] = useState('');

  const entries = useMemo(
    () =>
      t.entries({
        cutoffHours: pricing?.cancellationCutoffHours ?? FALLBACK.cancellationCutoffHours,
        holdMinutes: pricing?.holdMinutes ?? FALLBACK.holdMinutes,
        daysAhead: pricing?.maxBookingDaysAhead ?? FALLBACK.maxBookingDaysAhead,
        areaPerHour: f.number(pricing?.areaM2PerHour ?? FALLBACK.areaM2PerHour),
        step: pricing?.durationStepMinutes ?? FALLBACK.durationStepMinutes,
        minimum: f.hours(pricing?.minimumMinutes ?? FALLBACK.minimumMinutes),
      }),
    [t, f, pricing]
  );

  const filtered = useMemo(() => {
    const normalise = (s: string) => s.toLocaleLowerCase(f.tag);
    const terms = normalise(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return entries;
    return entries.filter((entry) => {
      const haystack = normalise(`${entry.category} ${entry.question} ${entry.answer}`);
      return terms.every((term) => haystack.includes(term));
    });
  }, [entries, query, f]);

  return (
    <div>
      <div className="relative">
        <label htmlFor="faq-search" className="mb-2 block text-sm font-bold text-pine-dark">
          {t.search}
        </label>
        <Search size={18} strokeWidth={1.75} className="pointer-events-none absolute bottom-3.5 left-4 text-pine" aria-hidden="true" />
        <input
          id="faq-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="h-12 w-full rounded-xl border border-border bg-white pl-11 pr-12 text-sm text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-1"
          aria-describedby="faq-count"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-lg text-muted-grey hover:bg-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine"
            aria-label={t.clearSearch}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <p id="faq-count" className="mb-0 mt-3 text-xs text-muted-grey" aria-live="polite">
        {query ? t.found(filtered.length, entries.length) : t.total(entries.length)}
      </p>

      {filtered.length > 0 ? (
        <Accordion type="multiple" className="mt-6 border-t border-border">
          {filtered.map((entry) => (
            <AccordionItem key={entry.id} value={entry.id} className="border-border">
              <AccordionTrigger className="gap-6 py-5 text-left text-[15px] font-bold text-pine-dark hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 [&>svg]:text-pine">
                <span>
                  <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-grey">{entry.category}</span>
                  {entry.question}
                </span>
              </AccordionTrigger>
              <AccordionContent className="max-w-2xl pb-5 text-sm leading-relaxed text-muted-grey">{entry.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <div className="mt-6 rounded-2xl border border-border bg-white p-6 text-sm text-muted-grey">
          <p className="m-0">{t.noResults}</p>
          <Link href="/kontakt" className="text-link mt-3">
            {t.askDirectly}
          </Link>
        </div>
      )}
    </div>
  );
}

export type { FaqEntry } from '../_messages';
