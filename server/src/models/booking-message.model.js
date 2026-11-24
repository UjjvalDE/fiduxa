import mongoose from "mongoose";

// Questions & answers about one booking. Visible to the customer,
// the assigned cleaner and the office (no live chat, just a thread).
const bookingMessageSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    authorRole: { type: String, enum: ["consumer", "worker", "admin"], required: true },
    body: { type: String, trim: true, minlength: 1, maxlength: 2000, required: true },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

bookingMessageSchema.index({ booking: 1, createdAt: 1 });

const BookingMessage = mongoose.model("BookingMessage", bookingMessageSchema);

export default BookingMessage;
