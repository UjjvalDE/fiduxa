import mongoose from "mongoose";
import { ALL_BOOKING_STATUSES } from "../config/pricing.js";

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, maxlength: 500, default: "" },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    serviceId: {
      type: String,
      required: true,
    },

    areaM2: {
      type: Number,
      required: true,
      min: 15,
      max: 1000,
    },

    condition: {
      type: String,
      enum: ["basic", "normal", "moderate", "heavy"],
      default: "normal",
    },

    // "monthly" means every 4 weeks (Alle 4 Wochen)
    frequency: {
      type: String,
      enum: ["one-time", "weekly", "biweekly", "monthly"],
      default: "one-time",
    },

    extras: {
      type: [String],
      default: [],
    },

    customerDetails: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      postcode: { type: String, required: true },
      address: { type: String, required: true },
      accessNotes: { type: String, default: "", maxlength: 1000 },
    },

    // Calendar day stored as UTC midnight
    preferredDate: {
      type: Date,
      required: true,
    },

    // Slot start "HH:MM" (legacy records: "morning" / "afternoon")
    slot: {
      type: String,
      required: true,
    },
    slotEnd: { type: String, default: "" },
    availabilitySlot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AvailabilitySlot",
      default: null,
      index: true,
    },
    // true once the reserved slot place was given back (cancel/expiry)
    slotReleased: { type: Boolean, default: false },
    // Reservation expiry while waiting for payment (null = held indefinitely)
    holdExpiresAt: { type: Date, default: null, index: true },

    // Language for customer emails and the Stripe checkout page
    locale: { type: String, enum: ["de", "en", "pl"], default: "de" },

    notes: {
      type: String,
      default: "",
      maxlength: 1000,
    },

    // Pets in the home – only cleaners who are fine with pets get the job
    pets: { type: Boolean, default: false },

    // Price/duration snapshot calculated on the server
    estimate: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Final price snapshot: promotion, VAT, gift cards and payable amount
    // (see quote.service.js). Older bookings have no pricing → estimate.totalCents.
    pricing: {
      subtotalCents: Number,
      recurringDiscountCents: Number,
      priceCents: Number,
      promotion: { type: mongoose.Schema.Types.Mixed, default: null },
      promotionDiscountCents: { type: Number, default: 0 },
      totalCents: Number,
      vatRate: Number,
      vatCents: Number,
      giftCards: {
        type: [
          new mongoose.Schema(
            {
              giftCard: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCard" },
              codeLast4: String,
              amountCents: Number,
              // reserved → captured (paid) | released (cancelled/expired)
              state: { type: String, enum: ["reserved", "captured", "released"], default: "reserved" },
              // Incremented when the amount is reserved again (late payment)
              attempt: { type: Number, default: 0 },
            },
            { _id: false }
          ),
        ],
        default: undefined,
      },
      giftCardCents: { type: Number, default: 0 },
      payableCents: Number,
    },

    status: {
      type: String,
      enum: ALL_BOOKING_STATUSES,
      default: "payment_pending",
    },

    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },

    // Confirmation email to the customer after the request
    emailStatus: {
      type: String,
      enum: ["not_sent", "sent", "failed"],
      default: "not_sent",
    },

    quotation: {
      amountCents: { type: Number, min: 0 },
      currency: { type: String, default: "EUR" },
      message: { type: String, maxlength: 2000 },
      validUntil: Date,
      sentAt: Date,
      sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      emailStatus: {
        type: String,
        enum: ["not_sent", "sent", "failed"],
      },
      respondedAt: Date,
    },

    // Previous quotation versions (kept when the admin revises a quotation)
    quotationHistory: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    // Cleaner assignment
    assignedWorker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    assignedAt: Date,
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Job execution (cleaner portal)
    job: {
      onTheWayAt: Date,
      startedAt: Date,
      completedAt: Date,
      workerNote: { type: String, maxlength: 2000, default: "" },
      issueReported: { type: String, maxlength: 2000, default: "" },
      // Checklist items the cleaner ticked when completing (task keys)
      checklistDone: { type: [String], default: [] },
    },

    // Payment summary (details per attempt live in the Payment collection)
    payment: {
      status: {
        type: String,
        enum: ["unpaid", "pending", "paid", "failed", "refund_pending", "refunded"],
        default: "unpaid",
      },
      amountCents: { type: Number, min: 0 },
      currency: { type: String, default: "EUR" },
      paidAt: Date,
      refundedAt: Date,
      checkoutSessionId: { type: String, default: null },
      // "stripe" = online checkout, "invoice" = Stripe not configured / manual
      // gift_card = fully covered by gift cards (nothing left to pay)
      method: { type: String, enum: ["stripe", "paypal", "cash", "invoice", "gift_card"], default: "stripe" },
      // Cash at the end of the job: what the cleaner collected
      cashCollectedCents: { type: Number, min: 0 },
      cashCollectedAt: Date,
      cashCollectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },

    // Open-job marketplace: confirmed bookings are offered to free cleaners
    jobOffer: {
      notifiedAt: Date, // last time eligible cleaners were emailed
      declinedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      releasedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      unassignedAlertSentAt: Date, // admin warned that nobody took the job
    },

    // Cleaner pay for this job (created when the job is completed).
    // Paid out by the office after WORKER_PAY.payoutDelayDays.
    workerPayout: {
      amountCents: Number, // cleaner pay for the job
      rateCents: Number,
      minutes: Number,
      // Cash the cleaner kept from the customer – deducted from the payout
      cashHeldCents: { type: Number, default: 0 },
      earnedAt: Date,
      dueAt: Date,
      status: { type: String, enum: ["pending", "on_hold", "paid"] },
      paidAt: Date,
      payout: { type: mongoose.Schema.Types.ObjectId, ref: "Payout" },
    },

    // Legal consents (evidence with timestamp)
    consents: {
      // § 356 Abs. 4 BGB – customer asked us to start before the withdrawal period ends
      earlyStartRequestedAt: Date,
    },

    cancellation: {
      cancelledAt: Date,
      cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: { type: String, maxlength: 1000 },
    },

    adminNotes: {
      type: String,
      maxlength: 2000,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

bookingSchema.index({ customer: 1, createdAt: -1 });
// Open-job board and cleaner calendars
bookingSchema.index({ status: 1, assignedWorker: 1, preferredDate: 1 });
// "First booking" checks for the welcome offer
bookingSchema.index({ customer: 1, status: 1 });
// Analytics by creation date
bookingSchema.index({ createdAt: -1, status: 1 });
bookingSchema.index({ preferredDate: 1, slot: 1, status: 1 });
bookingSchema.index({ assignedWorker: 1, "workerPayout.status": 1, "workerPayout.dueAt": 1 });

// Record a status change in the booking's history
bookingSchema.methods.setStatus = function setStatus(status, userId, note = "") {
  this.status = status;
  this.statusHistory.push({
    status,
    changedAt: new Date(),
    changedBy: userId,
    note,
  });
};

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;
