import mongoose from "mongoose";

// Platform settings managed by the admin (single document, key "platform").
// Values are applied to the in-memory PRICING / OPERATIONS / WORKER_PAY
// objects at startup and after every change (see settings.service.js).
const extraOverrideSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    minutes: { type: Number, min: 0, max: 480 },
    priceCents: { type: Number, min: 0, max: 100000 },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "platform", unique: true },

    pricing: {
      hourlyRateCents: { type: Number, min: 500, max: 20000 },
      minimumMinutes: { type: Number, min: 30, max: 720 },
      maximumMinutes: { type: Number, min: 60, max: 720 },
      roundingMinutes: { type: Number, enum: [15, 30, 60] },
      areaM2PerHour: { type: Number, min: 5, max: 200 },
      vatRate: { type: Number, min: 0, max: 0.3 },
      frequencyDiscount: {
        weekly: { type: Number, min: 0, max: 0.5 },
        biweekly: { type: Number, min: 0, max: 0.5 },
        monthly: { type: Number, min: 0, max: 0.5 },
      },
      conditionFactor: {
        basic: { type: Number, min: 0.5, max: 1 },
        normal: { type: Number, min: 1, max: 1 },
        moderate: { type: Number, min: 1, max: 2 },
        heavy: { type: Number, min: 1, max: 3 },
      },
    },

    extras: { type: [extraOverrideSchema], default: [] },

    booking: {
      // Start times are offered every N minutes inside an availability window
      startStepMinutes: { type: Number, enum: [15, 30, 60] },
      maxBookingDaysAhead: { type: Number, min: 7, max: 365 },
      cancellationCutoffHours: { type: Number, min: 0, max: 168 },
      // Minutes kept free between two jobs of the same team (counts for capacity)
      teamBufferMinutes: { type: Number, min: 0, max: 120 },
      // Gap between two jobs of the same cleaner (dispatch, slot list, overlap check)
      travelBufferMinutes: { type: Number, min: 0, max: 180 },
    },

    payments: {
      cashEnabled: { type: Boolean },
      paypalEnabled: { type: Boolean },
      stripeEnabled: { type: Boolean },
    },

    giftCards: {
      enabled: { type: Boolean },
      presetAmountsCents: { type: [Number], default: undefined },
      minCustomCents: { type: Number, min: 500 },
      maxCustomCents: { type: Number, max: 200000 },
      validityYears: { type: Number, min: 1, max: 10 },
      maxPerBooking: { type: Number, min: 1, max: 5 },
    },

    workerPay: {
      hourlyRateCents: { type: Number, min: 0, max: 10000 },
      payoutDelayDays: { type: Number, min: 0, max: 90 },
      payModel: { type: String, enum: ["commission", "hourly"] },
      commissionTiers: {
        new: { commissionPct: { type: Number, min: 10, max: 25 } },
        bronze: { minJobs: { type: Number, min: 1, max: 100000 }, minReviews: { type: Number, min: 0, max: 100000 }, minRating: { type: Number, min: 0, max: 5 }, commissionPct: { type: Number, min: 10, max: 25 } },
        silver: { minJobs: { type: Number, min: 1, max: 100000 }, minReviews: { type: Number, min: 0, max: 100000 }, minRating: { type: Number, min: 0, max: 5 }, commissionPct: { type: Number, min: 10, max: 25 } },
        gold: { minJobs: { type: Number, min: 1, max: 100000 }, minReviews: { type: Number, min: 0, max: 100000 }, minRating: { type: Number, min: 0, max: 5 }, commissionPct: { type: Number, min: 10, max: 25 } },
        platinum: { minJobs: { type: Number, min: 1, max: 100000 }, minReviews: { type: Number, min: 0, max: 100000 }, minRating: { type: Number, min: 0, max: 5 }, commissionPct: { type: Number, min: 10, max: 25 } },
        diamond: { minJobs: { type: Number, min: 1, max: 100000 }, minReviews: { type: Number, min: 0, max: 100000 }, minRating: { type: Number, min: 0, max: 5 }, commissionPct: { type: Number, min: 10, max: 25 } },
      },
    },

    finance: {
      incomeTaxRatePct: { type: Number, min: 0, max: 60 },
      vatBasis: { type: String, enum: ["full", "commission"] },
      monthlyFixedCostsCents: { type: Number, min: 0, max: 100000000 },
      fees: {
        paypal: { pct: { type: Number, min: 0, max: 10 }, fixedCents: { type: Number, min: 0, max: 500 } },
        stripe: { pct: { type: Number, min: 0, max: 10 }, fixedCents: { type: Number, min: 0, max: 500 } },
      },
    },

    // [slot-A-settings-model]
    recurring: {
      generateDaysAhead: { type: Number, min: 1, max: 60 },
      priorityHours: { type: Number, min: 0, max: 168 },
      onlineHoldDays: { type: Number, min: 1, max: 30 },
    },
    // [slot-B-settings-model]
    invoicing: {
      companyName: { type: String, maxlength: 120 },
      addressLines: { type: [String], default: undefined },
      taxId: { type: String, maxlength: 40 },
      email: { type: String, maxlength: 254 },
      vatNote: { type: String, maxlength: 300 },
      showVat: { type: Boolean },
    },
    // [slot-C-settings-model]
    // Money policies: cancellation fees, cash limits, payout eligibility
    policies: {
      cancellation: {
        freeHours: { type: Number, min: 0, max: 168 },
        lateFeePct: { type: Number, min: 0, max: 100 },
        cleanerSharePct: { type: Number, min: 0, max: 100 },
        refundWorkingDays: { type: Number, min: 1, max: 30 },
      },
      cash: {
        maxTotalCents: { type: Number, min: 0, max: 1000000 },
        minTier: { type: String, enum: ["new", "bronze", "silver", "gold", "platinum", "diamond"] },
        suspendBelowCents: { type: Number, min: -1000000, max: 0 },
      },
      payouts: {
        payoutDayOfMonth: { type: Number, min: 1, max: 28 },
      },
      // Selectable customer payment methods (POLICIES.paymentMethods)
      paymentMethods: {
        enabled: { type: [String], enum: ["paypal", "stripe", "cash"], default: undefined },
      },
      // Automatic cleaner assignment (round 3)
      assignment: {
        mode: { type: String, enum: ["auto", "board"] },
        weights: {
          distance: { type: Number, min: 0, max: 100 },
          skills: { type: Number, min: 0, max: 100 },
          rating: { type: Number, min: 0, max: 100 },
          reliability: { type: Number, min: 0, max: 100 },
          preference: { type: Number, min: 0, max: 100 },
          workload: { type: Number, min: 0, max: 100 },
        },
        emergencyNoStrikeHours: { type: Number, min: 0, max: 336 },
        emergencyStrike: { type: Boolean },
        alternativesCount: { type: Number, min: 1, max: 10 },
        retryMinutes: { type: Number, min: 1, max: 120 },
        escalateHours: { type: Number, min: 1, max: 168 },
      },
    },
    // [slot-D-settings-model]
    reliability: {
      lateReleaseHours: { type: Number, min: 0, max: 168 },
      strikeLimit: { type: Number, min: 1, max: 20 },
      strikeWindowDays: { type: Number, min: 1, max: 365 },
    },
    security: {
      customerSessionDays: { type: Number, min: 1, max: 30 },
      adminSessionHours: { type: Number, min: 1, max: 72 },
      requireAdmin2fa: { type: Boolean },
    },
    verification: {
      requiredDocuments: { type: [String], enum: ["id", "permit", "gewerbe", "other"], default: undefined },
    },
    // [slot-E-settings-model]
    // [slot-F-settings-model]
    // Default data already created once (so deleted defaults are not re-created)
    seeds: { type: [String], default: [] },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings;
