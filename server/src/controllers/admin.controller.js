import { recordWorkerEarning } from "../services/payout.service.js";
import { jobMismatch } from "../services/worker-profile.service.js";
import { z } from "zod";
import mongoose from "mongoose";

import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import AuditLog from "../models/audit-log.model.js";
import { ACTIVE_BOOKING_STATUSES, ALL_BOOKING_STATUSES } from "../config/pricing.js";
import { sendBookingStatusEmail, trySend } from "../services/email.service.js";
import { cancelBooking, confirmBooking } from "../services/booking-lifecycle.service.js";
import {
  findWorkerConflict,
  notifyAssignment,
  offerJob,
} from "../services/job-dispatch.service.js";
import { recordAudit } from "../services/audit.service.js";
import {
  escapeRegex,
  getPagination,
  paginationMeta,
  parseCalendarDate,
  DAY_MS,
} from "../utils/helpers.js";

const statusSchema = z.object({
  status: z.enum(["confirmed", "in_progress", "completed", "cancelled"]),
  note: z.string().trim().max(500).optional().default(""),
  // When cancelling a paid booking: refund automatically via Stripe (default)
  refund: z.boolean().optional().default(true),
});

// Allowed admin status transitions
// payment_pending → confirmed = manual confirmation (e.g. paid by invoice)
const ALLOWED_TRANSITIONS = {
  payment_pending: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  // legacy quotation-flow records
  pending_quotation: ["cancelled"],
  quotation_sent: ["cancelled"],
  accepted: ["confirmed", "cancelled"],
};

const loadBooking = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid booking ID." });
    return null;
  }

  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    res.status(404).json({ success: false, message: "Booking not found." });
    return null;
  }

  return booking;
};

// GET /api/v1/admin/bookings
// Filters: status, search (reference/name/email/postcode), from, to (YYYY-MM-DD),
//          assigned=true|false, workerId, page, limit
export const getAllBookings = async (req, res, next) => {
  try {
    const pagination = getPagination(req.query);
    const filter = {};

    if (req.query.status) {
      if (!ALL_BOOKING_STATUSES.includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking status.",
        });
      }
      filter.status = req.query.status;
    }

    if (req.query.search) {
      const regex = new RegExp(escapeRegex(String(req.query.search).trim()), "i");
      filter.$or = [
        { reference: regex },
        { "customerDetails.name": regex },
        { "customerDetails.email": regex },
        { "customerDetails.postcode": regex },
      ];
    }

    const from = parseCalendarDate(req.query.from);
    const to = parseCalendarDate(req.query.to);
    if (from || to) {
      filter.preferredDate = {};
      if (from) filter.preferredDate.$gte = from;
      if (to) filter.preferredDate.$lt = new Date(to.getTime() + DAY_MS);
    }

    if (req.query.assigned === "true") filter.assignedWorker = { $ne: null };
    if (req.query.assigned === "false") filter.assignedWorker = null;

    if (req.query.workerId) {
      if (!mongoose.isValidObjectId(req.query.workerId)) {
        return res.status(400).json({ success: false, message: "Invalid worker ID." });
      }
      filter.assignedWorker = req.query.workerId;
    }

    const sort =
      req.query.sort === "date" ? { preferredDate: 1, slot: 1 } : { createdAt: -1 };

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate("customer", "name email phone")
        .populate("assignedWorker", "name email phone")
        .sort(sort)
        .skip(pagination.skip)
        .limit(pagination.limit),
      Booking.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      pagination: paginationMeta(pagination, total),
      bookings,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/bookings/:id
export const getBookingDetails = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const booking = await Booking.findById(req.params.id)
      .populate("customer", "name email phone")
      .populate("assignedWorker", "name email phone")
      .populate("jobOffer.declinedBy", "name")
      .populate("jobOffer.releasedBy", "name")
      .populate("statusHistory.changedBy", "name role")
      .populate("quotation.sentBy", "name");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    return res.json({ success: true, booking });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/bookings/:id/status  { status, note?, refund? }
