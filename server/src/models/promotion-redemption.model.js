import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";

// One promotion use on one booking. reserved = booking created (not paid yet),
// applied = booking confirmed/paid, released = booking cancelled/expired before
// completion (the customer may use the offer again).
const promotionRedemptionSchema = new mongoose.Schema(
  {
    promotion: { type: mongoose.Schema.Types.ObjectId, ref: "Promotion", required: true },
    kind: { type: String, enum: ["welcome", "campaign", "coupon"], required: true },
    code: { type: String, default: null },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    discountCents: { type: Number, required: true, min: 0 },
    orderCents: { type: Number, required: true, min: 0 }, // price before the discount
    status: { type: String, enum: ["reserved", "applied", "released"], default: "reserved" },
    // Normalised identity markers – stop the welcome offer on duplicate accounts
    fingerprint: {
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      address: { type: String, default: "" },
    },
    releasedAt: Date,
    appliedAt: Date,
  },
  { timestamps: true }
);

// Admin redemptions list + analytics by date
promotionRedemptionSchema.index({ promotion: 1, createdAt: -1 });
promotionRedemptionSchema.index({ createdAt: -1, status: 1 });
// Per-customer limit check
promotionRedemptionSchema.index({ promotion: 1, customer: 1, status: 1 });
promotionRedemptionSchema.index({ kind: 1, status: 1, "fingerprint.phone": 1 });
promotionRedemptionSchema.index({ kind: 1, status: 1, "fingerprint.email": 1 });
promotionRedemptionSchema.index({ kind: 1, status: 1, "fingerprint.address": 1 });

promotionRedemptionSchema.plugin(testDataPlugin);

const PromotionRedemption = mongoose.model("PromotionRedemption", promotionRedemptionSchema);

export default PromotionRedemption;
