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
  // How cleaner pay is calculated for newly completed jobs:
  // "commission" – cleaner gets (100 % − tier commission) of the job total;
  // "hourly"     – legacy model: hours × hourly rate, platform keeps the rest.
  payModel: process.env.WORKER_PAY_MODEL === "hourly" ? "hourly" : "commission",
  // Rating-based commission ladder. A cleaner must meet ALL requirements of a
  // level; the highest level met applies. Admin-configurable in settings.
  // Commission base = what the customer pays for the job (pricing.totalCents:
  // after promotions/recurring discounts, incl. VAT, before gift-card
  // redemption – gift cards are a payment method, not a discount).
  commissionTiers: {
    new: { commissionPct: 25 },
    bronze: { minJobs: 10, minReviews: 8, minRating: 4.5, commissionPct: 22 },
    silver: { minJobs: 25, minReviews: 20, minRating: 4.6, commissionPct: 19 },
    gold: { minJobs: 50, minReviews: 35, minRating: 4.7, commissionPct: 16 },
    platinum: { minJobs: 100, minReviews: 70, minRating: 4.8, commissionPct: 13 },
    diamond: { minJobs: 200, minReviews: 120, minRating: 4.9, commissionPct: 10 },
  },
};

// Finance dashboard assumptions (admin-configurable). These are ESTIMATES for
// management reporting – not tax advice. Defaults: German GmbH in Berlin
// (Körperschaftsteuer 15 % + Soli 0.825 % + Gewerbesteuer Hebesatz 410 % ≈ 30 %).
export const FINANCE = {
  incomeTaxRatePct: 30,
  // "full": Fiduxa sells the cleaning → VAT on the whole customer price.
  // "commission": Fiduxa only brokers (agent model) → VAT on the commission.
  // Which applies is a legal/tax question – confirm with your tax adviser.
  vatBasis: "full",
  monthlyFixedCostsCents: 0,
  fees: {
    paypal: { pct: 2.49, fixedCents: 35 },
    stripe: { pct: 1.5, fixedCents: 25 },
  },
};

// Hard limits for every commission rate (tiers AND manual overrides).
// Each level up must be cheaper than the one below (default: −3 points).
export const COMMISSION_LIMITS = { minPct: 10, maxPct: 25 };

