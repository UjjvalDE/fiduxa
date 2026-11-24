import mongoose from "mongoose";

const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 100 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: "", maxlength: 30 },
    subject: { type: String, default: "", maxlength: 200 },
    message: { type: String, required: true, maxlength: 3000 },
    status: {
      type: String,
      enum: ["new", "in_progress", "closed"],
      default: "new",
    },
    privacyAcceptedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

contactMessageSchema.index({ createdAt: -1 });
contactMessageSchema.index({ status: 1, createdAt: -1 });

const ContactMessage = mongoose.model("ContactMessage", contactMessageSchema);

export default ContactMessage;
