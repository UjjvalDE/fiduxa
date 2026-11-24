// Admin-managed platform settings (prices, extras, booking rules, payment
// options, cleaner pay). They override the defaults in config/pricing.js by
// mutating those shared objects in place, so every module sees the new values.
import Settings from "../models/settings.model.js";
import { FINANCE, GIFT_CARDS, INVOICING, OPERATIONS, PAYMENT_OPTIONS, PRICING, WORKER_PAY } from "../config/pricing.js";
import { RELIABILITY, RELIABILITY_DEFAULTS, SECURITY, SECURITY_DEFAULTS, VERIFICATION, VERIFICATION_DEFAULTS } from "../config/pricing.js"; // [E]
import { EXTRAS } from "../data/catalogue.js";
import { isPayPalConfigured, isPayPalLive } from "./paypal.service.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

// Defaults as defined in code / env (captured once at startup)
const DEFAULTS = {
  pricing: clone(PRICING),
  operations: { ...OPERATIONS },
  payments: { ...PAYMENT_OPTIONS },
  workerPay: clone(WORKER_PAY),
  giftCards: clone(GIFT_CARDS),
  finance: clone(FINANCE),
  extras: EXTRAS.map((e) => ({ id: e.id, minutes: e.minutes, priceCents: e.priceCents, active: true })),
};

const defined = (obj = {}) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));

/** Apply a settings document (or null = defaults) to the in-memory config */
export const applySettings = (doc) => {
  const s = doc?.toObject ? doc.toObject() : doc ?? {};

  const pricing = defined(s.pricing);
  Object.assign(PRICING, clone(DEFAULTS.pricing), pricing, {
    frequencyDiscount: { ...DEFAULTS.pricing.frequencyDiscount, ...defined(s.pricing?.frequencyDiscount) },
    conditionFactor: { ...DEFAULTS.pricing.conditionFactor, ...defined(s.pricing?.conditionFactor) },
  });

  Object.assign(OPERATIONS, DEFAULTS.operations, defined(s.booking));
  Object.assign(PAYMENT_OPTIONS, DEFAULTS.payments, defined(s.payments));
  const wp = defined(s.workerPay);
  const tierOverrides = s.workerPay?.commissionTiers ?? {};
  Object.assign(WORKER_PAY, clone(DEFAULTS.workerPay), wp, {
    commissionTiers: Object.fromEntries(
      Object.entries(DEFAULTS.workerPay.commissionTiers).map(([key, def]) => [key, { ...def, ...defined(tierOverrides[key]) }])
    ),
  });
  Object.assign(GIFT_CARDS, clone(DEFAULTS.giftCards), defined(s.giftCards));
  const fin = s.finance ?? {};
  Object.assign(FINANCE, clone(DEFAULTS.finance), defined({ incomeTaxRatePct: fin.incomeTaxRatePct, vatBasis: fin.vatBasis, monthlyFixedCostsCents: fin.monthlyFixedCostsCents }), {
    fees: {
      paypal: { ...DEFAULTS.finance.fees.paypal, ...defined(fin.fees?.paypal) },
      stripe: { ...DEFAULTS.finance.fees.stripe, ...defined(fin.fees?.stripe) },
    },
  });

  // [slot-A-settings-apply]
  Object.assign(OPERATIONS.recurring, OPERATIONS.recurring.defaults, defined(s.recurring));
  // [slot-B-settings-apply]
  // Invoice issuer block (defaults captured once; stored section overrides)
  if (!applySettings.invoicingDefaults) applySettings.invoicingDefaults = clone(INVOICING);
  Object.assign(INVOICING, clone(applySettings.invoicingDefaults), defined(s.invoicing));
  // [slot-C-settings-apply]
  // Money policies (cancellation / cash / payouts) – linked through OPERATIONS.policies (config/pricing.js)
  {
    const policies = OPERATIONS.policies;
    for (const section of Object.keys(policies.defaults)) {
      Object.assign(policies[section], clone(policies.defaults[section]), defined(s.policies?.[section]));
    }
  }
  // [slot-D-settings-apply]
  Object.assign(RELIABILITY, RELIABILITY_DEFAULTS, defined(s.reliability));
  Object.assign(SECURITY, SECURITY_DEFAULTS, defined(s.security));
  VERIFICATION.requiredDocuments = Array.isArray(s.verification?.requiredDocuments)
    ? [...s.verification.requiredDocuments]
    : [...VERIFICATION_DEFAULTS.requiredDocuments];
  // [slot-E-settings-apply]
  // [slot-F-settings-apply]
  const overrides = new Map((s.extras ?? []).map((e) => [e.id, e]));
  for (const extra of EXTRAS) {
    const base = DEFAULTS.extras.find((d) => d.id === extra.id);
    const o = overrides.get(extra.id) ?? {};
    extra.minutes = o.minutes ?? base.minutes;
    extra.priceCents = o.priceCents ?? base.priceCents;
    extra.active = o.active ?? true;
  }
};

