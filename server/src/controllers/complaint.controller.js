// Complaints: customer (own bookings), cleaner (neutral view), admin (review + resolution)
import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import Complaint, { COMPLAINT_ACTIONS, COMPLAINT_CATEGORIES, COMPLAINT_MAX_PHOTOS, COMPLAINT_PHOTO_MAX_BYTES, COMPLAINT_STATUSES } from "../models/complaint.model.js";
import {
  addInternalNote,
  applyAction,
  bookingRefundable,
  canComplainAbout,
  closeComplaint,
  complaintCounts,
  createComplaint,
  customerView,
  listCustomerComplaints,
  listWorkerComplaints,
  startReview,
} from "../services/complaint.service.js";
import { getPagination, paginationMeta } from "../utils/helpers.js";

const validId = (res, ...ids) => {
  if (ids.every((id) => mongoose.isValidObjectId(id))) return true;
  res.status(400).json({ success: false, message: "Invalid ID." });
  return false;
};

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

const createSchema = z.object({
  category: z.enum(COMPLAINT_CATEGORIES),
  description: z.string().trim().min(10).max(2000),
  photos: z
    .array(z.object({ name: z.string().trim().min(1).max(200), dataUrl: z.string().max(Math.ceil((COMPLAINT_PHOTO_MAX_BYTES * 4) / 3) + 200) }))
    .max(COMPLAINT_MAX_PHOTOS)
    .optional()
    .default([]),
});

// GET /api/v1/customer/bookings/:id/complaints
export const listMyBookingComplaints = async (req, res, next) => {
  try {
    if (!validId(res, req.params.id)) return;
    const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id }).select("status preferredDate slot");
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });
    const complaints = await listCustomerComplaints(req.user._id, booking._id);
    const hasOpen = complaints.some((c) => ["open", "in_review"].includes(c.status));
    return res.json({ success: true, complaints, canComplain: canComplainAbout(booking) && !hasOpen });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/customer/bookings/:id/complaints { category, description, photos? }
