import mongoose from "mongoose";

// A Fiduxa gift card = prepaid money (Mehrzweck-Gutschein), NOT a discount.
// The balance only changes through atomic updates in gift-card.service.js,
// each recorded in GiftCardTransaction.
const giftCardSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true }, // e.g. FIDX-7KQ2-M9TP-4WXC
    status: {
      type: String,
      enum: ["pending_payment", "active", "redeemed", "expired", "disabled", "cancelled"],
      default: "pending_payment",
      index: true,
    },
    initialCents: { type: Number, required: true, min: 0 },
    balanceCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR" },

    purchaser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    senderName: { type: String, trim: true, maxlength: 100, default: "" },
    senderEmail: { type: String, trim: true, lowercase: true, default: "" },
    recipientName: { type: String, trim: true, maxlength: 100, default: "" },
    recipientEmail: { type: String, trim: true, lowercase: true, default: "" },
    message: { type: String, trim: true, maxlength: 500, default: "" },
    design: { type: String, enum: ["classic", "festive", "spring", "thanks"], default: "classic" },
    locale: { type: String, enum: ["de", "en", "pl"], default: "de" },

    deliverAt: { type: Date, default: null }, // null = right after payment
    deliveredAt: { type: Date, default: null },
    deliveryStatus: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },

    // Purchase payment
    payment: {
      method: { type: String, enum: ["stripe", "paypal", "admin"], default: null },
      paidAt: Date,
      checkoutSessionId: { type: String, default: null },
      payable: { type: Boolean, default: true },
    },
    pendingExpiresAt: { type: Date, default: null, index: true },

    expiresAt: { type: Date, default: null, index: true },
    disabledReason: { type: String, default: "" },
    // Issued by an admin (goodwill, marketing) instead of purchased
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

giftCardSchema.index({ createdAt: -1 });
giftCardSchema.index({ status: 1, deliverAt: 1, deliveryStatus: 1 });

const GiftCard = mongoose.model("GiftCard", giftCardSchema);

export default GiftCard;
