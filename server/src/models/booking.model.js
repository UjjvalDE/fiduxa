import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";
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
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

    bathrooms: { type: Number, min: 1, max: 6, default: 1 },

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

    // Recurring plan this booking belongs to (see booking-series.model.js) and its position in it
    series: { type: mongoose.Schema.Types.ObjectId, ref: "BookingSeries", default: null },
    seriesIndex: { type: Number, default: undefined },

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
    holdExpiresAt: { type: Date, default: null },

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
      // No-show watch: set once when the cleaner had not checked in 15 min after the start
      noShowAlertAt: Date,
      workerNote: { type: String, maxlength: 2000, default: "" },
      issueReported: { type: String, maxlength: 2000, default: "" },
      // Checklist items the cleaner ticked when completing (task keys)
      checklistDone: { type: [String], default: [] },
      // Actual cleaning duration as reported by the cleaner (minutes)
      actualDurationMinutes: { type: Number, min: 0, max: 1440 },
      // Confirmed by the cleaner after the job day (forgot to tap Start/Done)
      lateConfirmation: { type: Boolean, default: undefined },
      // Job-confirmation watch: evening reminder to the cleaner / admin alert after the grace window
      confirmReminderAt: Date,
      stuckAlertAt: Date,
      // Cleaner reports the job did not take place → admin decides (no automatic fee)
      notHappened: {
        reportedAt: Date,
        reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: { type: String, enum: ["customer_absent", "no_access", "other"] },
        note: { type: String, maxlength: 1000, default: undefined },
        decision: { type: String, enum: ["pending", "no_access_fee", "cancel_free", "dismissed"] },
        decidedAt: Date,
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        decisionNote: { type: String, maxlength: 500, default: undefined },
      },
      // Admin override (not the normal flow): who corrected start/completion and why
      adminCorrection: {
        at: Date,
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: { type: String, maxlength: 500 },
        status: String,
      },
    },

    // Post-cleaning follow-up (feedback email, customer-reported facts)
    feedback: {
      emailedAt: Date, // "How was your cleaning?" sent once per booking
      customer: {
        actualDurationMinutes: { type: Number, min: 0, max: 1440 },
        recommend: Boolean,
        // Recurring customers: who should clean next time?
        keepCleaner: { type: String, enum: ["same", "different", "auto"] },
        // Cash bookings: the amount the customer says they handed over
        actualCashCents: { type: Number, min: 0, max: 1000000 },
        submittedAt: Date,
      },
      // Customer and cleaner reported clearly different durations – the
      // office reviews it; NO automatic extra charge ever happens.
      durationMismatch: { type: Boolean, default: false },
      // Customer-confirmed cash amount differs from what the cleaner reported
      cashMismatch: { type: Boolean, default: false },
    },

    // Price changes after an edit / duration review of an (online-paid) booking.
    // Positive deltas are paid through a pay link (Payment purpose "adjustment"),
    // negative ones are refunded; "proposed" ones wait for the customer's decision.
    priceAdjustments: {
      type: [
        new mongoose.Schema(
          {
            deltaCents: { type: Number, required: true },
            reason: { type: String, maxlength: 500, default: "" },
            // edit = admin/customer edit · duration = cleaning took longer/shorter
            kind: { type: String, enum: ["edit", "duration"], default: "edit" },
            minutes: Number, // duration adjustments: extra (+) / fewer (−) minutes
            // expired = a cleaner's extra-time request nobody answered in time
            status: { type: String, enum: ["proposed", "open", "paid", "refunded", "waived", "declined", "expired"], required: true },
            // Who started it: admin/system (edits, duration reviews) or the cleaner
            // during the job (extra-time request, see extra-time.service.js)
            origin: { type: String, enum: ["admin", "cleaner", "system"], default: undefined },
            // Cleaner requests: the customer must answer before this instant
            expiresAt: Date,
            // Cleaner requests: duration/end time before → after approval
            previousDurationMinutes: Number,
            newSlotEnd: String,
            at: { type: Date, default: Date.now },
            by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            decidedAt: Date, // customer approved/declined
            resolvedAt: Date,
            resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            // How a positive delta was settled: online | cash | invoice
            paidVia: { type: String, enum: ["online", "cash", "invoice"] },
            payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
            refundId: String,
            checkoutUrl: { type: String, default: "" },
          },
          { timestamps: false }
        ),
      ],
      default: [],
    },

    // Payment summary (details per attempt live in the Payment collection)
    payment: {
      status: {
        type: String,
        // partially_refunded = part of the paid amount went back (fee kept / price lowered)
        enum: ["unpaid", "pending", "paid", "failed", "refund_pending", "refunded", "partially_refunded"],
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
      // Recurring plans: the customer's preferred cleaner sees the job exclusively until priorityUntil
      priorityWorker: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      priorityUntil: { type: Date, default: null },
    },

    // Cleaner pay for this job (created when the job is completed).
    // Paid out by the office after WORKER_PAY.payoutDelayDays.
    workerPayout: {
      amountCents: Number, // cleaner pay for the job
      rateCents: Number,
      minutes: Number,
      // What the customer paid for the job (after discounts, incl. VAT) and
      // what stays with the platform (gross − cleaner pay − cash deductions aside)
      grossCents: Number,
      commissionCents: Number,
      // How the pay was calculated when the job completed (immutable snapshot):
      // "commission" → amount = gross × (100 − commissionPct) / 100 at tierKey;
      // "hourly" → amount = minutes/60 × rateCents. Later tier changes never
      // rewrite this record.
      // "cancellation" → the cleaner's share of a late-cancellation fee
      basis: { type: String, enum: ["commission", "hourly", "cancellation"] },
      commissionPct: Number,
      tierKey: String,
      // Cash the cleaner kept from the customer – deducted from the payout
      cashHeldCents: { type: Number, default: 0 },
      earnedAt: Date,
      dueAt: Date,
      // processing = part of a payout that is being sent via a provider
      status: { type: String, enum: ["pending", "on_hold", "processing", "paid"] },
      paidAt: Date,
      payout: { type: mongoose.Schema.Types.ObjectId, ref: "Payout" },
    },

    // Who edited what and when (customer/admin booking edits)
    changeLog: [
      {
        _id: false,
        at: Date,
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        role: { type: String, enum: ["consumer", "admin"] },
        changes: [{ _id: false, field: String, from: String, to: String }],
      },
    ],

    // Legal consents (evidence with timestamp)
    consents: {
      // § 356 Abs. 4 BGB – customer asked us to start before the withdrawal period ends
      earlyStartRequestedAt: Date,
    },

    cancellation: {
      cancelledAt: Date,
      cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: { type: String, maxlength: 1000 },
      // Late-cancellation fee (policies.cancellation): what was kept/charged,
      // what the cleaner receives, and what went back to the customer
      feeCents: { type: Number, min: 0, default: 0 },
      feePct: Number,
      cleanerCents: { type: Number, min: 0, default: 0 },
      refundCents: { type: Number, min: 0, default: 0 },
      // true = the fee was taken from the online payment; false = still owed
      // (recorded as customer.outstandingCents, settled by the office)
      charged: { type: Boolean, default: false },
      at: Date,
    },

    adminNotes: {
      type: String,
      maxlength: 2000,
      default: "",
    },

    // Invoice issued when the payment became "paid" (invoice.service.js).
    // Sequential number FX-YYYY-000001, PDF stored here (select: false).
    // Kept for 10 years (§ 147 AO) even if the customer deletes the account.
    invoice: {
      number: { type: String, default: undefined },
      issuedAt: Date,
      pdf: { type: Buffer, select: false },
      locale: { type: String, enum: ["de", "en", "pl"] },
      totalCents: Number,
      netCents: Number,
      vatCents: Number,
      vatRate: Number,
      labourCents: Number,
      extraFeesCents: Number,
      recurringDiscountCents: Number,
      promotionDiscountCents: Number,
      giftCardCents: Number,
      paidCents: Number,
      paymentMethod: String,
      // false for cash → not eligible for § 35a EStG (bank transfer/online only)
      taxDeductible: Boolean,
    },
  },
  {
    timestamps: true,
  }
);
bookingSchema.index({ "invoice.number": 1 }, { unique: true, sparse: true });
bookingSchema.index({ customer: 1, "invoice.issuedAt": -1 }, { sparse: true });

// Indexes (single-field ones that a compound index already covers were removed)
bookingSchema.index({ customer: 1, createdAt: -1 });
// Hold expiry job: status = payment_pending AND holdExpiresAt <= now
bookingSchema.index({ status: 1, holdExpiresAt: 1 });
// Open-job board and cleaner calendars
bookingSchema.index({ status: 1, assignedWorker: 1, preferredDate: 1 });
// "First booking" checks for the welcome offer
bookingSchema.index({ customer: 1, status: 1 });
// Analytics by creation date
bookingSchema.index({ createdAt: -1, status: 1 });
bookingSchema.index({ preferredDate: 1, slot: 1, status: 1 });
bookingSchema.index({ assignedWorker: 1, "workerPayout.status": 1, "workerPayout.dueAt": 1 });
// Recurring plans: never two occurrences with the same position in one series
bookingSchema.index({ series: 1, seriesIndex: 1 }, { unique: true, partialFilterExpression: { series: { $type: "objectId" } } });

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

bookingSchema.plugin(testDataPlugin);

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;
