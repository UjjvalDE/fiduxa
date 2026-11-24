import mongoose from "mongoose";

// A bank transfer from the office to a cleaner covering one or more jobs
const payoutSchema = new mongoose.Schema(
  {
    worker: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reference: { type: String, required: true, unique: true },
    // Net transfer. Negative = the cleaner kept more cash than their pay and owes the difference.
    amountCents: { type: Number, required: true },
    currency: { type: String, default: "EUR" },
    bookings: [{ type: mongoose.Schema.Types.ObjectId, ref: "Booking" }],
    bankAccountLast4: { type: String, default: "" },
    paidAt: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true }
);

payoutSchema.index({ paidAt: -1 });

const Payout = mongoose.model("Payout", payoutSchema);

export default Payout;
