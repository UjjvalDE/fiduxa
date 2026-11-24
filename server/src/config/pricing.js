// Central pricing & operations configuration.
// All money values are integer cents. Placeholder values – confirm with
// your accountant / business plan before launch (blueprint §9).

export const PRICING = {
  currency: "EUR",
  hourlyRateCents: Number(process.env.HOURLY_RATE_CENTS) || 2500, // €25.00 – admin can change it in Einstellungen
  minimumMinutes: 120, // 2-hour minimum
  maximumMinutes: 600, // customers can book up to 10 hours per visit
  roundingMinutes: 30, // round duration up to 30-minute steps
  areaM2PerHour: 30, // benchmark – calibrate with real Berlin jobs

  conditionFactor: {
    basic: 0.9,
    normal: 1,
    moderate: 1.25,
    heavy: 1.5,
  },

  // Recurring discounts are a business decision (blueprint: "do not assume").
  // Set a value to 0 to disable it.
  frequencyDiscount: {
    "one-time": 0,
    weekly: 0.1,
    biweekly: 0,
    monthly: 0, // "monthly" = every 4 weeks (Alle 4 Wochen)
  },

  // Whether displayed consumer prices include VAT – confirm with accountant.
  pricesIncludeVat: true,
  // German standard VAT. Set 0 for Kleinunternehmer (§ 19 UStG).
  vatRate: Number(process.env.VAT_RATE ?? 0.19),
};

export const OPERATIONS = {
  timezone: "Europe/Berlin",
  // Berlin postcodes 10115–14199
  servicePostcodeRegex: /^1[0-4]\d{3}$/,
  // A booked slot is held this long while the customer pays.
  // Must be longer than the Stripe Checkout lifetime (30 min).
  holdMinutes: Number(process.env.SLOT_HOLD_MINUTES) || 35,
  // Customers can self-cancel a confirmed booking until this many hours before.
  cancellationCutoffHours: Number(process.env.CANCELLATION_CUTOFF_HOURS) || 24,
  // How far ahead customers may book
  maxBookingDaysAhead: 90,
  // Minutes kept free between two jobs of the same cleaner (travel)
  travelBufferMinutes: Number(process.env.TRAVEL_BUFFER_MINUTES) || 30,
  // Cleaners can hand back an accepted job until this many hours before start
  workerReleaseCutoffHours: Number(process.env.WORKER_RELEASE_CUTOFF_HOURS) || 24,
  // Start times are offered every N minutes inside an availability window
  startStepMinutes: 30,
  // Minutes kept free between two jobs of the same team (capacity check)
  teamBufferMinutes: 30,
  // Warn the admin if a confirmed job has no cleaner this many hours before start
  unassignedAlertHours: Number(process.env.UNASSIGNED_ALERT_HOURS) || 48,
};

// Gift cards (Mehrzweck-Gutscheine): sold without VAT, VAT arises on redemption
export const GIFT_CARDS = {
  enabled: true,
  presetAmountsCents: [2500, 5000, 7500, 10000, 15000, 20000],
  minCustomCents: 2000,
  maxCustomCents: 50000,
  // § 195 BGB: 3 years, counted from the end of the purchase year
  validityYears: 3,
  maxPerBooking: 3,
};

// Cleaner pay (placeholder – confirm with your accountant / contracts)
// Payment options that do not depend on API keys
export const PAYMENT_OPTIONS = {
  cashEnabled: true, // pay the cleaner in cash at the end of the job
  paypalEnabled: true, // only effective with PayPal keys (see paypal.service.js)
  stripeEnabled: true, // only effective with STRIPE_SECRET_KEY
};

export const WORKER_PAY = {
  hourlyRateCents: Number(process.env.WORKER_HOURLY_RATE_CENTS) || 1800, // €18.00 / hour
  payoutDelayDays: Number(process.env.WORKER_PAYOUT_DELAY_DAYS) || 30,
};

// What cleaners can show on their public profile
export const WORKER_SPECIALTIES = [
  "home-cleaning",
  "deep-cleaning",
  "end-of-tenancy",
  "office-cleaning",
  "windows",
  "ironing",
  "laundry",
  "oven-fridge",
  "balcony",
  "eco-products",
];
export const WORKER_LANGUAGES = ["de", "en", "pl", "uk", "ru", "tr", "ar", "es", "it", "fr", "pt", "ro"];

export const SUPPORTED_LOCALES = ["de", "en", "pl"];
export const DEFAULT_LOCALE = "de";

// Booking statuses that occupy a slot.
// (pending_quotation / quotation_sent / accepted are legacy statuses from the
// earlier quotation flow – kept so old records stay valid.)
export const ACTIVE_BOOKING_STATUSES = [
  "payment_pending",
  "confirmed",
  "in_progress",
  "pending_quotation",
  "quotation_sent",
  "accepted",
];

export const ALL_BOOKING_STATUSES = [
  "payment_pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
  // legacy
  "pending_quotation",
  "quotation_sent",
  "accepted",
  "rejected",
];
