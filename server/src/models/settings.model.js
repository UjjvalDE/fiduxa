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
    },

    extras: { type: [extraOverrideSchema], default: [] },

    booking: {
      // Start times are offered every N minutes inside an availability window
      startStepMinutes: { type: Number, enum: [15, 30, 60] },
      maxBookingDaysAhead: { type: Number, min: 7, max: 365 },
      cancellationCutoffHours: { type: Number, min: 0, max: 168 },
      // Minutes kept free between two jobs of the same team (counts for capacity)
      teamBufferMinutes: { type: Number, min: 0, max: 120 },
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
    },

    // Default data already created once (so deleted defaults are not re-created)
    seeds: { type: [String], default: [] },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings;
