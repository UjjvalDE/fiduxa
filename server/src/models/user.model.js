import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
      maxlength: 30,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["consumer", "worker", "admin"],
      default: "consumer",
    },

    preferredLanguage: {
      type: String,
      enum: ["de", "en", "pl"],
      default: "de",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // GDPR: account anonymised (self-service or admin). Bookings/invoices
    // stay for the 10-year retention period with anonymised details.
    anonymisedAt: { type: Date, default: null },

    // Worker onboarding status
    workerStatus: {
      type: String,
      enum: [
        "not_applicable",
        "invited",
        "pending_review",
        "approved",
        "rejected",
        "suspended",
      ],
      default: "not_applicable",
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    // Customer email confirmation (link in the welcome email)
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    emailVerifiedAt: { type: Date, default: null },

    invitationTokenHash: {
      type: String,
      select: false,
    },

    invitationExpires: {
      type: Date,
      select: false,
    },

    // Password reset
    passwordResetTokenHash: {
      type: String,
      select: false,
    },

    passwordResetExpires: {
      type: Date,
      select: false,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
    },

    // Incremented on password change/reset → invalidates all older JWTs
    tokenVersion: {
      type: Number,
      default: 0,
    },

    // Worker profile
    workerProfile: {
      address: {
        type: String,
        default: "",
      },
      serviceAreas: {
        type: [String],
        default: [],
      },
      experienceYears: {
        type: Number,
        min: 0,
        default: 0,
      },
      // Public profile (shown to customers)
      bio: { type: String, trim: true, maxlength: 600, default: "" },
      languages: { type: [String], default: [] },
      specialties: { type: [String], default: [] },
      petsOk: { type: Boolean, default: false },
      bringsSupplies: { type: Boolean, default: false },
      publicVisible: { type: Boolean, default: true },
    },

    // Profile photo (small JPEG/PNG/WebP, resized in the browser)
    avatarData: { type: Buffer, select: false },
    avatarType: { type: String, default: "" },
    avatarUpdatedAt: { type: Date, default: null },

    // Weekly working hours. Empty = available whenever slots exist.
    // weekday: 1 = Monday … 7 = Sunday, times "HH:MM" (Europe/Berlin)
    availability: {
      type: [
        new mongoose.Schema(
          {
            weekday: { type: Number, min: 1, max: 7, required: true },
            start: { type: String, required: true },
            end: { type: String, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Days off (inclusive calendar days, stored as UTC midnight)
    holidays: {
      type: [
        new mongoose.Schema({
          from: { type: Date, required: true },
          to: { type: Date, required: true },
          note: { type: String, trim: true, maxlength: 200, default: "" },
        }),
      ],
      default: [],
    },

    // Individual hourly pay (cents). null = default from config (WORKER_PAY)
    // Recurring customers: preferred cleaner for the next cleanings
    recurringCleanerPreference: {
      choice: { type: String, enum: ["same", "different", "auto"] },
      worker: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: Date,
    },

    // Customers: cancellation fees that could not be taken from a payment
    // (unpaid/cash bookings). Settled by the office with the next booking.
    outstandingCents: { type: Number, min: 0, default: 0 },

    // Saved household profile (prefills the booking wizard)
    household: {
      areaM2: { type: Number, min: 15, max: 1000 },
      condition: { type: String, enum: ["basic", "normal", "moderate", "heavy"] },
      extras: { type: [String], default: undefined },
      notes: { type: String, maxlength: 1000 },
      pets: { type: Boolean },
      accessNotes: { type: String, maxlength: 1000 },
      address: { type: String, maxlength: 200 },
      postcode: { type: String, maxlength: 10 },
    },

    workerPayRateCents: { type: Number, min: 0, default: null },

    // Rating-based commission (cache of the last computed tier + admin override).
    // The computed values are refreshed by commission.service.js; the override
    // wins over the tier and is only settable by an admin with a reason.
    workerCommission: {
      tierKey: { type: String, enum: ["new", "bronze", "silver", "gold", "platinum", "diamond"], default: undefined },
      commissionPct: Number,
      computedAt: Date,
      override: {
        commissionPct: { type: Number, min: 10, max: 25 },
        reason: { type: String, trim: true, maxlength: 300 },
        admin: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: Date,
      },
    },

    // Encrypted bank details
    bankDetailsEncrypted: {
      type: String,
      select: false,
    },

    bankDetailsIv: {
      type: String,
      select: false,
    },

    bankDetailsAuthTag: {
      type: String,
      select: false,
    },

    bankAccountLast4: {
      type: String,
      default: "",
    },

    bankAccountHolder: {
      type: String,
      default: "",
    },

    // How the cleaner wants to be paid: bank transfer (IBAN above) or PayPal
    payoutMethod: {
      type: { type: String, enum: ["bank", "paypal"], default: "bank" },
      paypalEmail: { type: String, trim: true, lowercase: true, default: "" },
    },

    // --- Package E: trust & security ---------------------------------------
    // Verification documents (ID, work permit, Gewerbe …) checked by the admin.
    // File bytes are never selected by default (select: false).
    documents: {
      type: [
        new mongoose.Schema({
          kind: { type: String, enum: ["id", "permit", "gewerbe", "other"], required: true },
          name: { type: String, trim: true, maxlength: 200, required: true },
          type: { type: String, required: true },
          size: { type: Number, min: 0, required: true },
          data: { type: Buffer, select: false },
          uploadedAt: { type: Date, default: Date.now },
          status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
          note: { type: String, trim: true, maxlength: 500, default: "" },
          checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
          checkedAt: { type: Date, default: null },
        }),
      ],
      default: [],
    },

    // Reliability strikes (late hand-backs, no-shows). strikeLimit strikes
    // within strikeWindowDays pause the cleaner until an admin lifts it.
    reliability: {
      strikes: {
        type: [
          new mongoose.Schema({
            at: { type: Date, default: Date.now },
            kind: { type: String, enum: ["late_release", "no_show", "other"], required: true },
            bookingRef: { type: String, default: "" },
            note: { type: String, trim: true, maxlength: 500, default: "" },
          }),
        ],
        default: [],
      },
      pausedAt: { type: Date, default: null },
      pausedReason: { type: String, trim: true, maxlength: 300, default: "" },
    },

    // Admin two-factor authentication (TOTP). Secrets are never selected by default.
    twoFactor: {
      secret: { type: String, select: false },
      pendingSecret: { type: String, select: false },
      enabledAt: { type: Date, default: null },
    },

    // Admin review record
    workerReview: {
      reviewedAt: {
        type: Date,
        default: null,
      },
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      note: {
        type: String,
        trim: true,
        maxlength: 500,
        default: "",
      },
    },
  },
  {
    timestamps: true,
  }
);

// Cleaner matching / admin lists (role + status), new-customer analytics
userSchema.index({ role: 1, workerStatus: 1, isActive: 1 });
userSchema.index({ role: 1, createdAt: -1 });

userSchema.plugin(testDataPlugin);

const User = mongoose.model("User", userSchema);

export default User;
