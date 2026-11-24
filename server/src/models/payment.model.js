import mongoose from "mongoose";

// One record per checkout attempt (blueprint §15 "payments" collection).
// The webhook – never the browser redirect – moves a payment to "paid".
const paymentSchema = new mongoose.Schema(
  {
    // What is paid: a booking or a gift card purchase
    purpose: { type: String, enum: ["booking", "gift_card"], default: "booking", index: true },
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
    checkoutSessionId: { type: String, required: true, unique: true },
    // Stripe: PaymentIntent id · PayPal: capture id
    paymentIntentId: { type: String, default: null, index: true },
    amountCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR" },
    status: {
      type: String,
      enum: ["created", "processing", "paid", "failed", "expired", "refunded"],
      default: "created",
      index: true,
    },
    checkoutUrl: { type: String, default: "" },
    expiresAt: Date,
    paidAt: Date,
    refundedAt: Date,
    refundId: { type: String, default: null },
    failureReason: { type: String, default: "" },
  },
  { timestamps: true }
);

paymentSchema.index({ createdAt: -1 });

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
