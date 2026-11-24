'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Info, Loader2 } from 'lucide-react';

import { api, ApiError } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { Condition, Estimate, Frequency, ServiceId } from '@/lib/types';
import { SERVICES, getExtrasContent } from '../../_shared/catalogue';
import { usePricing } from '../../_shared/use-pricing';
import messages from '../_messages';

const HOUSEHOLD = SERVICES.filter((s) => !s.business);
const CONDITIONS: Condition[] = ['basic', 'normal', 'moderate', 'heavy'];
const MIN_AREA = 15;
const MAX_AREA = 1000;

export function EstimateCalculator() {
  const { locale } = useLocale();
  const t = useMessages(messages).calc;
  const c = useMessages(common);
  const f = useFormat();
  const { pricing } = usePricing();
  const extrasContent = getExtrasContent(locale);

  const [serviceId, setServiceId] = useState<ServiceId>('home-cleaning');
  const [area, setArea] = useState('60');
  const [condition, setCondition] = useState<Condition>('normal');
  const [frequency, setFrequency] = useState<Frequency>('one-time');
  const [extras, setExtras] = useState<string[]>([]);
  /** Chosen duration in minutes; null = use the recommendation */
  const [duration, setDuration] = useState<number | null>(null);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'offline' | 'invalid' | null>(null);
  const requestId = useRef(0);

  const service = HOUSEHOLD.find((s) => s.id === serviceId) ?? HOUSEHOLD[0];
  const serviceName = c.services[service.id];
  const areaNumber = Number(area.replace(',', '.'));
  const areaValid = area.trim() !== '' && Number.isFinite(areaNumber) && areaNumber >= MIN_AREA && areaNumber <= MAX_AREA;

  const minMinutes = pricing?.minimumMinutes ?? 120;
  const maxMinutes = pricing?.maximumMinutes ?? 720;
  const stepMinutes = pricing?.durationStepMinutes ?? 30;
  const durationOptions: number[] = [];
  for (let m = minMinutes; m <= maxMinutes; m += stepMinutes) durationOptions.push(m);

  // Keep the frequency valid for the selected service
  useEffect(() => {
    if (!service.frequencies.includes(frequency)) setFrequency('one-time');
  }, [service, frequency]);

  const extrasKey = extras.join(',');

  useEffect(() => {
    if (!areaValid || !service.frequencies.includes(frequency)) {
      requestId.current += 1; // discard any in-flight response
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.post<{ success: boolean; data: Estimate }>('/bookings/estimate', {
          serviceId,
          areaM2: areaNumber,
          condition,
          frequency,
          extras: extrasKey ? extrasKey.split(',') : [],
          ...(duration != null && { durationMinutes: duration }),
        });
        if (id !== requestId.current) return;
        setEstimate(res.data);
        setError(null);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof ApiError && err.status === 0 ? 'offline' : 'invalid');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [serviceId, areaNumber, areaValid, condition, frequency, extrasKey, duration, service]);

  const toggleExtra = (id: string) =>
    setExtras((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.concat(id)));

  const selectClass =
    'h-11 w-full rounded-lg border border-border bg-white px-3 text-sm text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-1';

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_.85fr]">
      <form className="grid gap-6 rounded-2xl border border-border bg-white p-6 sm:p-8" onSubmit={(e) => e.preventDefault()} aria-label={t.formLabel}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="calc-service" className="mb-2 block text-sm font-bold text-pine-dark">
              {t.service}
            </label>
            <select id="calc-service" className={selectClass} value={serviceId} onChange={(e) => setServiceId(e.target.value as ServiceId)}>
              {HOUSEHOLD.map((s) => (
                <option key={s.id} value={s.id}>
                  {c.services[s.id]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="calc-area" className="mb-2 block text-sm font-bold text-pine-dark">
              {t.area}
            </label>
            <input
              id="calc-area"
              type="number"
              inputMode="numeric"
              min={MIN_AREA}
              max={MAX_AREA}
              step={1}
              className={selectClass}
              value={area}
              onChange={(e) => setArea(e.target.value)}
              aria-invalid={!areaValid || undefined}
              aria-describedby="calc-area-hint"
            />
            <p id="calc-area-hint" className={`mb-0 mt-1.5 text-xs ${areaValid ? 'text-muted-grey' : 'font-semibold text-red-700'}`}>
              {areaValid ? t.areaHint(MIN_AREA, MAX_AREA) : t.areaError(MIN_AREA, MAX_AREA)}
            </p>
          </div>
        </div>

        <fieldset>
          <legend className="mb-3 text-sm font-bold text-pine-dark">{t.condition}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONDITIONS.map((key) => (
              <label
                key={key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-pine ${
                  condition === key ? 'border-pine bg-mint' : 'border-border bg-white hover:bg-cream'
                }`}
              >
                <input
                  type="radio"
                  name="calc-condition"
                  value={key}
                  checked={condition === key}
                  onChange={() => setCondition(key)}
                  className="mt-0.5 accent-[#174D3A]"
                />
                <span>
                  <strong className="block text-pine-dark">{c.conditions[key].label}</strong>
                  <span className="text-xs text-muted-grey">{c.conditions[key].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="calc-frequency" className="mb-2 block text-sm font-bold text-pine-dark">
            {t.frequency}
          </label>
          <select
            id="calc-frequency"
            className={selectClass}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
            disabled={service.frequencies.length <= 1}
            aria-describedby={service.frequencies.length <= 1 ? 'calc-frequency-hint' : undefined}
          >
            {service.frequencies.map((freq) => (
              <option key={freq} value={freq}>
                {c.frequencies[freq]}
              </option>
            ))}
          </select>
          {service.frequencies.length <= 1 && (
            <p id="calc-frequency-hint" className="mb-0 mt-1.5 text-xs text-muted-grey">
              {t.onceOnly(serviceName)}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="mb-3 text-sm font-bold text-pine-dark">{t.extras}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {extrasContent.map((extra) => {
              const checked = extras.includes(extra.id);
              return (
                <label
                  key={extra.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-pine ${
                    checked ? 'border-pine bg-mint' : 'border-border bg-white hover:bg-cream'
                  }`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleExtra(extra.id)} className="h-4 w-4 accent-[#174D3A]" />
                  <span className="flex-1 font-semibold text-charcoal">{extra.label}</span>
                  <span className="text-xs text-muted-grey">+{c.units.minutesShort(extra.minutes)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="calc-hours" className="mb-2 block text-sm font-bold text-pine-dark">
            {t.hours}
          </label>
          <select
            id="calc-hours"
            className={selectClass}
            value={duration == null ? '' : String(duration)}
            onChange={(e) => setDuration(e.target.value === '' ? null : Number(e.target.value))}
            aria-describedby="calc-hours-hint"
          >
            <option value="">{estimate ? t.hoursRecommended(f.hours(estimate.recommendedMinutes)) : t.hoursRecommendedPending}</option>
            {durationOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {f.hours(minutes)}
              </option>
            ))}
          </select>
          <p id="calc-hours-hint" className="mb-0 mt-1.5 text-xs text-muted-grey">
            {t.hoursHint}
          </p>
          {estimate?.belowRecommendation && duration != null && (
            <p className="mb-0 mt-2 flex items-start gap-1.5 text-xs font-semibold text-amber-800" role="status">
              <AlertTriangle size={14} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden="true" />
              {t.belowRecommendation(f.hours(estimate.recommendedMinutes))}
            </p>
          )}
        </div>
      </form>

      <div className="lg:sticky lg:top-28 lg:self-start">
        <div className="price-panel" aria-live="polite" aria-busy={loading}>
          <div className="price-panel-top">
            <div>
              <span className="price-label">{t.priceLabel}</span>
              <strong className="price-value tabular-nums">{estimate ? f.euro(estimate.totalCents) : '–'}</strong>
              <span className="price-unit">{estimate ? t.forHours(f.hours(estimate.durationMinutes)) : t.enterDetails}</span>
            </div>
            <div className="price-icon">
              {loading ? <Loader2 size={22} className="animate-spin" aria-label={t.calculating} /> : <Info size={22} aria-hidden="true" />}
            </div>
          </div>
          <div className="price-divider" />
          {estimate && (
            <>
              <div className="price-row">
                <span>{t.recommended}</span>
                <small className="!text-xs !text-white/80">{f.hours(estimate.recommendedMinutes)}</small>
              </div>
              <div className="price-row">
                <span>{t.booked}</span>
                <small className="!text-xs !text-white/80">{f.hours(estimate.durationMinutes)}</small>
              </div>
              <div className="price-row">
                <span>{t.hourlyRate}</span>
                <small className="!text-xs !text-white/80">{f.euro(estimate.hourlyRateCents)}</small>
              </div>
              <div className="price-row">
                <span>{t.labour}</span>
                <small className="!text-xs !text-white/80">{f.euro(estimate.labourCents)}</small>
              </div>
              {estimate.extraFeesCents > 0 && (
                <div className="price-row">
                  <span>{t.extraFees}</span>
                  <small className="!text-xs !text-white/80">{f.euro(estimate.extraFeesCents)}</small>
                </div>
              )}
              {estimate.discountCents > 0 && (
                <div className="price-row">
                  <span>{t.discount(c.frequencies[frequency])}</span>
                  <small className="!text-xs !text-lime">− {f.euro(estimate.discountCents)}</small>
                </div>
              )}
              <div className="price-row">
                <span>
                  <strong>{t.total}</strong>
                </span>
                <small className="!text-sm !font-bold !text-lime">{f.euro(estimate.totalCents)}</small>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-white/10 p-3 text-xs text-white">
              {error === 'offline' ? t.errorOffline : t.errorInvalid}
            </p>
          )}
          {serviceId === 'end-of-tenancy' && <p className="mt-4 text-xs leading-relaxed text-white/70">{t.endOfTenancyNote}</p>}
          {estimate && (
            <p className="mb-0 mt-5 text-[11px] leading-relaxed text-white/65">
              {t.disclaimer}
              {estimate.pricesIncludeVat ? t.inclVat : ''}
            </p>
          )}
          <Link href={`/buchung?service=${serviceId}`} className="button button-light mt-6 w-full">
            {t.cta} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
