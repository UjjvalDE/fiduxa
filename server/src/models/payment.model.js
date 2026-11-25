import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";

// One record per checkout attempt (blueprint §15 "payments" collection).
// The webhook – never the browser redirect – moves a payment to "paid".
const paymentSchema = new mongoose.Schema(
  {
    // What is paid: a booking, a gift card purchase or a price adjustment
    // (difference after an edit / duration review of an already paid booking)
    purpose: { type: String, enum: ["booking", "gift_card", "adjustment"], default: "booking" },
    // purpose "adjustment": id of the booking.priceAdjustments entry
    adjustment: { type: mongoose.Schema.Types.ObjectId, default: null },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },
    giftCard: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCard", default: null, index: true },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    provider: { type: String, enum: ["stripe", "paypal", "cash"], default: "stripe" },
    // Stripe: Checkout Session id · PayPal: order id
    // Dev/test only (PAYPAL_SIMULATE=true): order "approved" via the simulator –
    // capturePayPalOrder() then completes it without calling PayPal.
    simulatedApprovalAt: { type: Date, default: null },
    checkoutSessionId: { type: String, required: true, unique: true },
    // Stripe: PaymentIntent id · PayPal: capture id
    paymentIntentId: { type: String, default: null, index: true },
    amountCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR" },
    status: {
      type: String,
      // partially_refunded = 0 < refundedCents < amountCents
      enum: ["created", "processing", "paid", "failed", "expired", "refunded", "partially_refunded"],
      default: "created",
    },
    checkoutUrl: { type: String, default: "" },
    expiresAt: Date,
    paidAt: Date,
    refundedAt: Date,
    // Last provider refund id (kept for older records); every refund is in `refunds`
    refundId: { type: String, default: null },
    // Cumulative refunded amount and the individual (partial) refunds
    refundedCents: { type: Number, min: 0, default: 0 },
    refunds: {
      type: [
        new mongoose.Schema(
          {
            amountCents: { type: Number, required: true, min: 1 },
            reason: { type: String, maxlength: 500, default: "" },
            refundId: { type: String, default: null },
            at: { type: Date, default: Date.now },
            by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    failureReason: { type: String, default: "" },
  },
  { timestamps: true }
);

paymentSchema.index({ createdAt: -1 });
// Admin list filtered by status, newest first
paymentSchema.index({ status: 1, createdAt: -1 });

paymentSchema.plugin(testDataPlugin);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
