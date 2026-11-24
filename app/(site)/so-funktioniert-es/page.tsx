import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { PageHero } from '@/componets/site/page-hero';
import { getMessages } from '@/lib/i18n/server';
import { CtaBand } from '../_shared/cta-band';
import { AfterBooking, CancelBox, HowItWorksSteps } from './_components/how-it-works';
import messages from './_messages';

export function generateMetadata(): Metadata {
  const t = getMessages(messages);
  return { title: t.metaTitle, description: t.metaDescription };
}

export default function SoFunktioniertEsPage() {
  const t = getMessages(messages);
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
      />

      <section className="section section-white" aria-labelledby="ablauf-heading">
        <div className="shell">
          <h2 id="ablauf-heading" className="sr-only">
            {t.stepsHeading}
          </h2>
          <HowItWorksSteps />
        </div>
      </section>

      <section className="section process-section" aria-labelledby="danach-heading">
        <div className="shell grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <div className="eyebrow">{t.afterEyebrow}</div>
            <h2 id="danach-heading">
              {t.afterTitleBefore} <em>{t.afterTitleEm}</em>
            </h2>
            <p className="section-lead">{t.afterLead}</p>
          </div>
          <AfterBooking />
        </div>
      </section>

      <section className="section section-white">
        <div className="shell grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-cream p-6">
            <h2 className="!m-0 !text-2xl">{t.cancelTitle}</h2>
            <CancelBox />
          </div>
          <div className="rounded-2xl border border-border bg-cream p-6">
            <h2 className="!m-0 !text-2xl">{t.businessTitle}</h2>
            <p className="mb-0 mt-3 text-sm leading-relaxed text-muted-grey">{t.businessText}</p>
            <Link href="/fuer-unternehmen" className="text-link mt-4">
              {t.businessLink} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <CtaBand
        eyebrow={t.ctaEyebrow}
        title={
          <>
            {t.ctaTitleBefore} <em>{t.ctaTitleEm}</em>
          </>
        }
        text={t.ctaText}
        href="/buchung"
        label={t.ctaLabel}
        secondary={{ href: '/preise', label: t.ctaSecondary }}
      />
    </>
  );
}
