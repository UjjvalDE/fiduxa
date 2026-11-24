import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

import { PageHero } from '@/componets/site/page-hero';
import { getFormat, getLocale, getMessages } from '@/lib/i18n/server';
import type { PublicPricing } from '@/lib/types';
import { fetchHomeTrust, visibleRating } from '../../../_home/trust';
import { getServiceContent } from '../../_shared/catalogue';
import { serverApiGet } from '../../_shared/server-api';
import { DISTRICTS, findDistrict } from '../_districts';
import messages from '../_messages';

export const dynamicParams = false;

export function generateStaticParams() {
  return DISTRICTS.map((d) => ({ bezirk: d.slug }));
}

export function generateMetadata({ params }: { params: { bezirk: string } }): Metadata {
  const district = findDistrict(params.bezirk);
  if (!district) return {};
  const t = getMessages(messages);
  return { title: t.metaTitle(district.name), description: t.metaDescription(district.name), alternates: { canonical: `/reinigung/${district.slug}` } };
}

export default async function DistrictPage({ params }: { params: { bezirk: string } }) {
  const district = findDistrict(params.bezirk);
  if (!district) notFound();
  const locale = getLocale();
  const t = getMessages(messages);
  const f = getFormat();
  const [trust, pricing] = await Promise.all([fetchHomeTrust(), serverApiGet<{ pricing: PublicPricing } | PublicPricing>('/pricing', { revalidate: 300 })]);
  const rate = pricing ? ('pricing' in pricing ? pricing.pricing : pricing).hourlyRateCents : null;
  const rating = visibleRating(trust);
  const services = getServiceContent(locale).filter((s) => !s.business);
  const intro = locale === 'de' ? district.intro : t.genericIntro(district.name);
  const title = t.title(district.name);

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Fiduxa',
      description: intro,
      areaServed: { '@type': 'Place', name: `${district.name}, Berlin` },
      address: { '@type': 'PostalAddress', addressLocality: 'Berlin', addressCountry: 'DE' },
      ...(rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating.average, reviewCount: rating.count } } : {}),
    },
    ...services.map((s) => ({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: s.name,
      description: s.teaser,
      areaServed: `${district.name}, Berlin`,
      provider: { '@type': 'LocalBusiness', name: 'Fiduxa' },
      ...(rate ? { offers: { '@type': 'Offer', priceCurrency: 'EUR', price: (rate / 100).toFixed(2), unitText: 'HUR' } } : {}),
    })),
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: t.faq.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PageHero eyebrow={t.eyebrow} title={title} lead={intro}>
        <div className="flex flex-wrap items-center gap-4">
          <Link href={`/buchung?plz=${district.plz}`} className="button">
            {t.cta} <ArrowRight size={17} aria-hidden="true" />
          </Link>
          {rating && <p className="m-0 text-sm font-semibold">{t.rating(f.number(rating.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), f.number(rating.count))}</p>}
        </div>
      </PageHero>

      <section className="section section-white" aria-labelledby="bezirk-services">
        <div className="shell">
          <h2 id="bezirk-services">{t.servicesTitle}</h2>
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
            {services.map((s) => (
              <li key={s.id} className="rounded-2xl border border-border bg-white p-5">
                <h3 className="m-0 text-lg font-bold text-pine-dark">{s.name}</h3>
                <p className="mb-0 mt-2 text-sm text-muted-grey">{s.teaser}</p>
                {rate != null && <p className="mb-0 mt-3 text-sm font-bold text-pine-dark">{t.perHour(f.euro(rate))}</p>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="bezirk-faq">
        <div className="shell">
          <h2 id="bezirk-faq">{t.faqTitle}</h2>
          <dl className="m-0 grid gap-4">
            {t.faq.map((item) => (
              <div key={item.q}>
                <dt className="font-bold text-pine-dark">{item.q}</dt>
                <dd className="m-0 mt-1 text-muted-grey">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
