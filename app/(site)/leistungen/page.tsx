import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, MapPin } from 'lucide-react';

import { PageHero } from '@/componets/site/page-hero';
import { getLocale, getMessages } from '@/lib/i18n/server';
import { getServiceContent } from '../_shared/catalogue';
import { SERVICE_ICONS } from '../_shared/service-icons';
import { PricingFacts } from '../_shared/pricing-facts';
import { CtaBand } from '../_shared/cta-band';
import messages from './_messages';

export function generateMetadata(): Metadata {
  const t = getMessages(messages).overview;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default function LeistungenPage() {
  const t = getMessages(messages).overview;
  const services = getServiceContent(getLocale());

  return (
    <>
      <PageHero
        eyebrow={t.eyebrow}
        title={
          <>
            {t.titleBefore} <em className="font-serif font-normal text-pine">{t.titleEm}</em>
          </>
        }
        lead={t.lead}
      />

      <section className="section section-white">
        <div className="shell">
          <div className="service-grid">
            {services.map((service) => {
              const Icon = SERVICE_ICONS[service.id];
              return (
                <article className="service-card flex flex-col" key={service.id}>
                  <div className="service-icon">
                    <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <span className="card-eyebrow">{service.eyebrow}</span>
                  <h2 className="!m-0 !mt-2.5 !mb-3 !text-[23px] !leading-tight">{service.name}</h2>
                  <p>{service.teaser}</p>
                  <ul>
                    {service.highlights.map((item) => (
                      <li key={item}>
                        <Check size={14} aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/leistungen/${service.slug}`} className="card-link mt-auto">
                    {t.details}
                    <span className="sr-only">{t.detailsAbout(service.name)}</span> <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section price-section">
        <div className="shell grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <div className="eyebrow">{t.priceEyebrow}</div>
            <h2>
              {t.priceTitleBefore} <em>{t.priceTitleEm}</em>
            </h2>
            <p className="section-lead">{t.priceLead}</p>
            <Link href="/preise" className="text-link">
              {t.priceLink} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid content-start gap-6">
            <PricingFacts />
            <p className="flex items-start gap-3 text-sm leading-relaxed text-muted-grey">
              <MapPin size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-pine" aria-hidden="true" />
              {t.areaNote}
            </p>
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
        secondary={{ href: '/fuer-unternehmen', label: t.ctaSecondary }}
      />
    </>
  );
}
