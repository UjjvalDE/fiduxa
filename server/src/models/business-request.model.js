import mongoose from "mongoose";

// B2B quotation pipeline (blueprint §12)
export const BUSINESS_REQUEST_STATUSES = [
  "new_request",
  "under_review",
  "site_visit_required",
  "quote_draft",
  "sent_to_customer",
  "accepted",
  "declined",
  "expired",
  "contracted",
  "scheduled",
];

const businessRequestSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },

    company: {
      name: { type: String, required: true, maxlength: 200 },
      legalForm: { type: String, default: "", maxlength: 50 },
      vatId: { type: String, default: "", maxlength: 30 },
      contactPerson: { type: String, required: true, maxlength: 100 },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, required: true, maxlength: 30 },
    },

    site: {
      address: { type: String, required: true, maxlength: 250 },
      postcode: { type: String, required: true },
      accessInstructions: { type: String, default: "", maxlength: 1000 },
      parkingNotes: { type: String, default: "", maxlength: 500 },
    },

    premises: {
      type: {
        type: String,
        enum: ["office", "shop", "practice", "stairwell", "other"],
        required: true,
      },
      areaM2: { type: Number, min: 1, max: 100000, required: true },
      floors: { type: Number, min: 0, max: 200, default: 1 },
      rooms: { type: Number, min: 0, max: 1000, default: 0 },
      sanitaryFacilities: { type: Number, min: 0, max: 500, default: 0 },
      hasKitchenette: { type: Boolean, default: false },
    },

    service: {
      types: {
        type: [String],
        enum: ["maintenance", "deep-clean", "windows", "carpet", "disinfection", "custom"],
        default: ["maintenance"],
      },
      frequency: {
        type: String,
        enum: ["one-time", "daily", "several-weekly", "weekly", "biweekly", "monthly", "custom"],
        default: "weekly",
      },
      preferredTime: { type: String, default: "", maxlength: 200 },
      description: { type: String, default: "", maxlength: 3000 },
    },

    operations: {
      startDate: Date,
      contractDuration: { type: String, default: "", maxlength: 100 },
      materialsProvidedBy: {
        type: String,
        enum: ["fiduxa", "customer", "to-discuss"],
        default: "to-discuss",
      },
      securityRequirements: { type: String, default: "", maxlength: 1000 },
    },

    consent: {
      privacyAcceptedAt: { type: Date, required: true },
      marketing: { type: Boolean, default: false },
    },

    status: {
      type: String,
      enum: BUSINESS_REQUEST_STATUSES,
      default: "new_request",
    },

    locale: { type: String, enum: ["de", "en", "pl"], default: "de" },
    adminNotes: { type: String, default: "", maxlength: 3000 },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

businessRequestSchema.index({ createdAt: -1 });
businessRequestSchema.index({ status: 1, createdAt: -1 });

const BusinessRequest = mongoose.model("BusinessRequest", businessRequestSchema);

export default BusinessRequest;
