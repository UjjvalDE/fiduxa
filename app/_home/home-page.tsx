// Homepage, rendered on the server. Interactive parts are small client
// islands (home-islands.tsx); live promotions come from GET /promotions/active
// (promo-sections.tsx); trust data from GET /home/trust (trust-sections.tsx).
// Images are self-hosted in /public/images (no
// third-party requests from visitors' browsers).
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Check, Clock3, Leaf, Mail, MapPin, Phone, ShieldCheck, Star } from 'lucide-react';

import { SiteHeader } from '@/componets/site/site-header';
import { SiteFooter } from '@/componets/site/site-footer';
import { getLocale, getMessages } from '@/lib/i18n/server';
import type { GiftCardConfig, HomeTrust, PromotionBanner } from '@/lib/types';
import { CONTACT, getExtrasContent, getServiceContent } from '../(site)/_shared/catalogue';
import { SERVICE_ICONS } from '../(site)/_shared/service-icons';
import { HomeFaq, PricePanel, QuickStart } from './home-islands';
import homeMessages from './messages';
import promoMessages from './promo-messages';
import { CampaignHero, GiftCardPromo, OffersSection, PromoBannerStrip } from './promo-sections';
import { groupPromotions } from './promotions';
import { JoinTeamSection, ReviewsSection, ServiceAreaStrip, WorryFreeSection } from './trust-sections';

/** Self-hosted, compressed (≈1200 px wide) photos with intrinsic sizes */
const IMAGES = {
  hero: { src: '/images/home-hero.jpg', width: 1200, height: 801 },
  detail: { src: '/images/home-detail.jpg', width: 1200, height: 770 },
  story: { src: '/images/home-story.jpg', width: 1200, height: 794 },
};

const HOME_EXTRAS = ['interior-windows', 'inside-oven', 'inside-fridge', 'balcony'] as const;

/** Space before the text after an <em>, unless it starts with punctuation */
const after = (text: string) => (text && !/^[.,!?;:]/.test(text) ? ` ${text}` : text);

const TRUST_ICONS = [ShieldCheck, Clock3, Leaf];

