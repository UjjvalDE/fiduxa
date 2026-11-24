// Trust sections of the homepage (server components), fed by GET /home/trust:
//   <WorryFreeSection />  bento grid: easy online booking, invoices, fair pay,
//                         approved cleaners & replacement, live rating
//   <ReviewsSection />    #bewertungen – rating summary + review carousel
//   <ServiceAreaStrip />  "Wir reinigen in ganz Berlin" + district chips
//   <JoinTeamSection />   teaser for /reinigungskraft-werden
// Every number (rating, pay share, cancellation window) comes from the API;
// a block whose data is missing is not rendered instead of showing a guess.
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Check,
  ClipboardList,
  HandCoins,
  House,
  MapPin,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Star,
  UserCheck,
  Wallet,
} from 'lucide-react';

import { getFormat, getMessages } from '@/lib/i18n/server';
import common from '@/lib/i18n/messages/common';
import type { HomeTrust } from '@/lib/types';
import { ReviewCarousel, StarRow, type ReviewCard } from './home-islands';
import { DISTRICTS as DISTRICT_PAGES } from '../(site)/reinigung/_districts';
import homeMessages from './messages';
import { visibleRating } from './trust';

/**
 * Served postcodes: server/src/config/pricing.js OPERATIONS.servicePostcodeRegex
 * = /^1[0-4]\d{3}$/, which covers every Berlin postcode (10115–14199).
 */
const DISTRICT_SLUGS: Record<string, string> = Object.fromEntries(DISTRICT_PAGES.map((d) => [d.name, d.slug]));
const DISTRICTS = [
  'Mitte',
  'Kreuzberg',
  'Friedrichshain',
  'Prenzlauer Berg',
  'Neukölln',
  'Charlottenburg',
  'Schöneberg',
  'Wilmersdorf',
  'Moabit',
  'Wedding',
  'Tempelhof',
  'Steglitz',
  'Pankow',
  'Lichtenberg',
  'Treptow',
  'Köpenick',
  'Spandau',
  'Reinickendorf',
  'Zehlendorf',
  'Marzahn',
];

