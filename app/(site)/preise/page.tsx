import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Building2 } from 'lucide-react';

import { PageHero } from '@/componets/site/page-hero';
import { getLocale, getMessages } from '@/lib/i18n/server';
import common from '@/lib/i18n/messages/common';
import { getExtrasContent } from '../_shared/catalogue';
import { DurationSteps, HourlyPriceTable, PaymentFacts, PricingOverview, WorkedExample } from './_components/pricing-overview';
import { EstimateCalculator } from './_components/estimate-calculator';
import messages from './_messages';

export function generateMetadata(): Metadata {
  const t = getMessages(messages).page;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default function PreisePage() {
  const t = getMessages(messages).page;
  const tt = getMessages(messages).table;
  const c = getMessages(common);
  const extras = getExtrasContent(getLocale());

  return (
    <>
      <PageHero
        eyebrow={t.eyebrow}
        title={
          <>
            {t.titleBefore} <em>{t.titleEm}</em>
          </>
        }
        lead={t.lead}
      >
        <div className="flex flex-wrap gap-3">
          <Link href="/buchung" className="button">
            {tt.cta} <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link href="#rechner" className="button button-quiet">
            {t.toCalculator}
          </Link>
        </div>
      </PageHero>

      <section id="stunden" className="section section-white scroll-mt-28" aria-labelledby="stunden-heading">
        <div className="shell">
          <div className="section-heading">
            <div className="eyebrow">{tt.eyebrow}</div>
            <h2 id="stunden-heading">
              {tt.titleBefore} <em>{tt.titleEm}</em>
            </h2>
          </div>
          <HourlyPriceTable />
        </div>
      </section>

      <section className="section extras-section" aria-labelledby="basis-heading">
        <div className="shell">
          <div className="section-heading">
            <div className="eyebrow">{t.basisEyebrow}</div>
            <h2 id="basis-heading">
              {t.basisTitleBefore} <em>{t.basisTitleEm}</em>
            </h2>
          </div>
          <PricingOverview />
        </div>
      </section>

      <section id="bezahlen" className="section process-section scroll-mt-28" aria-labelledby="bezahlen-heading">
        <div className="shell">
          <div className="section-heading">
            <div className="eyebrow">{t.payEyebrow}</div>
            <h2 id="bezahlen-heading">
              {t.payTitleBefore} <em>{t.payTitleEm}</em>
            </h2>
          </div>
          <PaymentFacts />
        </div>
      </section>

      <section className="section price-section" aria-labelledby="dauer-heading">
        <div className="shell grid items-start gap-12 lg:grid-cols-[.95fr_1.05fr] lg:gap-20">
          <div>
            <div className="eyebrow">{t.durationEyebrow}</div>
            <h2 id="dauer-heading">
              {t.durationTitleBefore} <em>{t.durationTitleEm}</em>
            </h2>
            <DurationSteps />
          </div>
          <WorkedExample />
        </div>
      </section>

      <section id="extras" className="section section-white scroll-mt-28" aria-labelledby="extras-heading">
        <div className="shell">
          <div className="section-heading split-heading">
            <div>
              <div className="eyebrow">{t.extrasEyebrow}</div>
              <h2 id="extras-heading">
                {t.extrasTitleBefore} <em>{t.extrasTitleEm}</em>
              </h2>
            </div>
            <p>{t.extrasLead}</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <caption className="sr-only">{t.extrasCaption}</caption>
              <thead className="bg-cream text-xs uppercase tracking-wider text-muted-grey">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">
                    {t.extrasColExtra}
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    {t.extrasColNote}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">
                    {t.extrasColTime}
                  </th>
                </tr>
              </thead>
              <tbody>
                {extras.map((extra) => (
                  <tr key={extra.id} className="border-t border-border">
                    <th scope="row" className="px-4 py-3 font-bold text-pine-dark">
                      {extra.label}
                    </th>
                    <td className="px-4 py-3 text-muted-grey">{extra.description}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">+ {c.units.minutesShort(extra.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="rechner" className="section extras-section scroll-mt-28" aria-labelledby="rechner-heading">
        <div className="shell">
          <div className="section-heading">
            <div className="eyebrow">{t.calcEyebrow}</div>
            <h2 id="rechner-heading">
              {t.calcTitleBefore} <em>{t.calcTitleEm}</em>
            </h2>
            <p className="section-lead !mb-0">{t.calcLead}</p>
          </div>
          <EstimateCalculator />
        </div>
      </section>

      <section className="section section-white">
        <div className="shell flex flex-col items-start gap-6 rounded-2xl border border-border bg-cream p-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="service-icon !mb-0 shrink-0">
              <Building2 size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <h2 className="!m-0 !text-2xl">{t.businessTitle}</h2>
              <p className="mb-0 mt-2 max-w-xl text-sm leading-relaxed text-muted-grey">{t.businessText}</p>
            </div>
          </div>
          <Link href="/fuer-unternehmen" className="button shrink-0">
            {t.businessCta} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
