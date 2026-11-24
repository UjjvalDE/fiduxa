'use client';

// Interactive islands of the (server-rendered) homepage: postcode quick start,
// live price panel (GET /pricing), FAQ accordion, review carousel and the
// "copy code" button.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, BadgeCheck, Banknote, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Loader2, MapPin, Sparkles, Star } from 'lucide-react';

import { api, ApiError } from '@/lib/api';
import { translateApiError, translateApiMessage } from '@/lib/i18n/api-errors';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { Frequency, ServiceId } from '@/lib/types';
import { formatPercent, usePricing } from '../(site)/_shared/use-pricing';
import homeMessages from './messages';

const QUICK_SERVICES: ServiceId[] = ['home-cleaning', 'deep-cleaning', 'end-of-tenancy', 'business-cleaning'];

type QuickError = { message: string; kind: 'invalid' | 'outside' | 'network' };

export function QuickStart() {
  const router = useRouter();
  const { locale } = useLocale();
  const t = useMessages(homeMessages).quick;
  const c = useMessages(common);
  const [serviceId, setServiceId] = useState<ServiceId>('home-cleaning');
  const [postcode, setPostcode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<QuickError | null>(null);

  const isBusiness = serviceId === 'business-cleaning';

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (isBusiness) {
      router.push('/fuer-unternehmen');
      return;
    }
    const value = postcode.trim();
    if (!value) {
      setError({ kind: 'invalid', message: t.errorEmpty });
      document.getElementById('quick-postcode')?.focus();
      return;
    }
    if (!/^\d{5}$/.test(value)) {
      setError({ kind: 'invalid', message: t.errorInvalid });
      document.getElementById('quick-postcode')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ serviceable: boolean; message: string; postcode: string }>('/service-area/check', {
        postcode: value,
      });
      if (res.serviceable) {
        router.push(`/buchung?service=${serviceId}&plz=${res.postcode}`);
        return; // keep the button busy while navigating
      }
      setError({ kind: 'outside', message: translateApiMessage(res.message, locale) });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError({ kind: 'invalid', message: translateApiError(err, locale) });
      } else {
        setError({ kind: 'network', message: t.errorNetwork });
      }
    }
    setSubmitting(false);
  };

  const fieldClass =
    'h-12 w-full rounded-[9px] border border-border bg-cream px-3 text-sm text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-1';

  return (
    <form onSubmit={onSubmit} noValidate className="service-checker !items-start" aria-label={t.formLabel}>
      <div className="pt-1">
        <span className="checker-kicker">{t.kicker}</span>
        <strong>{t.title}</strong>
      </div>
      <div className="grid flex-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-start">
        <div>
          <label htmlFor="quick-service" className="sr-only">
            {t.serviceLabel}
          </label>
          <select
            id="quick-service"
            className={fieldClass}
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value as ServiceId);
              setError(null);
            }}
          >
            {QUICK_SERVICES.map((id) => (
              <option key={id} value={id}>
                {id === 'business-cleaning' ? t.businessOption : c.services[id]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="quick-postcode" className="sr-only">
            {t.postcodeLabel}
          </label>
          <div className="relative">
            <MapPin size={17} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-pine" aria-hidden="true" />
            <input
              id="quick-postcode"
              className={`${fieldClass} pl-9 disabled:opacity-60`}
              value={postcode}
              onChange={(e) => setPostcode(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder={isBusiness ? t.postcodeBusiness : t.postcodePlaceholder}
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              disabled={isBusiness}
              aria-invalid={error?.kind === 'invalid' || error?.kind === 'outside' || undefined}
              aria-describedby="quick-postcode-msg"
            />
          </div>
          <div id="quick-postcode-msg" aria-live="polite">
            {error && (
              <p className={`mb-0 mt-1.5 text-xs font-semibold ${error.kind === 'network' ? 'text-pine' : 'text-red-700'}`}>
                {error.message}{' '}
                {error.kind === 'outside' && (
                  <Link href="/kontakt" className="underline underline-offset-2">
                    {t.outsideLink}
                  </Link>
                )}
                {error.kind === 'network' && (
                  <Link href={`/buchung?service=${serviceId}&plz=${postcode.trim()}`} className="underline underline-offset-2">
                    {t.networkLink}
                  </Link>
                )}
              </p>
            )}
          </div>
        </div>
        <button type="submit" className="button h-12 w-full md:w-auto" disabled={submitting} aria-busy={submitting}>
          {submitting ? (
            <>
              <Loader2 size={17} className="animate-spin" aria-hidden="true" /> {t.checking}
            </>
          ) : (
            <>
              {t.submit} <ArrowRight size={17} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export function PricePanel() {
  const { pricing, loading } = usePricing();
  const t = useMessages(homeMessages).price;
  const c = useMessages(common);
  const f = useFormat();

  const discounts = pricing
    ? (Object.entries(pricing.frequencyDiscount) as [Frequency, number][]).filter(([, rate]) => rate > 0)
    : [];
  const discountText =
    discounts.length > 0 ? discounts.map(([freq, rate]) => `${c.frequencies[freq]} −${formatPercent(rate, f)}`).join(' · ') : t.noDiscount;

  return (
    <div className="price-panel" aria-busy={loading}>
      <div className="price-panel-top">
        <div>
          <span className="price-label">{t.rateLabel}</span>
          {pricing ? (
            <>
              <strong className="price-value">{f.euro(pricing.hourlyRateCents)}</strong>
              <span className="price-unit">{t.perHourMinimum(f.hours(pricing.minimumMinutes), f.euro(pricing.minimumChargeCents))}</span>
            </>
          ) : loading ? (
            <>
              <span className="price-value block h-10 w-36 animate-pulse rounded-md bg-white/10" aria-hidden="true" />
              <span className="price-unit">{t.loading}</span>
            </>
          ) : (
            <>
              <strong className="price-value">{t.fallbackValue}</strong>
              <span className="price-unit">
                {t.fallbackBefore}{' '}
                <Link href="/preise" className="underline">
                  {t.fallbackLink}
                </Link>
                .
              </span>
            </>
          )}
        </div>
        <div className="price-icon">
          <Banknote size={25} aria-hidden="true" />
        </div>
      </div>
      <div className="price-divider" />
      {[t.rows.price, t.rows.extras, [t.rows.recurring, pricing ? discountText : '…']].map(([label, detail]) => (
        <div className="price-row" key={label}>
          <span>
            <Check size={15} aria-hidden="true" />
            {label}
          </span>
          <small>{detail}</small>
        </div>
      ))}
      <div className="price-disclaimer">
        <Sparkles size={16} aria-hidden="true" /> {t.disclaimer}
        {pricing?.pricesIncludeVat ? t.inclVat : ''}
      </div>
    </div>
  );
}

export function HomeFaq() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const { pricing } = usePricing();
  const t = useMessages(homeMessages).faq;
  const faqs = t.items(pricing?.cancellationCutoffHours ?? 24);
  return (
    <div className="faq-list">
      {faqs.map(([question, answer], index) => {
        const open = openFaq === index;
        return (
          <div className={`faq-item ${open ? 'is-open' : ''}`} key={index}>
            <h3 className="!m-0 !text-[inherit] !tracking-normal">
              <button
                type="button"
                id={`home-faq-q-${index}`}
                onClick={() => setOpenFaq(open ? null : index)}
                aria-expanded={open}
                aria-controls={`home-faq-a-${index}`}
              >
                <span>{question}</span>
                <ChevronDown size={19} aria-hidden="true" />
              </button>
            </h3>
            <div className="faq-answer" id={`home-faq-a-${index}`} role="region" aria-labelledby={`home-faq-q-${index}`}>
              <p>{answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Copy a promotion code to the clipboard (with visible + announced feedback) */
export function CopyCode({ code, label, copiedLabel, className }: { code: string; label: string; copiedLabel: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable – the code stays visible and selectable */
    }
  };
  return (
    <button type="button" onClick={copy} className={className} aria-label={`${label}: ${code}`}>
      <Copy size={15} aria-hidden="true" />
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}

export interface ReviewCard {
  id: string;
  rating: number;
  author: string;
  service: string;
  /** localized display date */
  date: string;
  /** ISO timestamp for <time dateTime> */
  dateTime: string;
  comment: string;
}

/** Row of 5 stars; the number is announced once via aria-label */
export function StarRow({ rating, label, size = 16 }: { rating: number; label: string; size?: number }) {
  return (
    <span className="star-row" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} strokeWidth={1.75} fill={n <= Math.round(rating) ? 'currentColor' : 'none'} aria-hidden="true" />
      ))}
    </span>
  );
}

/**
 * Horizontal review carousel: native CSS scroll-snap (touch, trackpad,
 * arrow keys on the focused list) plus prev/next buttons that scroll by one
 * card and are disabled at either end. Smooth scrolling only without
 * prefers-reduced-motion.
 */
export function ReviewCarousel({ reviews }: { reviews: ReviewCard[] }) {
  const t = useMessages(homeMessages).reviews;
  const trackRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const scrollByCard = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('li');
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const step = card ? card.offsetWidth + gap : el.clientWidth;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * step, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div className="review-carousel">
      <ul
        ref={trackRef}
        id="review-track"
        className="review-track"
        tabIndex={0}
        aria-label={t.carouselLabel}
        aria-describedby="review-carousel-hint"
      >
        {reviews.map((review) => (
          <li key={review.id} className="review-card">
            <article>
              <div className="review-card-top">
                <StarRow rating={review.rating} label={t.stars(review.rating)} />
                <time dateTime={review.dateTime}>{review.date}</time>
              </div>
              <p className="review-comment" title={review.comment}>
                {review.comment}
              </p>
              <footer className="review-meta">
                <strong>{review.author}</strong>
                <span>{review.service}</span>
                <span className="review-verified">
                  <BadgeCheck size={14} aria-hidden="true" /> {t.verified}
                </span>
              </footer>
            </article>
          </li>
        ))}
      </ul>
      <p id="review-carousel-hint" className="sr-only">
        {t.carouselHint}
      </p>
      <div className="review-controls">
        <button type="button" className="review-nav" onClick={() => scrollByCard(-1)} disabled={atStart} aria-label={t.prev} aria-controls="review-track">
          <ChevronLeft size={19} aria-hidden="true" />
        </button>
        <button type="button" className="review-nav" onClick={() => scrollByCard(1)} disabled={atEnd} aria-label={t.next} aria-controls="review-track">
          <ChevronRight size={19} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