export const updateBookingStatus = async (req, res, next) => {
  try {
    const { status, note, refund } = statusSchema.parse(req.body);

    const booking = await loadBooking(req, res);
    if (!booking) return;

    const allowedNext = ALLOWED_TRANSITIONS[booking.status] || [];

    if (!allowedNext.includes(status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot change booking from ${booking.status} to ${status}.`,
      });
    }

    const previousStatus = booking.status;
    let refunded = false;

    if (status === "cancelled") {
      ({ refunded } = await cancelBooking(booking, {
        actorId: req.user._id,
        reason: note,
        note: note || "Cancelled by admin",
        autoRefund: refund,
      }));
    } else if (status === "confirmed") {
      if (booking.payment?.status !== "paid") booking.set("payment.method", "invoice");
      await confirmBooking(booking, {
        actorId: req.user._id,
        note: note || "Confirmed manually by admin",
        paid: booking.payment?.status === "paid",
      });
    } else {
      booking.setStatus(status, req.user._id, note);
      if (status === "in_progress" && !booking.job?.startedAt) {
        booking.set("job.startedAt", new Date());
      }
      if (status === "completed" && !booking.job?.completedAt) {
        booking.set("job.completedAt", new Date());
      }
      if (status === "completed") await recordWorkerEarning(booking);
      await booking.save();

      if (status === "completed") {
        await trySend("Booking status", () => sendBookingStatusEmail({ booking, status }));
      }
    }

    await recordAudit({
      actor: req.user._id,
      action: "booking.status.changed",
      entityType: "Booking",
      entityId: booking._id,
      before: { status: previousStatus },
      after: { status, note, ...(status === "cancelled" && { refunded, payment: booking.payment?.status }) },
    });

    return res.json({
      success: true,
      message: "Booking status updated.",
      refunded,
      booking: {
        id: booking._id,
        reference: booking.reference,
        status: booking.status,
        payment: booking.payment,
      },
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/bookings/:id/assign  { workerId | null }
export const assignWorker = async (req, res, next) => {
  try {
    const { workerId } = z
      .object({
        workerId: z
          .string()
          .refine((id) => mongoose.isValidObjectId(id), "Invalid worker ID.")
          .nullable(),
      })
      .parse(req.body);

    const booking = await loadBooking(req, res);
    if (!booking) return;

    if (!["confirmed", "in_progress", "accepted"].includes(booking.status)) {
      return res.status(409).json({
        success: false,
        message: "Workers can only be assigned to confirmed bookings.",
      });
    }

    const before = { assignedWorker: booking.assignedWorker };
    let assignedWorker = null;

    if (workerId === null) {
      booking.assignedWorker = null;
      booking.assignedAt = undefined;
      booking.assignedBy = undefined;
      // Back on the open-job board
      booking.set("jobOffer.unassignedAlertSentAt", undefined);
      if (booking.status === "confirmed") await offerJob(booking);
    } else {
      const worker = await User.findOne({
        _id: workerId,
        role: "worker",
        workerStatus: "approved",
        isActive: true,
      });

      if (!worker) {
        return res.status(404).json({
          success: false,
          message: "Approved, active worker not found.",
        });
      }

      // Holiday / pets (working hours are only a preference for the office)
      const mismatch = jobMismatch(worker, booking, { strictHours: false });
      if (mismatch) {
        return res.status(409).json({
          success: false,
          message: mismatch === "holiday" ? "This worker is on holiday on that day." : "There are pets in this home and this worker does not work with pets.",
        });
      }

      // Prevent overlapping jobs for the same cleaner (incl. travel buffer)
      const clash = await findWorkerConflict(worker._id, booking);

      if (clash) {
        return res.status(409).json({
          success: false,
          message: `This worker is already assigned to ${clash.reference} in the same slot.`,
        });
      }

      booking.assignedWorker = worker._id;
      booking.assignedAt = new Date();
      booking.assignedBy = req.user._id;
      assignedWorker = worker;
    }

    await booking.save();

    if (assignedWorker && String(before.assignedWorker) !== String(assignedWorker._id)) {
      await notifyAssignment(booking, assignedWorker, { byAdmin: true });
    }

    await recordAudit({
      actor: req.user._id,
      action: workerId ? "booking.worker.assigned" : "booking.worker.unassigned",
      entityType: "Booking",
      entityId: booking._id,
      before,
      after: { assignedWorker: booking.assignedWorker },
    });

    await booking.populate("assignedWorker", "name email phone");

    return res.json({
      success: true,
      message: workerId ? "Worker assigned." : "Worker unassigned.",
      booking: {
        id: booking._id,
        reference: booking.reference,
        status: booking.status,
        assignedWorker: booking.assignedWorker,
      },
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/bookings/:id/notes  { adminNotes }
export const updateBookingNotes = async (req, res, next) => {
  try {
    const { adminNotes } = z
      .object({ adminNotes: z.string().trim().max(2000) })
      .parse(req.body);

    const booking = await loadBooking(req, res);
    if (!booking) return;

    booking.adminNotes = adminNotes;
    await booking.save();

    return res.json({
      success: true,
      message: "Notes saved.",
      adminNotes: booking.adminNotes,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/customers?search=&page=&limit=
export const getCustomers = async (req, res, next) => {
  try {
    const pagination = getPagination(req.query, { defaultLimit: 20 });
    const filter = { role: "consumer" };

    if (req.query.search) {
      const regex = new RegExp(escapeRegex(String(req.query.search).trim()), "i");
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const [customers, total] = await Promise.all([
      User.find(filter)
        .select("name email phone isActive createdAt")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const counts = await Booking.aggregate([
      { $match: { customer: { $in: customers.map((c) => c._id) } } },
      {
        $group: {
          _id: "$customer",
          bookings: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          lastBookingAt: { $max: "$createdAt" },
        },
      },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c]));

    return res.json({
      success: true,
      pagination: paginationMeta(pagination, total),
      customers: customers.map((customer) => {
        const stats = countMap.get(String(customer._id));
        return {
          id: customer._id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          isActive: customer.isActive,
          createdAt: customer.createdAt,
          bookingCount: stats?.bookings || 0,
          completedCount: stats?.completed || 0,
          lastBookingAt: stats?.lastBookingAt || null,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/customers/:id
export const getCustomerDetails = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid customer ID." });
    }

    const customer = await User.findOne({ _id: req.params.id, role: "consumer" })
      .select("name email phone isActive createdAt")
      .lean();

    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found." });
    }

    const bookings = await Booking.find({ customer: customer._id })
      .select("reference serviceId status preferredDate slot slotEnd estimate.totalCents payment createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      customer: { id: customer._id, ...customer, _id: undefined },
      bookings,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/customers/:id/status  { isActive }
export const setCustomerActive = async (req, res, next) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid customer ID." });
    }

    const customer = await User.findOne({ _id: req.params.id, role: "consumer" });

    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found." });
    }

    const before = { isActive: customer.isActive };
    customer.isActive = isActive;
    await customer.save();

    await recordAudit({
      actor: req.user._id,
      action: isActive ? "customer.activated" : "customer.deactivated",
      entityType: "User",
      entityId: customer._id,
      before,
      after: { isActive },
    });

    return res.json({
      success: true,
      message: isActive ? "Customer activated." : "Customer deactivated.",
      customer: { id: customer._id, isActive: customer.isActive },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/audit-logs?entityId=&action=&page=&limit=
export const getAuditLogs = async (req, res, next) => {
  try {
    const pagination = getPagination(req.query, { defaultLimit: 25, maxLimit: 100 });
    const filter = {};

    if (req.query.entityId) {
      if (!mongoose.isValidObjectId(req.query.entityId)) {
        return res.status(400).json({ success: false, message: "Invalid entity ID." });
      }
      filter.entityId = req.query.entityId;
    }
    if (req.query.action) filter.action = String(req.query.action);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate("actor", "name email")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      pagination: paginationMeta(pagination, total),
      logs,
    });
  } catch (error) {
    next(error);
  }
};