export const createMyComplaint = async (req, res, next) => {
  try {
    if (!validId(res, req.params.id)) return;
    const data = createSchema.parse(req.body ?? {});
    const complaint = await createComplaint({ customer: req.user, bookingId: req.params.id, ...data });
    return res.status(201).json({ success: true, message: "Complaint received.", complaint: customerView(complaint.toObject()) });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Cleaner
// ---------------------------------------------------------------------------

// GET /api/v1/worker/jobs/complaints – neutral: category, status, own restriction
export const listMyWorkerComplaints = async (req, res, next) => {
  try {
    return res.json({ success: true, ...(await listWorkerComplaints(req.user._id)) });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

// GET /api/v1/admin/complaints?status=&worker=&page=&limit=
export const adminListComplaints = async (req, res, next) => {
  try {
    const query = z
      .object({ status: z.enum(COMPLAINT_STATUSES).optional(), worker: z.string().optional(), customer: z.string().optional() })
      .parse({ status: req.query.status || undefined, worker: req.query.worker || undefined, customer: req.query.customer || undefined });
    const filter = {};
    if (query.worker) {
      if (!validId(res, query.worker)) return;
      filter.worker = new mongoose.Types.ObjectId(query.worker);
    }
    if (query.customer) {
      if (!validId(res, query.customer)) return;
      filter.customer = new mongoose.Types.ObjectId(query.customer);
    }
    const counts = await complaintCounts(filter);
    if (query.status) filter.status = query.status;
    const pagination = getPagination(req.query);
    const [rows, total, workers] = await Promise.all([
      Complaint.find(filter)
        .select("bookingRef booking customer worker category status createdAt updatedAt actions.type photos._id")
        .populate("customer", "name email")
        .populate("worker", "name email")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      Complaint.countDocuments(filter),
      // Cleaners with complaints (filter dropdown)
      Complaint.aggregate([{ $match: { worker: { $ne: null } } }, { $group: { _id: "$worker", n: { $sum: 1 } } }, { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } }, { $unwind: "$u" }, { $project: { _id: 1, n: 1, name: "$u.name" } }, { $sort: { name: 1 } }]),
    ]);
    const complaints = rows.map((c) => ({ ...c, photoCount: c.photos?.length ?? 0, actionTypes: [...new Set((c.actions ?? []).map((a) => a.type))], photos: undefined, actions: undefined }));
    return res.json({ success: true, complaints, counts, workers, pagination: paginationMeta(pagination, total) });
  } catch (error) {
    next(error);
  }
};

const adminDetail = async (id) => {
  const complaint = await Complaint.findById(id)
    .populate("customer", "name email phone preferredLanguage anonymisedAt")
    .populate("worker", "name email workerStatus isActive reliability.pausedAt reliability.pausedUntil")
    .populate("history.by", "name")
    .populate("actions.by", "name")
    .populate("internalNotes.by", "name")
    .populate("resolution.by", "name")
    .lean();
  if (!complaint) return null;
  const booking = await Booking.findById(complaint.booking)
    .select("reference serviceId preferredDate slot slotEnd status payment pricing estimate customerDetails.postcode customerDetails.address job.completedAt workerPayout.status workerPayout.amountCents")
    .lean();
  const { remainingCents } = await bookingRefundable(complaint.booking);
  const workerCounts = complaint.worker ? await complaintCounts({ worker: complaint.worker._id }) : null;
  return {
    ...complaint,
    photos: (complaint.photos ?? []).map((p) => ({ _id: p._id, name: p.name, type: p.type, size: p.size, uploadedAt: p.uploadedAt })),
    booking,
    refundableCents: remainingCents,
    workerCounts,
  };
};

// GET /api/v1/admin/complaints/:id
export const adminGetComplaint = async (req, res, next) => {
  try {
    if (!validId(res, req.params.id)) return;
    const complaint = await adminDetail(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found." });
    return res.json({ success: true, complaint });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/complaints/:id/photos/:photoId (?inline=1)
export const adminComplaintPhoto = async (req, res, next) => {
  try {
    if (!validId(res, req.params.id, req.params.photoId)) return;
    const complaint = await Complaint.findById(req.params.id).select("+photos.data");
    const photo = complaint?.photos.id(req.params.photoId);
    if (!photo?.data) return res.status(404).json({ success: false, message: "Photo not found." });
    res.setHeader("Content-Type", photo.type);
    res.setHeader("Content-Disposition", `${req.query.inline === "1" ? "inline" : "attachment"}; filename="${encodeURIComponent(photo.name)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    return res.send(photo.data);
  } catch (error) {
    next(error);
  }
};

const respond = async (res, id, status = 200) => res.status(status).json({ success: true, complaint: await adminDetail(id) });

// POST /api/v1/admin/complaints/:id/review
export const adminStartReview = async (req, res, next) => {
  try {
    if (!validId(res, req.params.id)) return;
    await startReview(req.params.id, req.user._id);
    return respond(res, req.params.id);
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/complaints/:id/notes { body }
export const adminAddNote = async (req, res, next) => {
  try {
    if (!validId(res, req.params.id)) return;
    const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body ?? {});
    await addInternalNote(req.params.id, req.user._id, body);
    return respond(res, req.params.id, 201);
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/complaints/:id/actions { type, amountCents?, days?, note? }
export const adminComplaintAction = async (req, res, next) => {
  try {
    if (!validId(res, req.params.id)) return;
    const data = z
      .object({
        type: z.enum(COMPLAINT_ACTIONS),
        amountCents: z.number().int().min(1).max(1_000_000).optional(),
        days: z.number().int().min(1).max(365).optional(),
        note: z.string().trim().max(1000).optional().default(""),
      })
      .parse(req.body ?? {});
    await applyAction(req.params.id, req.user._id, data);
    return respond(res, req.params.id, 201);
  } catch (error) {
    if (error?.code === "REFUND_TOO_HIGH") return res.status(422).json({ success: false, code: error.code, message: error.message, remainingCents: error.remainingCents });
    next(error);
  }
};

// POST /api/v1/admin/complaints/:id/resolve { message } · /reject { reason }
export const adminCloseComplaint = (status) => async (req, res, next) => {
  try {
    if (!validId(res, req.params.id)) return;
    const { text } = z
      .object({ text: status === "rejected" ? z.string().trim().min(3).max(2000) : z.string().trim().max(2000).default("") })
      .parse({ text: status === "rejected" ? req.body?.reason : req.body?.message });
    await closeComplaint(req.params.id, req.user._id, { status, message: text });
    return respond(res, req.params.id);
  } catch (error) {
    next(error);
  }
};
