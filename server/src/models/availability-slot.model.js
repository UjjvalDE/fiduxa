import mongoose from "mongoose";
import { testDataPlugin } from "./plugins/test-data.plugin.js";

// An availability window published by the admin (e.g. 08:00–18:00).
// `capacity` = how many teams can work in parallel inside the window.
// Customers can start at any step that fits their job's total duration.
// Without endTime it is a legacy fixed slot (one start time).
// `booked` = number of active bookings in the window (statistics only).
const availabilitySlotSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, index: true }, // calendar day, UTC midnight
    startTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    endTime: {
      type: String,
      default: "",
      match: /^(([01]\d|2[0-3]):[0-5]\d)?$/,
    },
    capacity: { type: Number, required: true, min: 0, max: 100 },
    booked: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    note: { type: String, default: "", maxlength: 200 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  },
  { timestamps: true }
);

availabilitySlotSchema.index({ date: 1, startTime: 1 }, { unique: true });

availabilitySlotSchema.virtual("remaining").get(function remaining() {
  return Math.max(0, this.capacity - this.booked);
});

availabilitySlotSchema.set("toJSON", { virtuals: true });
availabilitySlotSchema.set("toObject", { virtuals: true });

availabilitySlotSchema.plugin(testDataPlugin);

const AvailabilitySlot = mongoose.model("AvailabilitySlot", availabilitySlotSchema);

export default AvailabilitySlot;
