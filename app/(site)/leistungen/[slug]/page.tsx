import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Clock3, MapPin, Plus, Users, X } from 'lucide-react';

import { PageHero } from '@/componets/site/page-hero';
import { getLocale, getMessages } from '@/lib/i18n/server';
import common from '@/lib/i18n/messages/common';
import { SERVICES, findServiceContent, getExtrasContent } from '../../_shared/catalogue';
import { PricingFacts } from '../../_shared/pricing-facts';
import { CtaBand } from '../../_shared/cta-band';
import messages from '../_messages';
import { DurationInfo } from './_components/duration-info';

export const dynamicParams = false;

export function generateStaticParams() {
  return SERVICES.map((service) => ({ slug: service.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const service = findServiceContent(params.slug, getLocale());
  if (!service) return { title: getMessages(messages).detail.notFound };
  return { title: service.name, description: service.teaser };
}

function SectionTitle({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <>
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="!mt-4 !text-3xl sm:!text-4xl">{children}</h2>
    </>
  );
}

export default function ServicePage({ params }: { params: { slug: string } }) {
  const locale = getLocale();
  const service = findServiceContent(params.slug, locale);
  if (!service) notFound();

  const t = getMessages(messages).detail;
  const c = getMessages(common);
  const extras = getExtrasContent(locale);

  const ctaHref = service.business ? '/fuer-unternehmen' : `/buchung?service=${service.id}`;
  const ctaLabel = service.business ? t.ctaBusiness : t.ctaHousehold;
  const isEndOfTenancy = service.id === 'end-of-tenancy';
  const isDeep = service.id === 'deep-cleaning';

  return (
    <>
      <PageHero eyebrow={service.eyebrow} title={service.name} lead={service.intro}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={ctaHref} className="button">
            {ctaLabel} <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link href="/leistungen" className="button button-quiet">
            <ArrowLeft size={17} aria-hidden="true" /> {t.allServices}
          </Link>
        </div>
      </PageHero>

      {/* Who it's for + included */}
      <section className="section section-white">
        <div className="shell grid gap-14 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
          <div>
            <SectionTitle eyebrow={t.forWhom}>
              {service.business ? (
                <>
                  {t.forWhomBusinessBefore} <em>{t.forWhomBusinessEm}</em>
                </>
              ) : (
                <>
                  {t.forWhomBefore} <em>{t.forWhomEm}</em>
                </>
              )}
            </SectionTitle>
            <ul className="mt-8 grid gap-4">
              {service.audience.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-charcoal">
                  <Users size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-pine" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            {!service.business && service.frequencies.length > 0 && (
              <p className="mt-8 text-sm text-muted-grey">
                <strong className="text-pine-dark">{t.bookable}</strong> {service.frequencies.map((freq) => c.frequencies[freq]).join(' · ')}
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-cream p-6 sm:p-8">
            <h2 className="!m-0 !text-2xl">{t.included}</h2>
            <ul className="mt-6 grid gap-3">
              {service.included.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-relaxed">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-mint text-pine">
                    <Check size={14} strokeWidth={2} aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <h3 className="!mb-0 !mt-8 text-lg font-bold text-pine-dark">{t.excluded}</h3>
            <ul className="mt-4 grid gap-3">
              {service.excluded.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-muted-grey">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white text-muted-grey">
                    <X size={14} strokeWidth={2} aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs leading-relaxed text-muted-grey">{service.business ? t.specialBusiness : t.specialHousehold}</p>
          </div>
        </div>
      </section>

      {/* Extras – household services only */}
      {!service.business && (
        <section className="section extras-section" aria-labelledby="extras-heading">
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
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {extras.map((extra) => (
                <li key={extra.id} className="flex items-start gap-3 rounded-xl border border-border bg-white p-4">
                  <span className="extra-check shrink-0">
                    <Plus size={15} aria-hidden="true" />
                  </span>
                  <span className="grid gap-1">
                    <strong className="text-sm text-pine-dark">{extra.label}</strong>
                    <span className="text-xs leading-relaxed text-muted-grey">{extra.description}</span>
                  </span>
                  <span className="ml-auto whitespace-nowrap rounded-full bg-mint px-2.5 py-1 text-xs font-bold text-pine">
                    + {c.units.minutesShort(extra.minutes)}
                  </span>
                </li>
              ))}
            </ul>
            {isEndOfTenancy && <p className="mt-6 text-sm text-muted-grey">{t.endOfTenancyExtras}</p>}
          </div>
        </section>
      )}

      {/* Duration + pricing */}
      <section className="section price-section">
        <div className="shell grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionTitle eyebrow={service.business ? t.scopeEyebrow : t.durationEyebrow}>
              {service.business ? (
                <>
                  {t.scopeTitleBefore} <em>{t.scopeTitleEm}</em>
                </>
              ) : (
                <>
                  {t.durationTitleBefore} <em>{t.durationTitleEm}</em>
                </>
              )}
            </SectionTitle>

            {service.business ? (
              <p className="section-lead">{t.scopeText}</p>
            ) : (
              <DurationInfo variant={isEndOfTenancy ? 'end-of-tenancy' : isDeep ? 'deep' : 'standard'} />
            )}
          </div>

          <div className="grid content-start gap-6">
            {!service.business && (
              <div>
                <h3 className="!mb-4 flex items-center gap-2 text-lg font-bold text-pine-dark">
                  <Clock3 size={18} strokeWidth={1.75} aria-hidden="true" /> {t.priceBasis}
                </h3>
                <PricingFacts />
                <p className="mt-4 text-sm leading-relaxed text-muted-grey">
                  {t.priceFormula}{' '}
                  <Link href="/preise#rechner" className="font-bold text-pine underline underline-offset-2">
                    {t.calculatorLink}
                  </Link>
                </p>
              </div>
            )}
            <div className="rounded-2xl border border-border bg-white p-6">
              <h3 className="!m-0 flex items-center gap-2 text-lg font-bold text-pine-dark">
                <MapPin size={18} strokeWidth={1.75} aria-hidden="true" /> {t.areaTitle}
              </h3>
              <p className="mb-0 mt-3 text-sm leading-relaxed text-muted-grey">{service.business ? t.areaBusiness : t.areaHousehold}</p>
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        eyebrow={service.business ? t.ctaEyebrowBusiness : t.ctaEyebrowHousehold}
        title={
          service.business ? (
            <>
              {t.ctaTitleBusinessBefore} <em>{t.ctaTitleBusinessEm}</em>
            </>
          ) : (
            <>
              {service.name} <em>{t.ctaTitleHouseholdEm}</em>
            </>
          )
        }
        text={service.business ? t.ctaTextBusiness : t.ctaTextHousehold}
        href={ctaHref}
        label={ctaLabel}
        secondary={{ href: '/faq', label: t.faq }}
      />
    </>
  );
}
