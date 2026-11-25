import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";

// Transactional e-mail outbox: every mail is stored first and delivered by
// the outbox (immediately after enqueueing, then retried by the worker).
// Admin → E-Mails shows the log and lets the office resend a mail.
const emailSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, trim: true, index: true },
    subject: { type: String, required: true, maxlength: 500 },
    text: { type: String, default: "" },
    html: { type: String, default: "" },
    // Which sendXxxEmail() produced it (for filtering / debugging)
    template: { type: String, default: "", index: true },
    bookingRef: { type: String, default: "", index: true },
    status: { type: String, enum: ["queued", "sent", "failed"], default: "queued", index: true },
    attempts: { type: Number, default: 0, min: 0 },
    lastError: { type: String, default: "" },
    nextAttemptAt: { type: Date, default: Date.now },
    sentAt: Date,
    // Provider response id (SMTP message id) – helps support requests
    providerMessageId: { type: String, default: "" },
    // Admin who triggered a manual resend
    resentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resentAt: Date,
    // File attachments (e.g. invoice PDF) – stored so a retry/resend sends them too
    attachments: {
      type: [
        new mongoose.Schema(
          {
            filename: { type: String, required: true, maxlength: 200 },
            contentType: { type: String, default: "application/octet-stream" },
            // Inline bytes OR a reference to object storage (e.g. the invoice PDF)
            content: { type: Buffer },
            storageKey: { type: String, default: undefined },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
  },
  { timestamps: true }
);

// Outbox job: due mails, oldest first
emailSchema.index({ status: 1, nextAttemptAt: 1 });
emailSchema.index({ status: 1, createdAt: -1 });
emailSchema.index({ createdAt: -1 });

emailSchema.plugin(testDataPlugin);

const EmailMessage = mongoose.model("EmailMessage", emailSchema);

export default EmailMessage;