function ratingText(trust: HomeTrust | null) {
  const f = getFormat();
  const rating = visibleRating(trust);
  if (!rating) return null;
  return {
    average: f.number(rating.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    count: f.number(rating.count),
    raw: rating.average,
  };
}

export function WorryFreeSection({ trust }: { trust: HomeTrust | null }) {
  const t = getMessages(homeMessages).worry;
  const rating = ratingText(trust);
  const share = trust?.cleanerShare ?? null;
  const cutoff = trust?.cancellationCutoffHours;

  return (
    <section id="sorgenfrei" className="section worry-section" aria-labelledby="sorgenfrei-title">
      <div className="shell">
        <div className="section-heading split-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-dot" /> {t.eyebrow}
            </div>
            <h2 id="sorgenfrei-title">
              {t.titleBefore} <em>{t.titleEm}</em>
            </h2>
          </div>
          <p>{t.lead}</p>
        </div>

        <div className="bento">
          <article className="bento-tile bento-hero">
            <span className="bento-blob bento-blob-a" aria-hidden="true" />
            <span className="bento-blob bento-blob-b" aria-hidden="true" />
            <div className="bento-icon bento-icon-light">
              <House size={22} aria-hidden="true" />
            </div>
            <span className="bento-kicker">{t.employer.kicker}</span>
            <h3>{t.employer.title}</h3>
            <p>{t.employer.text}</p>
            <ul className="bento-checks">
              {t.employer.points.map((point) => (
                <li key={point}>
                  <Check size={15} strokeWidth={2.25} aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
            {typeof cutoff === 'number' && cutoff > 0 && (
              <p className="bento-foot">
                <CalendarCheck size={16} aria-hidden="true" />
                {t.employer.flexible(cutoff)}
              </p>
            )}
          </article>

          <article className="bento-tile bento-tax">
            <div className="bento-icon">
              <ReceiptText size={21} aria-hidden="true" />
            </div>
            <span className="bento-kicker">{t.tax.kicker}</span>
            <h3>{t.tax.title}</h3>
            <p>{t.tax.text}</p>
          </article>

          <div className="bento-row">
            <article className="bento-tile bento-team">
              <div className="bento-icon">
                <UserCheck size={21} aria-hidden="true" />
              </div>
              <span className="bento-kicker">{t.team.kicker}</span>
              <h3>{t.team.approvedTitle}</h3>
              <p>{t.team.approved}</p>
              <h3 className="bento-subhead">
                <RefreshCw size={16} aria-hidden="true" /> {t.team.replacementTitle}
              </h3>
              <p>{t.team.replacement}</p>
            </article>

            {share && (
              <article className="bento-tile bento-pay">
                <span className="bento-blob bento-blob-c" aria-hidden="true" />
                <div className="bento-icon">
                  <HandCoins size={21} aria-hidden="true" />
                </div>
                <span className="bento-kicker">{t.pay.kicker}</span>
                <p className="bento-figure">
                  <strong>{t.pay.value(share.minPct, share.maxPct)}</strong>
                </p>
                <p>{t.pay.text}</p>
              </article>
            )}

            {rating && (
              <article className="bento-tile bento-rating">
                <div className="bento-icon">
                  <Star size={21} aria-hidden="true" />
                </div>
                <span className="bento-kicker">{t.rating.kicker}</span>
                <p className="bento-figure">
                  <strong>
                    {rating.average} <Star size={30} fill="currentColor" className="inline-block align-[-2px]" aria-hidden="true" />
                  </strong>
                </p>
                <p>{t.rating.count(rating.count)}</p>
                <a href="#bewertungen" className="text-link">
                  {t.rating.link} <ArrowRight size={16} aria-hidden="true" />
                </a>
              </article>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ReviewsSection({ trust }: { trust: HomeTrust | null }) {
  const t = getMessages(homeMessages).reviews;
  const c = getMessages(common);
  const f = getFormat();
  const rating = ratingText(trust);
  if (!rating || !trust) return null;

  const services = c.services as Record<string, string>;
  const cards: ReviewCard[] = trust.reviews.map((review) => ({
    id: review._id,
    rating: review.rating,
    author: review.author,
    service: (review.serviceId && services[review.serviceId]) || t.serviceFallback,
    dateTime: review.createdAt,
    date: new Date(review.createdAt).toLocaleDateString(f.tag, {
      timeZone: 'Europe/Berlin',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    comment: review.comment,
  }));

  return (
    <section id="bewertungen" className="section reviews-section" aria-labelledby="bewertungen-title">
      <div className="shell">
        <div className="reviews-head">
          <div>
            <div className="eyebrow">{t.eyebrow}</div>
            <h2 id="bewertungen-title">
              {t.titleBefore} <em>{t.titleEm}</em>
            </h2>
          </div>
          <div className="reviews-score">
            <StarRow rating={rating.raw} label={t.summaryLabel(rating.average)} size={22} />
            <p className="reviews-average" aria-hidden="true">
              <strong>{rating.average}</strong> {t.outOf}
            </p>
            <p className="reviews-count">{t.count(rating.count)}</p>
          </div>
        </div>
        <p className="reviews-note">
          <BadgeCheck size={16} aria-hidden="true" />
          <span>{t.note}</span>
        </p>
        {cards.length > 0 && <ReviewCarousel reviews={cards} />}
      </div>
    </section>
  );
}

export function ServiceAreaStrip() {
  const t = getMessages(homeMessages).area;
  return (
    <section id="servicegebiet" className="area-strip" aria-labelledby="servicegebiet-title">
      <div className="shell area-inner">
        <div className="area-copy">
          <div className="eyebrow">
            <MapPin size={14} aria-hidden="true" /> {t.eyebrow}
          </div>
          <h2 id="servicegebiet-title">
            {t.titleBefore} <em>{t.titleEm}</em>
          </h2>
          <p>{t.text}</p>
          <Link href="/buchung" className="button">
            {t.cta} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <ul className="district-chips" aria-label={t.districtsLabel}>
          {DISTRICTS.map((district) => {
            const slug = DISTRICT_SLUGS[district];
            return <li key={district}>{slug ? <Link href={`/reinigung/${slug}`}>{district}</Link> : district}</li>;
          })}
          <li className="district-more">… {t.more}</li>
        </ul>
      </div>
    </section>
  );
}

export function JoinTeamSection({ trust }: { trust: HomeTrust | null }) {
  const t = getMessages(homeMessages).join;
  const share = trust?.cleanerShare ?? null;
  const benefits = [
    { Icon: HandCoins, title: t.benefits.payTitle, text: share ? t.benefits.pay(share.minPct, share.maxPct) : t.benefits.payNoNumbers },
    { Icon: ClipboardList, title: t.benefits.choiceTitle, text: t.benefits.choice },
    { Icon: Wallet, title: t.benefits.payoutTitle, text: t.benefits.payout },
  ];

  return (
    <section id="jobs" className="section join-section" aria-labelledby="jobs-title">
      <div className="shell grid items-center gap-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-20">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> {t.eyebrow}
          </div>
          <h2 id="jobs-title">
            {t.titleBefore} <em>{t.titleEm}</em>
          </h2>
          <p className="section-lead">{t.lead}</p>
          <ul className="join-benefits">
            {benefits.map(({ Icon, title, text }) => (
              <li key={title}>
                <span className="join-benefit-icon">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </span>
              </li>
            ))}
          </ul>
          <Link href="/reinigungskraft-werden" className="button">
            {t.cta} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <div className="join-visual" aria-hidden="true">
          <span className="join-shape join-shape-a" />
          <span className="join-shape join-shape-b" />
          <span className="join-shape join-shape-c" />
          <div className="join-card join-card-main">
            <Sparkles size={26} />
            <span className="join-line" />
            <span className="join-line join-line-short" />
          </div>
          <div className="join-card join-card-cal">
            <CalendarCheck size={22} />
            <span className="join-dots">
              <i />
              <i />
              <i className="is-on" />
              <i />
              <i className="is-on" />
            </span>
          </div>
          <div className="join-card join-card-coin">
            <Wallet size={22} />
          </div>
        </div>
      </div>
    </section>
  );
}
