// Instant client-side price/duration preview while the debounced server
// estimate (POST /bookings/estimate) is on its way. Mirrors the server formula
// (server/src/services/estimate.service.js) – the server value always wins.
import type { Condition, Estimate, Extra, Frequency, PublicPricing } from '@/lib/types';

export interface PreviewInput {
  /** service.timeFactor (deep cleaning / end-of-tenancy need more time per m²) */
  serviceTimeFactor?: number;
  areaM2: number;
  /** Bathrooms (1–6); every one beyond the first adds pricing.bathroomMinutes */
  bathrooms?: number;
  condition: Condition;
  frequency: Frequency;
  extras: string[];
  /** Hours chosen by the customer (minutes); undefined = recommendation */
  durationMinutes?: number;
}

export interface Preview extends Estimate {
  /** Area × condition part of the recommendation, unrounded (minutes) */
  baseMinutes: number;
  /** Time added by the selected extras (minutes) */
  extraMinutes: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Snap a duration to the step and the allowed range */
export const normaliseDuration = (minutes: number, pricing: Pick<PublicPricing, 'minimumMinutes' | 'maximumMinutes' | 'durationStepMinutes'>) => {
  const step = pricing.durationStepMinutes || 30;
  return clamp(Math.ceil(minutes / step) * step, pricing.minimumMinutes, pricing.maximumMinutes);
};

export function previewEstimate(pricing: PublicPricing, catalogue: Extra[], input: PreviewInput): Preview {
  const step = pricing.durationStepMinutes || 30;
  const factor = pricing.conditionFactor[input.condition] ?? pricing.conditionFactor.normal ?? 1;
  const baseMinutes = (input.areaM2 / (pricing.areaM2PerHour || 30)) * 60 * factor * (input.serviceTimeFactor ?? 1);

  const byId = new Map(catalogue.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const extras = input.extras
    .map((id) => byId.get(id))
    .filter((e): e is Extra => Boolean(e) && !seen.has(e!.id) && Boolean(seen.add(e!.id)))
    .map(({ id, label, minutes, priceCents }) => ({ id, label, minutes, priceCents }));
  const bathroomMinutes = Math.max(0, Math.min(6, Math.round(input.bathrooms ?? 1)) - 1) * (pricing.bathroomMinutes ?? 20);
  const extraMinutes = extras.reduce((sum, e) => sum + e.minutes, 0) + bathroomMinutes;
  const extraFeesCents = extras.reduce((sum, e) => sum + e.priceCents, 0);

  const recommendedMinutes = clamp(Math.ceil((baseMinutes + extraMinutes) / step) * step, pricing.minimumMinutes, pricing.maximumMinutes);
  const durationMinutes = input.durationMinutes == null ? recommendedMinutes : normaliseDuration(input.durationMinutes, pricing);

  const labourCents = Math.round((durationMinutes / 60) * pricing.hourlyRateCents);
  const subtotalCents = labourCents + extraFeesCents;
  const discountCents = Math.round(subtotalCents * (pricing.frequencyDiscount[input.frequency] ?? 0));

  return {
    durationMinutes,
    recommendedMinutes,
    minimumMinutes: pricing.minimumMinutes,
    maximumMinutes: pricing.maximumMinutes,
    durationStepMinutes: step,
    belowRecommendation: durationMinutes < recommendedMinutes,
    hourlyRateCents: pricing.hourlyRateCents,
    labourCents,
    extraFeesCents,
    subtotalCents,
    discountCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
    currency: 'EUR',
    pricesIncludeVat: pricing.pricesIncludeVat,
    conditionFactor: factor,
    extras,
    calculatedAt: '',
    disclaimer: '',
    baseMinutes,
    extraMinutes,
  };
}
