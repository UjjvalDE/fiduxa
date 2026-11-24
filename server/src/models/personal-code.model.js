import mongoose from "mongoose";

// Personal, single-use code of ONE customer for a promotion (e.g. the 10 %
// welcome offer). The discount rules live once on the Promotion; this small
// document only links code ↔ customer ↔ state, so millions of customers do not
// mean millions of promotions.
//   issued → reserved (booking created) → used (booking confirmed)
//   reserved → issued (booking cancelled/expired before the cleaning)
//   issued → expired (validity over) · revoked (admin)
const personalCodeSchema = new mongoose.Schema(
  {
    promotion: { type: mongoose.Schema.Types.ObjectId, ref: "Promotion", required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    code: { type: String, required: true }, // e.g. FX-7KQ2-M9TP
    status: { type: String, enum: ["issued", "reserved", "used", "expired", "revoked"], default: "issued" },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
    expiresAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
    emailedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Lookup by code (checkout) and "one code per customer and promotion"
personalCodeSchema.index({ code: 1 }, { unique: true });
personalCodeSchema.index({ promotion: 1, customer: 1 }, { unique: true });
// Expiry job + admin statistics per promotion
personalCodeSchema.index({ status: 1, expiresAt: 1 });
personalCodeSchema.index({ promotion: 1, status: 1 });

const PersonalCode = mongoose.model("PersonalCode", personalCodeSchema);

export default PersonalCode;
