// Reusable homepage sections for live promotions (server components):
//   <CampaignHero promo />      placement "hero" (highest priority)
//   <PromoBannerStrip promos /> placement "banner"
//   <OffersSection promos />    placement "card" incl. the welcome offer
//   <GiftCardPromo />           gift card teaser → /gutscheine
// Every campaign text, code and value comes from the API (pickText → locale, de fallback).
import Link from 'next/link';
import { ArrowRight, CalendarClock, Check, Gift, Sparkles, Star, Tag } from 'lucide-react';

import type { Locale } from '@/lib/i18n/config';
import { createFormatter } from '@/lib/i18n/format';
import type { GiftCardConfig, PromotionBanner, PromotionTheme } from '@/lib/types';
import { formatDiscount, formatEndDay, pickText, safeHref } from '../(site)/_shared/promotions';
import { GiftCardVisual } from '../(site)/gutscheine/_components/gift-card-visual';
import { CopyCode } from './home-islands';
import type { PromoMessages } from './promo-messages';

interface Theme {
  background: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  chip: string;
  border: string;
}

const THEMES: Record<PromotionTheme, Theme> = {
  pine: {
    background: 'radial-gradient(circle at 85% 10%, rgba(215,231,168,.22), transparent 45%), linear-gradient(135deg, #174D3A 0%, #103729 100%)',
    text: '#FFFFFF',
    muted: 'rgba(255,255,255,.75)',
    accent: '#D7E7A8',
    accentText: '#103729',
    chip: 'rgba(255,255,255,.1)',
    border: 'rgba(255,255,255,.18)',
  },
  festive: {
    // Deep green, berry red and gold; "snow" and sparkle dots are pure CSS
    background: [
      'radial-gradient(circle at 8% 18%, rgba(217,180,74,.55) 0 2px, transparent 3px)',
      'radial-gradient(circle at 22% 72%, rgba(255,255,255,.35) 0 1.5px, transparent 2.5px)',
      'radial-gradient(circle at 46% 12%, rgba(255,255,255,.3) 0 1.5px, transparent 2.5px)',
      'radial-gradient(circle at 63% 86%, rgba(217,180,74,.45) 0 2px, transparent 3px)',
      'radial-gradient(circle at 82% 30%, rgba(255,255,255,.35) 0 1.5px, transparent 2.5px)',
      'radial-gradient(circle at 93% 68%, rgba(255,255,255,.25) 0 1px, transparent 2px)',
      'radial-gradient(ellipse at 100% 0%, rgba(179,38,46,.55), transparent 55%)',
      'linear-gradient(145deg, #0E3B2C 0%, #0A2A20 60%, #3D0E14 100%)',
    ].join(', '),
    text: '#FFF8E6',
    muted: 'rgba(255,248,230,.8)',
    accent: '#D9B44A',
    accentText: '#0A2A20',
    chip: 'rgba(217,180,74,.14)',
    border: 'rgba(217,180,74,.45)',
  },
  spring: {
    background: 'radial-gradient(circle at 90% 10%, rgba(244,198,208,.9), transparent 42%), radial-gradient(circle at 5% 95%, rgba(215,231,168,.95), transparent 45%), linear-gradient(135deg, #F7FBF6 0%, #E4EFE7 100%)',
    text: '#103729',
    muted: '#40534A',
    accent: '#174D3A',
    accentText: '#FFFFFF',
    chip: 'rgba(23,77,58,.08)',
    border: 'rgba(23,77,58,.18)',
  },
  summer: {
    background: 'radial-gradient(circle at 88% 12%, rgba(255,214,102,.75), transparent 45%), linear-gradient(135deg, #FFF9EC 0%, #E7F4EF 100%)',
    text: '#123B36',
    muted: '#3E5A55',
    accent: '#0F6B5C',
    accentText: '#FFFFFF',
    chip: 'rgba(15,107,92,.08)',
    border: 'rgba(15,107,92,.2)',
  },
  autumn: {
    background: 'radial-gradient(circle at 90% 10%, rgba(214,123,62,.35), transparent 45%), linear-gradient(135deg, #3A2418 0%, #24170F 100%)',
    text: '#FFF4E8',
    muted: 'rgba(255,244,232,.78)',
    accent: '#E6A65D',
    accentText: '#24170F',
    chip: 'rgba(230,166,93,.14)',
    border: 'rgba(230,166,93,.35)',
  },
  winter: {
    background: 'radial-gradient(circle at 15% 20%, rgba(255,255,255,.5) 0 1.5px, transparent 2.5px), radial-gradient(circle at 75% 75%, rgba(255,255,255,.4) 0 1.5px, transparent 2.5px), linear-gradient(140deg, #1B3550 0%, #10233A 100%)',
    text: '#F2F8FF',
    muted: 'rgba(242,248,255,.78)',
    accent: '#BFE3FF',
    accentText: '#10233A',
    chip: 'rgba(191,227,255,.12)',
    border: 'rgba(191,227,255,.3)',
  },
  sale: {
    background: 'linear-gradient(135deg, #24312B 0%, #151D19 100%)',
    text: '#FFFFFF',
    muted: 'rgba(255,255,255,.75)',
    accent: '#D7E7A8',
    accentText: '#151D19',
    chip: 'rgba(215,231,168,.12)',
    border: 'rgba(215,231,168,.3)',
  },
};

