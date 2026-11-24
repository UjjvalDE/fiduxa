import mongoose from "mongoose";

// Short-lived lock per calendar day so two customers cannot take the
// last free place at the same time (see availability.service.js).
const reservationLockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  until: { type: Date, required: true },
  token: { type: mongoose.Schema.Types.ObjectId, required: true },
});

const ReservationLock = mongoose.model("ReservationLock", reservationLockSchema);

export default ReservationLock;