// [slot-A-config]
// Recurring plans (Putzplan): how far ahead occurrences are created, how long
// the preferred cleaner sees a new occurrence exclusively, pay-link hold (online)
export const RECURRING = { generateDaysAhead: 14, priorityHours: 24, onlineHoldDays: 7 };
export const RECURRING_DEFAULTS = Object.freeze({ ...RECURRING });
// Reachable as OPERATIONS.recurring from settings.service.js (non-enumerable:
// never copied by the spreads / Object.assign that apply the admin settings)
Object.defineProperty(OPERATIONS, "recurring", { value: RECURRING, enumerable: false });
Object.defineProperty(RECURRING, "defaults", { value: RECURRING_DEFAULTS, enumerable: false });
// [slot-B-config]
// Invoice issuer data (admin-configurable in Einstellungen → Rechnungen).
// Placeholders until the owner fills them in; the VAT/legal model is settled
// with the tax adviser, so VAT display and the note are configurable too.
export const INVOICING = {
  companyName: process.env.INVOICE_COMPANY_NAME || "Fiduxa GmbH",
  addressLines: (process.env.INVOICE_ADDRESS_LINES || "Putlitzstraße 4|10551 Berlin|Deutschland").split("|").map((l) => l.trim()).filter(Boolean),
  // USt-IdNr. or Steuernummer
  taxId: process.env.INVOICE_TAX_ID || "",
  email: process.env.INVOICE_EMAIL || process.env.SMTP_FROM || "",
  // Shown under the totals, e.g. "Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen."
  vatNote: process.env.INVOICE_VAT_NOTE || "",
  // false = Kleinunternehmer: no VAT line on the invoice
  showVat: process.env.INVOICE_SHOW_VAT !== "false",
};
// [slot-C-config]
// Money policies (owner-approved defaults, admin-configurable in Einstellungen):
// cancellation fees, cash limits and payout eligibility. All cents are integers.
export const POLICIES = {
  cancellation: {
    freeHours: 24, // free of charge until this many hours before the start
    lateFeePct: 50, // fee (% of the price) inside freeHours
    veryLateHours: 4, // inside this window (or no access) the full fee applies
    veryLateFeePct: 100,
    cleanerSharePct: 80, // share of any fee the assigned cleaner receives
  },
  cash: {
    maxTotalCents: 15000, // cash only up to this booking total
    minTier: "bronze", // assigned cleaner must have at least this tier
    suspendBelowCents: -10000, // cleaner net balance (pay − cash held) below → no new cash jobs
  },
  payouts: {
    eligibilityDays: 7, // weekly settlement: earnings become due after 7 days
    fastPayoutDays: 3, // Silver+: partial payout possible after 3 days …
    fastPayoutPct: 50, // … for this share of the pending amount
    fastPayoutMinTier: "silver",
  },
  // Owner decision (PayPal only for now): which customer payment methods can be
  // CHOSEN for new payments (bookings, edits, gift cards, pay links, manual
  // bookings). "stripe" (card) and "cash" stay implemented and can be switched
  // back on in Einstellungen → Richtlinien. Existing bookings that were paid
  // another way keep working (display, refunds, cash collection).
  // Office "invoice" bookings (admin manual / no provider configured) are not
  // governed by this list.
  paymentMethods: {
    enabled: ["paypal"], // subset of PAYMENT_METHOD_KEYS
  },
};
export const PAYMENT_METHOD_KEYS = ["paypal", "stripe", "cash"];
// Defaults captured once (settings.service.js merges admin overrides over them).
// settings.service.js reaches the policies through OPERATIONS (shared-slot rule:
// no new imports there); both links are non-enumerable so spreads/JSON never copy them.
Object.defineProperty(POLICIES, "defaults", { value: JSON.parse(JSON.stringify(POLICIES)), enumerable: false });
Object.defineProperty(OPERATIONS, "policies", { value: POLICIES, enumerable: false });
// [slot-D-config]
// --- Package E: trust & security -------------------------------------------
// Cleaner reliability rules (strikes). Admin-configurable in settings.
export const RELIABILITY = {
  lateReleaseHours: 24, // handing a job back closer than this = 1 strike
  strikeLimit: 3, // strikes inside the window → automatic pause
  strikeWindowDays: 90,
  strikesPerLateRelease: 1,
  strikesPerNoShow: 2,
};
export const RELIABILITY_DEFAULTS = Object.freeze({ ...RELIABILITY });

// Session lifetimes + admin two-factor policy
export const SECURITY = {
  customerSessionDays: 7, // customers / cleaners: sliding, renewed when < 1 day remains
  adminSessionHours: 24, // admins: absolute, never extended
  requireAdmin2fa: false,
};
export const SECURITY_DEFAULTS = Object.freeze({ ...SECURITY });

// Documents a cleaner must have verified before the admin can approve them
export const VERIFICATION = {
  requiredDocuments: ["id", "permit"],
};
export const VERIFICATION_DEFAULTS = Object.freeze({ requiredDocuments: [...VERIFICATION.requiredDocuments] });
export const DOCUMENT_KINDS = ["id", "permit", "gewerbe", "other"];
// [slot-E-config]
// Extra time per bathroom beyond the first (owner-approved default)
PRICING.bathroomMinutes = PRICING.bathroomMinutes ?? 20;
// [slot-F-config]
// Tier order from entry level to best (fixed keys; thresholds configurable)
export const COMMISSION_TIER_ORDER = ["new", "bronze", "silver", "gold", "platinum", "diamond"];

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