export function HomePage({
  promotions,
  giftConfig,
  trust,
}: {
  promotions: PromotionBanner[];
  giftConfig: GiftCardConfig | null;
  trust: HomeTrust | null;
}) {
  const locale = getLocale();
  const t = getMessages(homeMessages);
  const tp = getMessages(promoMessages);
  const services = getServiceContent(locale);
  const extras = getExtrasContent(locale).filter((extra) => (HOME_EXTRAS as readonly string[]).includes(extra.id));
  const { hero, banners, cards } = groupPromotions(promotions);
  const quickStart = (
    <div className="shell pb-14 lg:pb-20">
      <QuickStart />
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-warm-cream text-charcoal">
      <SiteHeader />
      <main id="inhalt" className="flex-1 overflow-hidden">
        <PromoBannerStrip promos={banners} locale={locale} t={tp} />
        {hero ? (
          <CampaignHero promo={hero} locale={locale} t={tp}>
            <div className="bg-cream pt-10 lg:pt-14">{quickStart}</div>
          </CampaignHero>
        ) : (
          <section id="start" className="hero-section">
            <div className="shell grid items-center gap-12 py-12 lg:grid-cols-[1.01fr_.99fr] lg:gap-16 lg:py-20">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span className="eyebrow-dot" /> {t.hero.eyebrow}
                </div>
                <h1>
                  {t.hero.titleBefore} <em>{t.hero.titleEm}</em>
                  {after(t.hero.titleAfter)}
                </h1>
                <p className="hero-lead">{t.hero.lead}</p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link href="/buchung" className="button">
                    {t.hero.primary} <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                  <Link href="/leistungen" className="button button-quiet">
                    {t.hero.secondary} <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                </div>
                <ul className="mb-0 mt-6 flex flex-wrap gap-x-5 gap-y-2 p-0 text-[13px] font-semibold text-pine-dark">
                  {t.hero.points.map((point) => (
                    <li key={point} className="flex items-center gap-1.5">
                      <Check size={15} strokeWidth={2} className="text-pine" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="hero-note">
                  <ShieldCheck size={17} aria-hidden="true" /> {t.hero.note}
                </div>
              </div>
              <div className="hero-visual">
                <div className="hero-photo-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element -- next.config uses images.unoptimized; self-hosted file with width/height */}
                  <img src={IMAGES.hero.src} width={IMAGES.hero.width} height={IMAGES.hero.height} alt={t.hero.imageAlt} decoding="async" fetchPriority="high" />
                </div>
                <div className="hero-float-card">
                  <span className="float-icon">
                    <BadgeCheck size={19} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{t.hero.floatTitle}</strong>
                    <span>{t.hero.floatText}</span>
                  </div>
                </div>
                <div className="hero-stamp" aria-hidden="true">
                  <span>FIDUXA</span>
                  <strong>
                    one
                    <br />
                    trusted
                    <br />
                    partner
                  </strong>
                </div>
              </div>
            </div>
            {quickStart}
          </section>
        )}

        <OffersSection promos={cards} locale={locale} t={tp} />

        <section id="leistungen" className="section section-white">
          <div className="shell">
            <div className="section-heading split-heading">
              <div>
                <div className="eyebrow">{t.services.eyebrow}</div>
                <h2>
                  {t.services.titleBefore} <em>{t.services.titleEm}</em>
                  {after(t.services.titleAfter)}
                </h2>
              </div>
              <p>{t.services.lead}</p>
            </div>
            <div className="service-grid">
              {services.map((service) => {
                const Icon = SERVICE_ICONS[service.id];
                return (
                  <article className="service-card" key={service.id}>
                    <div className="service-icon">
                      <Icon size={22} aria-hidden="true" />
                    </div>
                    <span className="card-eyebrow">{service.eyebrow}</span>
                    <h3>{service.name}</h3>
                    <p>{service.teaser}</p>
                    <ul>
                      {service.highlights.map((item) => (
                        <li key={item}>
                          <Check size={14} aria-hidden="true" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Link href={`/leistungen/${service.slug}`} className="card-link">
                      {t.services.more}
                      <span className="sr-only">{t.services.moreAbout(service.name)}</span> <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="so-gehts" className="section process-section">
          <div className="shell">
            <div className="section-heading centered">
              <div className="eyebrow">{t.process.eyebrow}</div>
              <h2>
                {t.process.titleBefore}
                <br />
                <em>{t.process.titleEm}</em>
              </h2>
            </div>
            <div className="process-grid">
              <div className="process-line" aria-hidden="true" />
              {t.process.steps.map(([number, title, text]) => (
                <div className="process-step" key={number}>
                  <span className="process-number">{number}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-14 flex justify-center">
              <Link href="/so-funktioniert-es" className="text-link">
                {t.process.link} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <WorryFreeSection trust={trust} />

        <section id="preise" className="section price-section">
          <div className="shell grid items-center gap-12 lg:grid-cols-[.9fr_1.1fr] lg:gap-20">
            <div>
              <div className="eyebrow">{t.price.eyebrow}</div>
              <h2>
                {t.price.titleBefore} <em>{t.price.titleEm}</em>
                {after(t.price.titleAfter)}
              </h2>
              <p className="section-lead">{t.price.lead}</p>
              <Link className="text-link" href="/preise#rechner">
                {t.price.link} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <PricePanel />
          </div>
        </section>

        <section className="section extras-section">
          <div className="shell grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
            <div className="detail-photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- next.config uses images.unoptimized; self-hosted file with width/height */}
              <img src={IMAGES.detail.src} width={IMAGES.detail.width} height={IMAGES.detail.height} alt={t.extras.imageAlt} loading="lazy" decoding="async" />
              <div className="detail-caption">
                <Leaf size={18} aria-hidden="true" />
                <span>
                  {t.extras.captionTop}
                  <br />
                  <strong>{t.extras.captionStrong}</strong>
                </span>
              </div>
            </div>
            <div>
              <div className="eyebrow">{t.extras.eyebrow}</div>
              <h2>
                {t.extras.titleBefore} <em>{t.extras.titleEm}</em>
              </h2>
              <p className="section-lead">{t.extras.lead}</p>
              <div className="extras-list">
                {extras.map((extra) => (
                  <div className="extra-item" key={extra.id}>
                    <span className="extra-check">
                      <Check size={15} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{extra.label}</strong>
                      <span>{extra.description}</span>
                    </div>
                    <ArrowRight size={15} aria-hidden="true" />
                  </div>
                ))}
              </div>
              <Link href="/preise#extras" className="text-link">
                {t.extras.link} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <GiftCardPromo t={tp} config={giftConfig} />

        <section id="ueber-uns" className="section story-section">
          <div className="shell grid items-center gap-12 lg:grid-cols-[.9fr_1.1fr] lg:gap-20">
            <div>
              <div className="eyebrow">{t.story.eyebrow}</div>
              <h2>
                {t.story.titleBefore} <em>{t.story.titleEm}</em>
              </h2>
              <p className="section-lead">{t.story.lead}</p>
              <div className="trust-points">
                {t.story.points.map(([title, text], index) => {
                  const Icon = TRUST_ICONS[index] ?? ShieldCheck;
                  return (
                    <div key={title}>
                      <Icon size={20} aria-hidden="true" />
                      <span>
                        <strong>{title}</strong>
                        <small>{text}</small>
                      </span>
                    </div>
                  );
                })}
              </div>
              <Link href="/ueber-uns" className="text-link mt-8 !text-lime">
                {t.story.link} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="story-photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- next.config uses images.unoptimized; self-hosted file with width/height */}
              <img src={IMAGES.story.src} width={IMAGES.story.width} height={IMAGES.story.height} alt={t.story.imageAlt} loading="lazy" decoding="async" />
              <div className="story-quote">
                <Star size={17} fill="currentColor" aria-hidden="true" />
                <span>
                  {t.story.quoteTop}
                  <br />
                  <strong>{t.story.quoteStrong}</strong>
                </span>
              </div>
            </div>
          </div>
        </section>

        <ReviewsSection trust={trust} />

        <ServiceAreaStrip />

        <JoinTeamSection trust={trust} />

        <section id="faq" className="section faq-section">
          <div className="shell grid gap-12 lg:grid-cols-[.7fr_1.3fr] lg:gap-24">
            <div>
              <div className="eyebrow">{t.faq.eyebrow}</div>
              <h2>
                {t.faq.titleBefore} <em>{t.faq.titleEm}</em>
                {after(t.faq.titleAfter)}
              </h2>
              <p className="section-lead">{t.faq.lead}</p>
              <div className="flex flex-col gap-3">
                <Link className="text-link" href="/faq">
                  {t.faq.all} <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link className="text-link" href="/kontakt">
                  {t.faq.ask} <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <HomeFaq />
          </div>
        </section>

        <section id="buchen" className="booking-cta">
          <div className="shell booking-inner">
            <div>
              <div className="eyebrow light">{t.cta.eyebrow}</div>
              <h2>
                {t.cta.titleBefore}
                <br />
                <em>{t.cta.titleEm}</em>
              </h2>
              <p>{t.cta.text}</p>
            </div>
            <Link href="/buchung" className="button button-light">
              {t.cta.button} <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section id="kontakt" className="contact-section">
          <div className="shell grid gap-12 lg:grid-cols-[1fr_.8fr] lg:gap-24">
            <div>
              <div className="eyebrow">{t.contact.eyebrow}</div>
              <h2>{t.contact.title}</h2>
              <p className="section-lead">{t.contact.lead}</p>
              <div className="contact-details">
                <a href={`mailto:${CONTACT.email}`}>
                  <Mail size={18} aria-hidden="true" />
                  <span>
                    <small>{t.contact.email}</small>
                    {CONTACT.email}
                  </span>
                </a>
                <a href={CONTACT.phoneHref}>
                  <Phone size={18} aria-hidden="true" />
                  <span>
                    <small>{t.contact.phone}</small>
                    {CONTACT.phoneDisplay}
                  </span>
                </a>
                <div>
                  <MapPin size={18} aria-hidden="true" />
                  <span>
                    <small>{t.contact.area}</small>
                    {t.contact.berlin}
                  </span>
                </div>
              </div>
              <Link href="/fuer-unternehmen" className="text-link mt-8">
                {t.contact.business} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="contact-form content-start">
              <h3 className="!m-0 text-xl font-bold text-pine-dark">{t.contact.boxTitle}</h3>
              <p className="m-0 text-sm leading-relaxed text-muted-grey">{t.contact.boxText}</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/buchung" className="button">
                  {t.contact.book} <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link href="/kontakt" className="button button-quiet">
                  {t.contact.form}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
