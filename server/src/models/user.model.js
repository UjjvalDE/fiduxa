import mongoose from "mongoose";

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
    workerPayRateCents: { type: Number, min: 0, default: null },

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

const User = mongoose.model("User", userSchema);

export default User;
