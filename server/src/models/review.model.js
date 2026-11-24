import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";

// Customer rating of a completed job (one per booking)
const reviewSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    worker: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    // Optional detail ratings
    punctuality: { type: Number, min: 1, max: 5 },
    quality: { type: Number, min: 1, max: 5 },
    friendliness: { type: Number, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000, default: "" },
    // "Would you recommend this cleaner?" from the follow-up questions
    recommend: { type: Boolean, default: undefined },
    // Hidden by the admin (abusive content etc.) – still counts for nothing
    hidden: { type: Boolean, default: false },
    // Cleaner dispute: "open" until an admin resolves it. "approved" = the
    // complaint was upheld (the review is hidden and no longer counts),
    // "rejected" = the review stands.
    dispute: {
      status: { type: String, enum: ["open", "approved", "rejected"], default: undefined },
      message: { type: String, trim: true, maxlength: 1000 },
      openedAt: Date,
      resolvedAt: Date,
      adminNote: { type: String, trim: true, maxlength: 500 },
    },
  },
  { timestamps: true }
);

reviewSchema.index({ worker: 1, hidden: 1, createdAt: -1 });
reviewSchema.index({ "dispute.status": 1, createdAt: -1 }, { sparse: true });

reviewSchema.plugin(testDataPlugin);

const Review = mongoose.model("Review", reviewSchema);

export default Review;
