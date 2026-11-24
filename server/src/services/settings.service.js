// Admin-managed platform settings (prices, extras, booking rules, payment
// options, cleaner pay). They override the defaults in config/pricing.js by
// mutating those shared objects in place, so every module sees the new values.
import Settings from "../models/settings.model.js";
import { GIFT_CARDS, OPERATIONS, PAYMENT_OPTIONS, PRICING, WORKER_PAY } from "../config/pricing.js";
import { EXTRAS } from "../data/catalogue.js";
import { isPayPalConfigured, isPayPalLive } from "./paypal.service.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

// Defaults as defined in code / env (captured once at startup)
const DEFAULTS = {
  pricing: clone(PRICING),
  operations: { ...OPERATIONS },
  payments: { ...PAYMENT_OPTIONS },
  workerPay: { ...WORKER_PAY },
  giftCards: clone(GIFT_CARDS),
  extras: EXTRAS.map((e) => ({ id: e.id, minutes: e.minutes, priceCents: e.priceCents, active: true })),
};

const defined = (obj = {}) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));

/** Apply a settings document (or null = defaults) to the in-memory config */
export const applySettings = (doc) => {
  const s = doc?.toObject ? doc.toObject() : doc ?? {};

  const pricing = defined(s.pricing);
  Object.assign(PRICING, clone(DEFAULTS.pricing), pricing, {
    frequencyDiscount: { ...DEFAULTS.pricing.frequencyDiscount, ...defined(s.pricing?.frequencyDiscount) },
  });

  Object.assign(OPERATIONS, DEFAULTS.operations, defined(s.booking));
  Object.assign(PAYMENT_OPTIONS, DEFAULTS.payments, defined(s.payments));
  Object.assign(WORKER_PAY, DEFAULTS.workerPay, defined(s.workerPay));
  Object.assign(GIFT_CARDS, clone(DEFAULTS.giftCards), defined(s.giftCards));

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
  },
  giftCards: { ...GIFT_CARDS },
});

/** Save the admin's settings (sections replace the stored ones) and apply them */
export const saveSettings = async (data, adminId) => {
  const set = { updatedBy: adminId };
  for (const section of ["pricing", "booking", "payments", "workerPay", "extras", "giftCards"]) {
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
