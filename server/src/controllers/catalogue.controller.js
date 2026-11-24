import { z } from "zod";
import { EXTRAS, SERVICES, findService } from "../data/catalogue.js";
import { OPERATIONS, PRICING, PAYMENT_OPTIONS } from "../config/pricing.js";

// GET /api/v1/services
export const getServices = (req, res) => {
  res.json({ success: true, services: SERVICES });
};

// GET /api/v1/services/:serviceId
export const getService = (req, res) => {
  const service = findService(req.params.serviceId);

  if (!service) {
    return res.status(404).json({
      success: false,
      message: "Service not found.",
    });
  }

  return res.json({ success: true, service });
};

// GET /api/v1/extras?serviceId=home-cleaning
export const getExtras = (req, res) => {
  const { serviceId } = req.query;

  if (serviceId && !findService(serviceId)) {
    return res.status(404).json({
      success: false,
      message: "Service not found.",
    });
  }

  // Extras are only offered for household services
  // Extras switched off by the admin are hidden
  const extras = serviceId === "business-cleaning" ? [] : EXTRAS.filter((e) => e.active !== false);

  return res.json({ success: true, extras });
};

// GET /api/v1/pricing – public pricing basis for the prices page
export const getPublicPricing = (req, res) => {
  res.json({
    success: true,
    pricing: {
      currency: PRICING.currency,
      hourlyRateCents: PRICING.hourlyRateCents,
      minimumMinutes: PRICING.minimumMinutes,
      maximumMinutes: PRICING.maximumMinutes,
      durationStepMinutes: PRICING.roundingMinutes,
      minimumChargeCents: Math.round(
        (PRICING.minimumMinutes / 60) * PRICING.hourlyRateCents
      ),
      areaM2PerHour: PRICING.areaM2PerHour,
      conditionFactor: PRICING.conditionFactor,
      frequencyDiscount: PRICING.frequencyDiscount,
      pricesIncludeVat: PRICING.pricesIncludeVat,
      holdMinutes: OPERATIONS.holdMinutes,
      cancellationCutoffHours: OPERATIONS.cancellationCutoffHours,
      maxBookingDaysAhead: OPERATIONS.maxBookingDaysAhead,
      startStepMinutes: OPERATIONS.startStepMinutes,
      cashEnabled: PAYMENT_OPTIONS.cashEnabled,
    },
  });
};

// POST /api/v1/service-area/check  { postcode }
export const checkServiceArea = (req, res) => {
  const parsed = z
    .object({ postcode: z.string().trim().regex(/^\d{5}$/) })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(422).json({
      success: false,
      message: "Please enter a valid 5-digit postcode.",
    });
  }

  const serviceable = OPERATIONS.servicePostcodeRegex.test(
    parsed.data.postcode
  );

  return res.json({
    success: true,
    postcode: parsed.data.postcode,
    serviceable,
    message: serviceable
      ? "We are available in your area."
      : "This postcode is not yet in our service area.",
  });
};