const themeOf = (promo: PromotionBanner) => THEMES[promo.theme] ?? THEMES.pine;

/** "10 %" / "5,00 €" + optional cap and minimum order (from the API values) */
function discountFacts(promo: PromotionBanner, locale: Locale, t: PromoMessages) {
  const f = createFormatter(locale);
  const facts: string[] = [];
  if (promo.discountType === 'percent' && promo.maxDiscountCents) facts.push(t.campaign.upTo(f.euro(promo.maxDiscountCents)));
  if (promo.minOrderCents > 0) facts.push(t.campaign.minOrder(f.euro(promo.minOrderCents)));
  return facts;
}

/* ---------- Hero campaign ---------- */
export function CampaignHero({ promo, locale, t, children }: { promo: PromotionBanner; locale: Locale; t: PromoMessages; children?: React.ReactNode }) {
  const theme = themeOf(promo);
  const title = pickText(promo.title, locale);
  const text = pickText(promo.text, locale);
  const cta = pickText(promo.ctaText, locale);
  const badge = pickText(promo.badge, locale);
  const until = formatEndDay(promo.endsAt, locale);
  const value = formatDiscount(promo.discountType, promo.discountValue, locale);
  const facts = discountFacts(promo, locale, t);
  const festive = promo.theme === 'festive';

  return (
    <section id="start" className="relative isolate overflow-hidden" style={{ background: theme.background, color: theme.text }} aria-labelledby="campaign-title">
      {festive && (
        <>
          {/* Gold garland line + soft glow – decorative only */}
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: 'linear-gradient(90deg, #D9B44A, #B3262E 50%, #D9B44A)' }} />
          <span aria-hidden="true" className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: '#B3262E' }} />
          <Star aria-hidden="true" className="pointer-events-none absolute right-[8%] top-10 hidden h-6 w-6 rotate-12 md:block" style={{ color: theme.accent }} fill="currentColor" />
          <Sparkles aria-hidden="true" className="pointer-events-none absolute bottom-16 left-[46%] hidden h-5 w-5 lg:block" style={{ color: theme.accent }} />
        </>
      )}
      <div className="shell relative grid items-center gap-10 py-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-16 lg:py-20">
        <div>
          {badge && (
            <span
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em]"
              style={{ background: theme.accent, color: theme.accentText }}
            >
              <Tag size={14} aria-hidden="true" /> {badge}
            </span>
          )}
          <h1 id="campaign-title" className="!mb-5 !mt-5 !text-[38px] !leading-[1.04] sm:!text-[52px] lg:!text-[60px]" style={{ color: theme.text }}>
            {title}
          </h1>
          {text && (
            <p className="mb-7 max-w-[560px] text-[17px] leading-relaxed" style={{ color: theme.muted }}>
              {text}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={safeHref(promo.ctaHref)}
              className="button !min-h-[48px] !border-transparent !px-6 !text-sm"
              style={{ background: theme.accent, color: theme.accentText }}
            >
              {cta || title} <ArrowRight size={17} aria-hidden="true" />
            </Link>
            {until && (
              <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: theme.muted }}>
                <CalendarClock size={16} aria-hidden="true" /> {t.campaign.until(until)}
              </span>
            )}
          </div>
          {promo.code && (
            <div className="mt-7 inline-flex flex-wrap items-center gap-3 rounded-[14px] border border-dashed px-4 py-3" style={{ borderColor: theme.border, background: theme.chip }}>
              <span className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: theme.muted }}>
                {t.campaign.code}
              </span>
              <strong className="select-all font-mono text-lg tracking-[0.12em]">{promo.code}</strong>
              <CopyCode
                code={promo.code}
                label={t.campaign.copy}
                copiedLabel={t.campaign.copied}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] px-3 text-xs font-bold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2"
              />
            </div>
          )}
        </div>

        <div className="relative">
          {promo.imageUrl ? (
            <div className="overflow-hidden rounded-[28px] border shadow-[0_25px_60px_rgba(0,0,0,.25)]" style={{ borderColor: theme.border }}>
              {/* Admin-provided campaign image (above the fold); next/image would need remote host config */}
              {/* eslint-disable-next-line @next/next/no-img-element -- images.unoptimized in next.config */}
              <img
                src={promo.imageUrl}
                alt={title || t.campaign.imageAlt}
                width={1200}
                height={800}
                className="aspect-[3/2] h-auto w-full object-cover"
                referrerPolicy="no-referrer"
                decoding="async"
                {...{ fetchpriority: 'high' }}
              />
            </div>
          ) : (
            <div
              className="relative mx-auto grid aspect-square w-full max-w-[380px] place-items-center rounded-full border text-center"
              style={{ borderColor: theme.border, background: `radial-gradient(circle, ${theme.chip}, transparent 70%)` }}
              aria-hidden="true"
            >
              <span className="absolute inset-6 rounded-full border border-dashed" style={{ borderColor: theme.border }} />
              <span className="grid gap-1">
                <span className="font-serif text-[88px] font-bold leading-none sm:text-[104px]" style={{ fontFamily: 'Georgia, serif', color: theme.accent }}>
                  −{value}
                </span>
                <span className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: theme.muted }}>
                  {t.campaign.off}
                </span>
              </span>
            </div>
          )}
          {facts.length > 0 && (
            <p className="mx-auto mb-0 mt-5 max-w-[380px] text-center text-xs font-semibold" style={{ color: theme.muted }}>
              {facts.join(' · ')}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

/* ---------- Banner strip ---------- */
export function PromoBannerStrip({ promos, locale, t }: { promos: PromotionBanner[]; locale: Locale; t: PromoMessages }) {
  if (promos.length === 0) return null;
  return (
    <div aria-label={t.campaign.offersLabel} role="region">
      {promos.map((promo) => {
        const theme = themeOf(promo);
        const until = formatEndDay(promo.endsAt, locale);
        const title = pickText(promo.title, locale);
        const cta = pickText(promo.ctaText, locale);
        return (
          <div key={promo.id} style={{ background: theme.background, color: theme.text }}>
            <div className="shell flex flex-col items-start gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
                {pickText(promo.badge, locale) && (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-extrabold" style={{ background: theme.accent, color: theme.accentText }}>
                    {pickText(promo.badge, locale)}
                  </span>
                )}
                <strong>{title}</strong>
                {promo.code && (
                  <span style={{ color: theme.muted }}>
                    {t.campaign.code}: <strong className="font-mono tracking-wider" style={{ color: theme.text }}>{promo.code}</strong>
                  </span>
                )}
                {until && <span style={{ color: theme.muted }}>· {t.campaign.until(until)}</span>}
              </p>
              {cta && (
                <Link href={safeHref(promo.ctaHref)} className="inline-flex min-h-[44px] items-center gap-1.5 font-bold underline underline-offset-4">
                  {cta} <ArrowRight size={15} aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Offer cards (welcome offer + seasonal cards) ---------- */
export function OffersSection({ promos, locale, t }: { promos: PromotionBanner[]; locale: Locale; t: PromoMessages }) {
  if (promos.length === 0) return null;
  return (
    <section className="bg-white py-14 sm:py-16" aria-label={t.campaign.offersLabel}>
      <div className={`shell grid gap-5 ${promos.length > 1 ? 'md:grid-cols-2' : ''}`}>
        {promos.map((promo) => {
          const theme = themeOf(promo);
          const welcome = promo.kind === 'welcome';
          const title = pickText(promo.title, locale);
          const text = pickText(promo.text, locale);
          const cta = pickText(promo.ctaText, locale);
          const badge = pickText(promo.badge, locale) || `−${formatDiscount(promo.discountType, promo.discountValue, locale)}`;
          const until = formatEndDay(promo.endsAt, locale);
          return (
            <article
              key={promo.id}
              className="relative isolate flex flex-col gap-4 overflow-hidden rounded-[24px] border p-6 sm:flex-row sm:items-center sm:gap-7 sm:p-8"
              style={{ background: theme.background, color: theme.text, borderColor: theme.border }}
            >
              <span
                className="grid h-24 w-24 shrink-0 place-items-center rounded-full text-center text-2xl font-bold leading-none"
                style={{ background: theme.accent, color: theme.accentText, fontFamily: 'Georgia, serif' }}
                aria-hidden="true"
              >
                {badge}
              </span>
              <div className="grid min-w-0 gap-2">
                {(welcome || promo.firstBookingOnly) && (
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: theme.muted }}>
                    {t.campaign.firstBooking}
                  </span>
                )}
                <h2 className="!m-0 !max-w-none !text-2xl !leading-tight !tracking-tight" style={{ color: theme.text }}>
                  {title}
                </h2>
                {text && (
                  <p className="m-0 text-sm leading-relaxed" style={{ color: theme.muted }}>
                    {text}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {cta && (
                    <Link href={safeHref(promo.ctaHref)} className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-extrabold underline underline-offset-4">
                      {cta} <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  )}
                  {promo.code && (
                    <span className="text-sm" style={{ color: theme.muted }}>
                      {t.campaign.code}: <strong className="select-all font-mono tracking-wider" style={{ color: theme.text }}>{promo.code}</strong>
                    </span>
                  )}
                  {until && (
                    <span className="text-xs font-semibold" style={{ color: theme.muted }}>
                      {t.campaign.until(until)}
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Gift card teaser ---------- */
export function GiftCardPromo({ t, config }: { t: PromoMessages; config: GiftCardConfig | null }) {
  const sample = config?.presetAmountsCents?.[1] ?? config?.presetAmountsCents?.[0] ?? null;
  return (
    <section className="section bg-mint" aria-labelledby="gift-promo-title">
      <div className="shell grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-20">
        <div>
          <div className="eyebrow">
            <Gift size={14} aria-hidden="true" /> {t.gift.eyebrow}
          </div>
          <h2 id="gift-promo-title">
            {t.gift.titleBefore} <em>{t.gift.titleEm}</em>
          </h2>
          <p className="section-lead">{t.gift.text}</p>
          <ul className="mb-8 mt-0 grid gap-2 p-0">
            {t.gift.points.map((point) => (
              <li key={point} className="flex items-center gap-2 text-sm font-semibold text-pine-dark">
                <Check size={16} className="text-pine" aria-hidden="true" /> {point}
              </li>
            ))}
          </ul>
          <Link href="/gutscheine" className="button">
            {t.gift.cta} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        {config?.enabled !== false && (
          <div className="relative mx-auto w-full max-w-[420px]" role="img" aria-label={t.gift.cardAlt}>
            <GiftCardVisual design="spring" amountCents={sample} size="sm" className="absolute -right-2 -top-8 w-[78%] rotate-6 opacity-90" />
            <GiftCardVisual design="classic" amountCents={sample} size="sm" className="relative mt-10 w-[88%] -rotate-3" />
          </div>
        )}
      </div>
    </section>
  );
}
