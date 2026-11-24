import mongoose from "mongoose";

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
    // Hidden by the admin (abusive content etc.) – still counts for nothing
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reviewSchema.index({ worker: 1, hidden: 1, createdAt: -1 });

const Review = mongoose.model("Review", reviewSchema);

export default Review;
