import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";

// Public "Become a cleaner" application. The admin reviews it and – if it
// fits – sends the normal worker invitation (creates the worker account).
// GDPR: CVs are deleted automatically after the retention period.
export const WORK_PERMITS = ["german", "eu", "settled", "residence_work", "blue_card", "asylum_permit", "none"];
export const HOURS_OPTIONS = ["5-15", "15-30", "31+"];
export const EXPERIENCE_OPTIONS = ["none", "lt2", "gt2", "gt5"];
export const EXPERIENCE_PLACES = ["homes", "hotels", "clinics", "offices"];
export const VEHICLES = ["car", "scooter", "bicycle", "none"];
export const SOURCES = ["social", "friends", "news", "event", "tv_radio", "job_portal", "other"];
export const APPLICATION_STATUSES = ["new", "contacted", "invited", "rejected"];

const workerApplicationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, index: true },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    postcode: { type: String, required: true, trim: true, maxlength: 10 },
    languages: { type: [String], default: [] },
    permit: { type: String, enum: WORK_PERMITS, required: true },
    hoursPerWeek: { type: String, enum: HOURS_OPTIONS, required: true },
    experience: { type: String, enum: EXPERIENCE_OPTIONS, required: true },
    experiencePlaces: { type: [{ type: String, enum: EXPERIENCE_PLACES }], default: [] },
    vehicle: { type: String, enum: VEHICLES, required: true },
    source: { type: String, enum: SOURCES, required: true },
    message: { type: String, trim: true, maxlength: 1000, default: "" },
    locale: { type: String, enum: ["de", "en", "pl"], default: "de" },
    cv: {
      data: { type: Buffer, select: false },
      name: { type: String, maxlength: 200 },
      type: { type: String, maxlength: 100 },
      size: Number,
    },
    privacyAcceptedAt: { type: Date, required: true },
    status: { type: String, enum: APPLICATION_STATUSES, default: "new", index: true },
    adminNote: { type: String, trim: true, maxlength: 1000, default: "" },
    invitedWorker: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    statusChangedAt: Date,
  },
  { timestamps: true }
);

workerApplicationSchema.index({ status: 1, createdAt: -1 });
workerApplicationSchema.plugin(testDataPlugin);

const WorkerApplication = mongoose.model("WorkerApplication", workerApplicationSchema);

export default WorkerApplication;
