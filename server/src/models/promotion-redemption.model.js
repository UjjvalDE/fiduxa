import mongoose from "mongoose";

// One promotion use on one booking. reserved = booking created (not paid yet),
// applied = booking confirmed/paid, released = booking cancelled/expired before
// completion (the customer may use the offer again).
const promotionRedemptionSchema = new mongoose.Schema(
  {
    promotion: { type: mongoose.Schema.Types.ObjectId, ref: "Promotion", required: true, index: true },
    kind: { type: String, enum: ["welcome", "campaign", "coupon"], required: true },
    code: { type: String, default: null },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    discountCents: { type: Number, required: true, min: 0 },
    orderCents: { type: Number, required: true, min: 0 }, // price before the discount
    status: { type: String, enum: ["reserved", "applied", "released"], default: "reserved", index: true },
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

// Per-customer limit check
promotionRedemptionSchema.index({ promotion: 1, customer: 1, status: 1 });
promotionRedemptionSchema.index({ kind: 1, status: 1, "fingerprint.phone": 1 });
promotionRedemptionSchema.index({ kind: 1, status: 1, "fingerprint.email": 1 });
promotionRedemptionSchema.index({ kind: 1, status: 1, "fingerprint.address": 1 });

const PromotionRedemption = mongoose.model("PromotionRedemption", promotionRedemptionSchema);

export default PromotionRedemption;
