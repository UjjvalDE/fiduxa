import mongoose from "mongoose";
import { z } from "zod";

import BusinessRequest, {
  BUSINESS_REQUEST_STATUSES,
} from "../models/business-request.model.js";
import { generateBookingReference } from "../utils/booking-reference.js";
import { recordAudit } from "../services/audit.service.js";
import {
  sendAdminNotificationEmail,
  sendBusinessRequestReceivedEmail,
  trySend,
} from "../services/email.service.js";
import { escapeRegex, getPagination, paginationMeta } from "../utils/helpers.js";

const businessRequestSchema = z.object({
  company: z.object({
    name: z.string().trim().min(2).max(200),
    legalForm: z.string().trim().max(50).optional().default(""),
    vatId: z.string().trim().max(30).optional().default(""),
    contactPerson: z.string().trim().min(2).max(100),
    email: z.string().trim().email(),
    phone: z.string().trim().min(5).max(30),
  }),
  site: z.object({
    address: z.string().trim().min(5).max(250),
    postcode: z.string().trim().regex(/^\d{5}$/),
    accessInstructions: z.string().trim().max(1000).optional().default(""),
    parkingNotes: z.string().trim().max(500).optional().default(""),
  }),
  premises: z.object({
    type: z.enum(["office", "shop", "practice", "stairwell", "other"]),
    areaM2: z.coerce.number().min(1).max(100000),
    floors: z.coerce.number().int().min(0).max(200).optional().default(1),
    rooms: z.coerce.number().int().min(0).max(1000).optional().default(0),
    sanitaryFacilities: z.coerce.number().int().min(0).max(500).optional().default(0),
    hasKitchenette: z.boolean().optional().default(false),
  }),
  service: z.object({
    types: z
      .array(z.enum(["maintenance", "deep-clean", "windows", "carpet", "disinfection", "custom"]))
      .min(1)
      .max(6),
    frequency: z.enum(["one-time", "daily", "several-weekly", "weekly", "biweekly", "monthly", "custom"]),
    preferredTime: z.string().trim().max(200).optional().default(""),
    description: z.string().trim().max(3000).optional().default(""),
  }),
  operations: z
    .object({
      startDate: z.coerce.date().optional(),
      contractDuration: z.string().trim().max(100).optional().default(""),
      materialsProvidedBy: z
        .enum(["fiduxa", "customer", "to-discuss"])
        .optional()
        .default("to-discuss"),
      securityRequirements: z.string().trim().max(1000).optional().default(""),
    })
    .optional()
    .default({}),
  locale: z.enum(["de", "en", "pl"]).optional().default("de"),
  consent: z.object({
    privacyAccepted: z.literal(true, {
      message: "Please accept the privacy notice.",
    }),
    marketing: z.boolean().optional().default(false),
  }),
});

// POST /api/v1/business-requests (public)
export const createBusinessRequest = async (req, res, next) => {
  try {
    const data = businessRequestSchema.parse(req.body);
    const reference = await generateBookingReference();

    const request = await BusinessRequest.create({
      reference,
      company: { ...data.company, email: data.company.email.toLowerCase() },
      site: data.site,
      premises: data.premises,
      service: data.service,
      operations: data.operations,
      locale: data.locale,
      consent: {
        privacyAcceptedAt: new Date(),
        marketing: data.consent.marketing,
      },
    });

    await trySend("Business request confirmation", () =>
      sendBusinessRequestReceivedEmail({
        to: request.company.email,
        contactPerson: request.company.contactPerson,
        reference,
        locale: data.locale,
      })
    );

    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Neue Gewerbeanfrage ${reference}`,
        lines: [
          `Referenz: ${reference}`,
          `Firma: ${request.company.name}`,
          `Objekt: ${request.premises.type}, ${request.premises.areaM2} m²`,
          `PLZ: ${request.site.postcode}`,
        ],
      })
    );

    return res.status(201).json({
      success: true,
      message: "Business request received.",
      reference,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/business-requests?status=&search=&page=&limit=
export const listBusinessRequests = async (req, res, next) => {
  try {
    const pagination = getPagination(req.query, { defaultLimit: 20 });
    const filter = {};

    if (req.query.status) {
      if (!BUSINESS_REQUEST_STATUSES.includes(req.query.status)) {
        return res.status(400).json({ success: false, message: "Invalid status." });
      }
      filter.status = req.query.status;
    }

    if (req.query.search) {
      const regex = new RegExp(escapeRegex(String(req.query.search).trim()), "i");
      filter.$or = [
        { reference: regex },
        { "company.name": regex },
        { "company.email": regex },
        { "site.postcode": regex },
      ];
    }

    const [requests, total] = await Promise.all([
      BusinessRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      BusinessRequest.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      pagination: paginationMeta(pagination, total),
      requests,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/business-requests/:id
export const getBusinessRequest = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    const request = await BusinessRequest.findById(req.params.id)
      .populate("assignedTo", "name email")
      .lean();

    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found." });
    }

    return res.json({ success: true, request });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/business-requests/:id  { status?, adminNotes? }
export const updateBusinessRequest = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    const data = z
      .object({
        status: z.enum(BUSINESS_REQUEST_STATUSES).optional(),
        adminNotes: z.string().trim().max(3000).optional(),
      })
      .refine((value) => value.status || value.adminNotes !== undefined, {
        message: "Nothing to update.",
      })
      .parse(req.body);

    const request = await BusinessRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found." });
    }

    const before = { status: request.status };

    if (data.status) request.status = data.status;
    if (data.adminNotes !== undefined) request.adminNotes = data.adminNotes;
    if (!request.assignedTo) request.assignedTo = req.user._id;

    await request.save();

    if (data.status && data.status !== before.status) {
      await recordAudit({
        actor: req.user._id,
        action: "business-request.status.changed",
        entityType: "BusinessRequest",
        entityId: request._id,
        before,
        after: { status: request.status },
      });
    }

    return res.json({
      success: true,
      message: "Business request updated.",
      request: {
        id: request._id,
        reference: request.reference,
        status: request.status,
        adminNotes: request.adminNotes,
      },
    });
  } catch (error) {
    next(error);
  }
};
