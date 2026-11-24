import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";

// A settlement from the office to a cleaner covering one or more jobs.
//   provider "bank"   = the admin transferred manually and records it here
//   provider "paypal" = initiated through the PayPal Payouts API (sandbox/live)
// processing → paid | failed. Failed payouts release their jobs for a retry.
// Records created before the status field exist only as "paid".
const payoutSchema = new mongoose.Schema(
  {
    worker: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reference: { type: String, required: true, unique: true },
    status: { type: String, enum: ["processing", "paid", "failed"], default: "paid" },
    provider: { type: String, enum: ["bank", "paypal"], default: "bank" },
    // Net transfer. Negative = the cleaner kept more cash than their pay and owes the difference.
    amountCents: { type: Number, required: true },
    currency: { type: String, default: "EUR" },
    bookings: [{ type: mongoose.Schema.Types.ObjectId, ref: "Booking" }],
    bankAccountLast4: { type: String, default: "" },
    // PayPal payouts: receiver + provider references for reconciliation
    paypalEmail: { type: String, default: "" },
    providerBatchId: { type: String, default: null },
    providerItemId: { type: String, default: null },
    failureReason: { type: String, default: "" },
    initiatedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true }
);

payoutSchema.index({ status: 1, createdAt: -1 });

payoutSchema.index({ paidAt: -1 });

payoutSchema.plugin(testDataPlugin);

const Payout = mongoose.model("Payout", payoutSchema);

export default Payout;
