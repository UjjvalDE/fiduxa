import type { Metadata } from 'next';
import { Banknote, Eye, HeartHandshake, MapPin, ShieldCheck } from 'lucide-react';

import { PageHero } from '@/componets/site/page-hero';
import { getMessages } from '@/lib/i18n/server';
import { CtaBand } from '../_shared/cta-band';
import messages from './_messages';

const VALUE_ICONS = [ShieldCheck, HeartHandshake, Eye, MapPin, Banknote];

export function generateMetadata(): Metadata {
  const t = getMessages(messages);
  return { title: t.metaTitle, description: t.metaDescription };
}

export default function UeberUnsPage() {
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

      <section className="section section-white">
        <div className="shell grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <div className="eyebrow">{t.ideaEyebrow}</div>
            <h2 lang="en">
              {t.ideaTitleBefore} <em>{t.ideaTitleEm}</em>
            </h2>
          </div>
          <div className="grid gap-5 text-[15px] leading-relaxed text-muted-grey">
            {t.ideaParagraphs.map((paragraph) => (
              <p key={paragraph} className="m-0">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="section process-section" aria-labelledby="werte-heading">
        <div className="shell">
          <div className="section-heading centered">
            <div className="eyebrow">{t.valuesEyebrow}</div>
            <h2 id="werte-heading">
              {t.valuesTitleBefore} <em>{t.valuesTitleEm}</em>
            </h2>
          </div>
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-5">
            {t.values.map(([title, text], index) => {
              const Icon = VALUE_ICONS[index] ?? ShieldCheck;
              return (
                <li key={title} className="rounded-2xl border border-sage/60 bg-white p-6">
                  <span className="service-icon !mb-5 !bg-mint">
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

      <CtaBand
        eyebrow={t.ctaEyebrow}
        title={
          <>
            {t.ctaTitleBefore} <em>{t.ctaTitleEm}</em>
          </>
        }
        href="/buchung"
        label={t.ctaLabel}
        secondary={{ href: '/kontakt', label: t.ctaSecondary }}
      />
    </>
  );
}