export const loadSettings = async () => {
  const doc = await Settings.findOne({ key: "platform" });
  applySettings(doc);
  return doc;
};

/** Effective values for the admin form */
export const settingsView = () => ({
  pricing: {
    hourlyRateCents: PRICING.hourlyRateCents,
    minimumMinutes: PRICING.minimumMinutes,
    maximumMinutes: PRICING.maximumMinutes,
    roundingMinutes: PRICING.roundingMinutes,
    areaM2PerHour: PRICING.areaM2PerHour,
    vatRate: PRICING.vatRate,
    frequencyDiscount: {
      weekly: PRICING.frequencyDiscount.weekly,
      biweekly: PRICING.frequencyDiscount.biweekly,
      monthly: PRICING.frequencyDiscount.monthly,
    },
    conditionFactor: {
      basic: PRICING.conditionFactor.basic,
      normal: PRICING.conditionFactor.normal,
      moderate: PRICING.conditionFactor.moderate,
      heavy: PRICING.conditionFactor.heavy,
    },
  },
  extras: EXTRAS.map((e) => ({
    id: e.id,
    label: e.label,
    labelEn: e.labelEn,
    minutes: e.minutes,
    priceCents: e.priceCents,
    active: e.active !== false,
    defaultMinutes: DEFAULTS.extras.find((d) => d.id === e.id)?.minutes,
  })),
  booking: {
    startStepMinutes: OPERATIONS.startStepMinutes,
    maxBookingDaysAhead: OPERATIONS.maxBookingDaysAhead,
    cancellationCutoffHours: OPERATIONS.cancellationCutoffHours,
    teamBufferMinutes: OPERATIONS.teamBufferMinutes,
  },
  payments: {
    cashEnabled: PAYMENT_OPTIONS.cashEnabled,
    paypalEnabled: PAYMENT_OPTIONS.paypalEnabled,
    stripeEnabled: PAYMENT_OPTIONS.stripeEnabled,
    paypalConfigured: isPayPalConfigured(),
    paypalMode: isPayPalLive() ? "live" : "sandbox",
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
  },
  workerPay: {
    hourlyRateCents: WORKER_PAY.hourlyRateCents,
    payoutDelayDays: WORKER_PAY.payoutDelayDays,
    payModel: WORKER_PAY.payModel,
    commissionTiers: clone(WORKER_PAY.commissionTiers),
  },
  giftCards: { ...GIFT_CARDS },
  finance: clone(FINANCE),
  // [slot-A-settings-view]
  recurring: { ...OPERATIONS.recurring },
  // [slot-B-settings-view]
  invoicing: clone(INVOICING),
  // [slot-C-settings-view]
  policies: clone(OPERATIONS.policies),
  // [slot-D-settings-view]
  reliability: { ...RELIABILITY },
  security: { ...SECURITY },
  verification: { requiredDocuments: [...VERIFICATION.requiredDocuments] },
  // [slot-E-settings-view]
  // [slot-F-settings-view]
});

/** Save the admin's settings (sections replace the stored ones) and apply them */
export const saveSettings = async (data, adminId) => {
  const set = { updatedBy: adminId };
  for (const section of ["pricing", "booking", "payments", "workerPay", "extras", "giftCards", "finance", "recurring", "invoicing", "reliability", "security", "verification", "policies" /* [slot-sections] */]) {
    if (data[section] !== undefined) set[section] = data[section];
  }
  const doc = await Settings.findOneAndUpdate(
    { key: "platform" },
    { $set: set },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
  );
  applySettings(doc);
  return settingsView();
};
