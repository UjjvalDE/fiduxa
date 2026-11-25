import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";

// Customer complaints against the cleaning / cleaner of a booking.
//   status: open → in_review → resolved | rejected
//   actions[]: resolution log – every remedy (refund, voucher, re-clean …) and
//              every cleaner restriction (warning, suspension, block) the
//              office took. Internal notes are never shown to the customer;
//              the cleaner only sees category, status and their restriction.
export const COMPLAINT_CATEGORIES = ["quality", "damage", "lateness", "no_show", "behaviour", "other"];
export const COMPLAINT_STATUSES = ["open", "in_review", "resolved", "rejected"];
export const COMPLAINT_ACTIONS = ["refund", "voucher", "warning", "suspend", "block", "reclean", "other"];
export const COMPLAINT_PHOTO_TYPES = ["image/jpeg", "image/png"];
export const COMPLAINT_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const COMPLAINT_MAX_PHOTOS = 3;

const by = { type: mongoose.Schema.Types.ObjectId, ref: "User" };

const photoSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 200, required: true },
  type: { type: String, enum: COMPLAINT_PHOTO_TYPES, required: true },
  size: { type: Number, min: 0 },
  data: { type: Buffer, select: false },
  uploadedAt: { type: Date, default: Date.now },
});

const actionSchema = new mongoose.Schema({
  type: { type: String, enum: COMPLAINT_ACTIONS, required: true },
  amountCents: { type: Number, min: 0 },
  days: { type: Number, min: 1, max: 365 },
  until: Date, // end of a suspension
  refundId: String,
  giftCard: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCard" },
  giftCardCode: String, // shown to the customer (it is theirs)
  note: { type: String, trim: true, maxlength: 1000, default: "" },
  at: { type: Date, default: Date.now },
  by,
});

const complaintSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    bookingRef: { type: String, default: "" },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    worker: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    category: { type: String, enum: COMPLAINT_CATEGORIES, required: true },
    description: { type: String, trim: true, maxlength: 2000, required: true },
    photos: { type: [photoSchema], default: [] },
    status: { type: String, enum: COMPLAINT_STATUSES, default: "open", index: true },
    history: {
      type: [new mongoose.Schema({ status: String, at: { type: Date, default: Date.now }, by, note: { type: String, maxlength: 1000, default: "" } }, { _id: false })],
      default: [],
    },
    actions: { type: [actionSchema], default: [] },
    internalNotes: {
      type: [new mongoose.Schema({ body: { type: String, trim: true, maxlength: 2000, required: true }, at: { type: Date, default: Date.now }, by })],
      default: [],
    },
    // Customer-facing outcome (resolved: summary, rejected: reason)
    resolution: {
      message: { type: String, trim: true, maxlength: 2000, default: "" },
      at: Date,
      by,
    },
    customerNotifiedAt: Date,
    anonymisedAt: Date,
  },
  { timestamps: true }
);

complaintSchema.index({ status: 1, createdAt: -1 });

complaintSchema.plugin(testDataPlugin);

const Complaint = mongoose.model("Complaint", complaintSchema);

export default Complaint;
