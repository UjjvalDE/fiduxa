import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Check, ChevronDown } from 'lucide-react';

import { PageHero } from '@/componets/site/page-hero';
import { getMessages } from '@/lib/i18n/server';
import messages from './_messages';
import { BalanceCheck } from './_components/balance-check';
import { GiftCardShop } from './_components/gift-card-shop';
import { fetchGiftCardConfig } from './_lib/config';

export function generateMetadata(): Metadata {
  const t = getMessages(messages);
  return {
    title: t.meta.title,
    description: t.meta.description,
    openGraph: { title: t.meta.title, description: t.meta.description, type: 'website' },
  };
}

export default async function GiftCardsPage() {
  const t = getMessages(messages);
  const config = await fetchGiftCardConfig();
  const faqs = t.faq.items(config?.validityYears ?? 3, config?.maxPerBooking ?? 3);

  return (
    <>
      <PageHero
        eyebrow={t.hero.eyebrow}
        title={
          <>
            {t.hero.titleBefore} <em>{t.hero.titleEm}</em>
          </>
        }
        lead={t.hero.lead}
      />
      <section className="bg-cream pb-16 pt-8 sm:pb-20">
        <div className="shell">
          <ul className="m-0 mb-8 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-sm font-semibold text-pine-dark">
            {t.hero.points.map((point) => (
              <li key={point} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-pine" aria-hidden="true" /> {point}
              </li>
            ))}
          </ul>
          <Suspense>
            <GiftCardShop />
          </Suspense>
        </div>
      </section>
      <section className="bg-white py-14 sm:py-20">
        <div className="shell grid items-start gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
          <BalanceCheck />
          <div>
            <h2 className="!m-0 !mb-6 !text-3xl !leading-tight sm:!text-4xl">{t.faq.title}</h2>
            <div className="grid gap-3">
              {faqs.map(([question, answer]) => (
                <details key={question} className="group rounded-[14px] border border-border bg-cream open:bg-white">
                  <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-4 rounded-[14px] px-5 py-3 text-[15px] font-bold text-pine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine [&::-webkit-details-marker]:hidden">
                    {question}
                    <ChevronDown className="h-5 w-5 shrink-0 text-pine transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="m-0 px-5 pb-5 text-sm leading-relaxed text-muted-grey">{answer}</p>
                </details>
              ))}
            </div>
            <script
              type="application/ld+json"
              // FAQ rich results – static, server-rendered texts only
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  '@context': 'https://schema.org',
                  '@type': 'FAQPage',
                  mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
                }).replace(/</g, '\\u003c'),
              }}
            />
          </div>
        </div>
      </section>
    </>
  );
}
