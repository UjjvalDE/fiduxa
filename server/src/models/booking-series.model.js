import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";

// A recurring cleaning plan ("Putzplan"). Created once when a booking with
// frequency weekly / biweekly / monthly is confirmed; the hourly job
// (jobs/recurring.js) turns it into real bookings ("occurrences") a few
// days ahead. Each occurrence is paid separately; the recurring discount
// applies per occurrence while the plan is active.
const templateSchema = new mongoose.Schema(
  {
    serviceId: { type: String, required: true },
    areaM2: { type: Number, required: true, min: 15, max: 1000 },
    condition: { type: String, enum: ["basic", "normal", "moderate", "heavy"], default: "normal" },
    extras: { type: [String], default: [] },
    notes: { type: String, default: "", maxlength: 1000 },
    pets: { type: Boolean, default: false },
    customerDetails: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      postcode: { type: String, required: true },
      address: { type: String, required: true },
      accessNotes: { type: String, default: "", maxlength: 1000 },
    },
    durationMinutes: { type: Number, required: true, min: 30, max: 720 },
    // Slot start "HH:MM" and weekday (0 = Sunday … 6 = Saturday, UTC calendar day)
    startTime: { type: String, required: true },
    weekday: { type: Number, min: 0, max: 6, required: true },
    frequency: { type: String, enum: ["weekly", "biweekly", "monthly"], required: true },
    locale: { type: String, enum: ["de", "en", "pl"], default: "de" },
    // cash = cleaner collects, invoice = confirmed + billed, online = pay link per occurrence
    paymentMethod: { type: String, enum: ["cash", "invoice", "online"], required: true },
  },
  { _id: false }
);

const bookingSeriesSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    template: { type: templateSchema, required: true },
    status: { type: String, enum: ["active", "paused", "ended"], default: "active", index: true },
    // Cleaner the customer wants again (feedback "keepCleaner = same"); gets
    // every new occurrence exclusively for RECURRING.priorityHours.
    preferredWorker: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Next calendar day (UTC midnight) an occurrence is due
    nextDate: { type: Date, required: true },
    // Paused until this day (null = until the customer resumes)
    pausedUntil: { type: Date, default: null },
    // The first booking this plan was created from (one plan per booking)
    createdFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    lastGeneratedDate: { type: Date, default: null },
    counters: {
      generated: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
    },
    // Why the last occurrence could not be created (admin was emailed once)
    lastProblem: {
      type: new mongoose.Schema(
        {
          date: Date,
          reason: { type: String, enum: ["no_window", "no_capacity", "pricing", "error"] },
          message: { type: String, maxlength: 500, default: "" },
          at: Date,
        },
        { _id: false }
      ),
      default: null,
    },
    endedAt: { type: Date, default: null },
    endedReason: { type: String, enum: ["customer", "admin", "system", null], default: null },
  },
  { timestamps: true }
);

// Generation job: active plans whose next date is inside the look-ahead window
bookingSeriesSchema.index({ status: 1, nextDate: 1 });

bookingSeriesSchema.plugin(testDataPlugin);

const BookingSeries = mongoose.model("BookingSeries", bookingSeriesSchema);

export default BookingSeries;
