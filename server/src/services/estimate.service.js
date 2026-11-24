import { PRICING } from "../config/pricing.js";
import { extraAvailableFor, findExtra, findService } from "../data/catalogue.js";

// Server-side duration + price estimate (blueprint §8–9).
// The returned object is stored on the booking as a price snapshot so later
// catalogue or rate changes never rewrite old bookings.
export const createEstimate = ({
  serviceId,
  areaM2,
  condition = "normal",
  bathrooms = 1,
  frequency = "one-time",
  extras = [],
  // Optional: hours chosen by the customer (blueprint §5 step 6 – manual
  // adjustment within configured limits). Defaults to the recommendation.
  durationMinutes: requestedMinutes,
}) => {
  const factor =
    PRICING.conditionFactor[condition] ?? PRICING.conditionFactor.normal;
  // Deep cleaning / end-of-tenancy need more time per m² (service.timeFactor)
  const serviceFactor = findService(serviceId)?.timeFactor ?? 1;

  const baseMinutes = (areaM2 / PRICING.areaM2PerHour) * 60 * serviceFactor;

  // Snapshot of selected extras (unknown IDs ignored, duplicates removed)
  const seen = new Set();
  const extraItems = extras
    .map(findExtra)
    // Unknown IDs and extras not offered for this service are ignored
    .filter((extra) => extra && extraAvailableFor(extra, serviceId) && !seen.has(extra.id) && seen.add(extra.id))
    .map(({ id, label, minutes, priceCents }) => ({
      id,
      label,
      minutes,
      priceCents,
    }));

  const bathroomMinutes = Math.max(0, Math.min(6, Math.round(Number(bathrooms) || 1)) - 1) * (PRICING.bathroomMinutes ?? 20);
  const extraMinutes = extraItems.reduce((sum, e) => sum + e.minutes, 0) + bathroomMinutes;
  const extraFeesCents = extraItems.reduce((sum, e) => sum + e.priceCents, 0);

  const step = PRICING.roundingMinutes;
  const recommendedMinutes = Math.min(
    PRICING.maximumMinutes,
    Math.max(
      PRICING.minimumMinutes,
      Math.ceil((baseMinutes * factor + extraMinutes) / step) * step
    )
  );

  const durationMinutes =
    requestedMinutes == null
      ? recommendedMinutes
      : Math.min(
          PRICING.maximumMinutes,
          Math.max(
            PRICING.minimumMinutes,
            Math.ceil(requestedMinutes / step) * step
          )
        );

  const labourCents = Math.round(
    (durationMinutes / 60) * PRICING.hourlyRateCents
  );
  const subtotalCents = labourCents + extraFeesCents;
  const discountRate = PRICING.frequencyDiscount[frequency] ?? 0;
  const discountCents = Math.round(subtotalCents * discountRate);
  const totalCents = Math.max(0, subtotalCents - discountCents);

  return {
    durationMinutes,
    recommendedMinutes,
    minimumMinutes: PRICING.minimumMinutes,
    maximumMinutes: PRICING.maximumMinutes,
    durationStepMinutes: step,
    belowRecommendation: durationMinutes < recommendedMinutes,
    hourlyRateCents: PRICING.hourlyRateCents,
    labourCents,
    extraFeesCents,
    subtotalCents,
    discountCents,
    totalCents,
    currency: PRICING.currency,
    pricesIncludeVat: PRICING.pricesIncludeVat,
    conditionFactor: factor,
    extras: extraItems,
    calculatedAt: new Date().toISOString(),
    disclaimer:
      "Die angezeigte Dauer ist eine unverbindliche Schätzung. Der tatsächliche Zeitbedarf hängt von Zustand, Einrichtung, Zugänglichkeit und ausgewählten Zusatzleistungen ab. Bei besonderen Anforderungen prüfen wir die Anfrage vor der verbindlichen Bestätigung.",
  };
};
