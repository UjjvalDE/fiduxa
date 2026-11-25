import mongoose from "mongoose";

// Object-storage keys whose deletion failed (R2 down, credentials missing …).
// The housekeeping job retries them (file-store.service.js → processPendingDeletes).
const pendingDeleteSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, maxlength: 500 },
    reason: { type: String, maxlength: 200, default: "" },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, maxlength: 1000, default: "" },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

const PendingDelete = mongoose.model("PendingDelete", pendingDeleteSchema);
export default PendingDelete;
