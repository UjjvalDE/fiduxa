import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";

// Structured post-service feedback (one per booking and side).
//   role "customer": the customer about the cleaning (the 1–5 star cleaner
//                    rating is ALSO stored as the public Review).
//   role "worker":   the cleaner about the job / customer – INTERNAL ONLY,
//                    never returned by any customer-facing endpoint.
// status "dismissed" = the pop-up was closed without answering (no answers).
// Only numbers / enums / tags – evaluated by plain averages and counts, no AI.

export const CUSTOMER_ISSUE_TAGS = ["late", "missed_areas", "not_thorough", "damage", "communication", "unfriendly", "left_early", "supplies", "other"];
export const WORKER_DIFFICULTY_TAGS = ["no_access", "missing_supplies", "very_dirty", "more_rooms_than_booked", "pets", "time_too_short", "customer_absent", "safety", "other"];
export const WORKER_CONDITION_TAGS = ["clutter", "hoarding", "mould", "pests", "no_water_or_power", "strong_odour", "smoking", "aggressive_pet", "other"];

const score = { type: Number, min: 1, max: 5 };

const jobFeedbackSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
    role: { type: String, enum: ["customer", "worker"], required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    worker: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Copied from the booking for the per-district averages
    postcode: { type: String, default: "" },
    serviceId: { type: String, default: "" },
    status: { type: String, enum: ["submitted", "dismissed"], required: true },
    submittedAt: Date,
    dismissedAt: Date,

    customerAnswers: {
      overallExperience: score,
      cleanerRating: score, // = Review.rating
      professionalPunctual: score,
      completedAsExpected: { type: String, enum: ["yes", "partly", "no"] },
      issueTags: { type: [String], enum: CUSTOMER_ISSUE_TAGS, default: undefined },
      issueText: { type: String, trim: true, maxlength: 1000 },
    },

    // INTERNAL ONLY – never shown to the customer
    workerAnswers: {
      experience: score,
      customerRating: score,
      homeCondition: score,
      cooperative: score,
      hadDifficulties: Boolean,
      difficultyTags: { type: [String], enum: WORKER_DIFFICULTY_TAGS, default: undefined },
      difficultyText: { type: String, trim: true, maxlength: 1000 },
      conditionTags: { type: [String], enum: WORKER_CONDITION_TAGS, default: undefined },
      conditionText: { type: String, trim: true, maxlength: 1000 },
      jobDifficulty: score,
    },
  },
  { timestamps: true }
);

jobFeedbackSchema.index({ booking: 1, role: 1 }, { unique: true });
jobFeedbackSchema.index({ role: 1, status: 1, createdAt: -1 });

jobFeedbackSchema.plugin(testDataPlugin);

const JobFeedback = mongoose.model("JobFeedback", jobFeedbackSchema);

export default JobFeedback;
