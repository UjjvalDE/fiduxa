import mongoose from "mongoose";

// Ledger of every balance change of a gift card (audit trail).
// amountCents is signed: negative = taken from the card, positive = credited.
const giftCardTransactionSchema = new mongoose.Schema(
  {
    giftCard: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCard", required: true, index: true },
    type: {
      type: String,
      enum: ["purchase", "issue", "reserve", "capture", "release", "refund", "adjust", "expire"],
      required: true,
    },
    amountCents: { type: Number, required: true },
    balanceAfterCents: { type: Number, required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    // Idempotency: one reserve/release/capture per card and booking
    idempotencyKey: { type: String, default: null },
  },
  { timestamps: true }
);

giftCardTransactionSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);
giftCardTransactionSchema.index({ booking: 1 });

const GiftCardTransaction = mongoose.model("GiftCardTransaction", giftCardTransactionSchema);

export default GiftCardTransaction;
