import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Building2, CalendarClock, Check, ClipboardCheck, FileText, KeyRound, X } from 'lucide-react';

import { PageHero } from '@/componets/site/page-hero';
import { getLocale, getMessages } from '@/lib/i18n/server';
import { findServiceContent } from '../_shared/catalogue';
import { BusinessRequestForm } from './_components/business-request-form';
import messages from './_messages';

export function generateMetadata(): Metadata {
  const t = getMessages(messages).page;
  return { title: t.metaTitle, description: t.metaDescription };
}

const BENEFIT_ICONS = [ClipboardCheck, CalendarClock, KeyRound, FileText];

export default function FuerUnternehmenPage() {
  const t = getMessages(messages).page;
  const business = findServiceContent('buero-reinigung', getLocale())!;
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
        <Link href="#anfrage" className="button">
          {t.cta} <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </PageHero>

      <section className="section section-white" aria-labelledby="vorteile-heading">
        <div className="shell">
          <div className="section-heading">
            <div className="eyebrow">{t.benefitsEyebrow}</div>
            <h2 id="vorteile-heading">
              {t.benefitsTitleBefore} <em>{t.benefitsTitleEm}</em>
            </h2>
          </div>
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {t.benefits.map(([title, text], index) => {
              const Icon = BENEFIT_ICONS[index] ?? ClipboardCheck;
              return (
              <li key={title} className="rounded-2xl border border-border bg-cream p-6">
                <span className="service-icon !mb-5">
                  <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <h3 className="!m-0 text-lg font-bold text-pine-dark">{title}</h3>
                <p className="mb-0 mt-2 text-sm leading-relaxed text-muted-grey">{text}</p>
              </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="section price-section" aria-labelledby="umfang-heading">
        <div className="shell grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <div className="eyebrow">{t.scopeEyebrow}</div>
            <h2 id="umfang-heading">
              {t.scopeTitleBefore} <em>{t.scopeTitleEm}</em>
            </h2>
            <p className="section-lead">
              {t.scopeLead}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-6 sm:p-8">
            <h3 className="!m-0 text-lg font-bold text-pine-dark">{t.included}</h3>
            <ul className="mt-4 grid gap-3 p-0">
              {business.included.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-relaxed">
                  <Check size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-pine" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <h3 className="!mb-0 !mt-7 text-lg font-bold text-pine-dark">{t.separate}</h3>
            <ul className="mt-4 grid gap-3 p-0">
              {business.excluded.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-muted-grey">
                  <X size={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
              <li className="flex items-start gap-3 text-sm leading-relaxed text-muted-grey">
                <X size={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
                {t.excludedExtra}
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section id="anfrage" className="section extras-section scroll-mt-24" aria-labelledby="anfrage-heading">
        <div className="shell grid gap-12 lg:grid-cols-[.7fr_1.3fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="eyebrow">{t.requestEyebrow}</div>
            <h2 id="anfrage-heading">
              {t.requestTitleBefore} <em>{t.requestTitleEm}</em>
            </h2>
            <p className="section-lead">
              {t.requestLead}
            </p>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-white p-4 text-sm leading-relaxed text-muted-grey">
              <Building2 size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-pine" aria-hidden="true" />
              <span>
                {t.privateBefore}{' '}
                <Link href="/buchung" className="font-bold text-pine underline underline-offset-2">
                  {t.privateLink}
                </Link>
              </span>
            </div>
          </div>
          <BusinessRequestForm />
        </div>
      </section>
    </>
  );
}
