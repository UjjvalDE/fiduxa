import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";

// Admin-managed promotions: automatic welcome offer, seasonal campaigns and
// coupon codes. Content for homepage banners lives here too, so campaigns
// change without code changes. Gift cards are a separate model (money, not discounts).
const localizedText = {
  de: { type: String, trim: true, default: "" },
  en: { type: String, trim: true, default: "" },
  pl: { type: String, trim: true, default: "" },
};

const promotionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // welcome = automatic first-booking offer · campaign = seasonal/marketing · coupon = code only
    kind: { type: String, enum: ["welcome", "campaign", "coupon"], required: true },
    // Optional code (uppercase). Without code a campaign applies automatically.
    code: { type: String, trim: true, uppercase: true, default: null },

    discountType: { type: String, enum: ["percent", "fixed"], required: true },
    // percent: 1–100 · fixed: cents
    discountValue: { type: Number, required: true, min: 0 },
    maxDiscountCents: { type: Number, min: 0, default: null },
    minOrderCents: { type: Number, min: 0, default: 0 },
    // Empty = all household services
    services: { type: [String], default: [] },
    firstBookingOnly: { type: Boolean, default: false },
    requiresVerifiedEmail: { type: Boolean, default: false },

    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    active: { type: Boolean, default: true },

    usageLimit: { type: Number, min: 1, default: null }, // total redemptions
    perCustomerLimit: { type: Number, min: 1, default: 1 },
    usedCount: { type: Number, default: 0 }, // reserved + applied redemptions
    // Welcome offer: every verified customer gets a personal single-use code
    // (PersonalCode) valid for this many days (capped at endsAt)
    codeValidityDays: { type: Number, min: 1, max: 730, default: 90 },

    // Homepage / checkout presentation
    display: {
      placement: { type: String, enum: ["none", "hero", "banner", "card"], default: "none" },
      priority: { type: Number, default: 0 },
      title: localizedText,
      text: localizedText,
      ctaText: localizedText,
      ctaHref: { type: String, trim: true, default: "/buchung" },
      imageUrl: { type: String, trim: true, default: "" },
      theme: { type: String, enum: ["pine", "festive", "spring", "summer", "autumn", "winter", "sale"], default: "pine" },
      badge: localizedText, // e.g. "-10 %"
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

promotionSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $type: "string" } } });
promotionSchema.index({ active: 1, startsAt: 1, endsAt: 1 });

promotionSchema.plugin(testDataPlugin);

const Promotion = mongoose.model("Promotion", promotionSchema);

export default Promotion;
