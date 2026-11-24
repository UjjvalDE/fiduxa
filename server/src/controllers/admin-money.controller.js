// Admin side of the money policies: duration-based price adjustments
// (proposed to the customer), resolving open adjustments, cash-debt overview.
import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import { recordAudit } from "../services/audit.service.js";
import { cancellationPreview, cashDebtCleaners, proposeDurationAdjustment, resolveAdjustment } from "../services/money-policies.service.js";

const loadBooking = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid booking ID." });
    return null;
  }
  const booking = await Booking.findById(req.params.id);
  if (!booking) res.status(404).json({ success: false, message: "Booking not found." });
  return booking;
};

// POST /api/v1/admin/bookings/:id/duration-adjustment  { minutes, note? }
// The cleaning took longer (+) / shorter (−) than booked: propose the price
// difference (booked hourly rate) – the customer approves or declines it.
export const createDurationAdjustment = async (req, res, next) => {
  try {
    const { minutes, note } = z
      .object({
        minutes: z.number().int().min(-720).max(720).refine((m) => m !== 0, "Minutes must not be 0."),
        note: z.string().trim().max(500).optional().default(""),
      })
      .parse(req.body ?? {});

    const booking = await loadBooking(req, res);
    if (!booking) return;
    if (booking.status !== "completed") {
      return res.status(409).json({ success: false, message: "Duration adjustments are only possible for completed bookings." });
    }
    if (booking.priceAdjustments?.some((a) => a.kind === "duration" && ["proposed", "open"].includes(a.status))) {
      return res.status(409).json({ success: false, message: "There is already an open duration adjustment for this booking." });
    }

    const adjustment = await proposeDurationAdjustment(booking, { minutes, note, by: req.user._id });
    await recordAudit({
      actor: req.user._id,
      action: "booking.adjustment.proposed",
      entityType: "Booking",
      entityId: booking._id,
      after: { adjustmentId: adjustment._id, minutes, deltaCents: adjustment.deltaCents, note },
    });
    return res.status(201).json({ success: true, message: "Adjustment proposed to the customer.", adjustment });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/bookings/:id/adjustments/:adjId  { action: "mark_paid" | "waive", via?: "cash" | "invoice" }
export const resolveBookingAdjustment = async (req, res, next) => {
  try {
    const { action, via } = z
      .object({ action: z.enum(["mark_paid", "waive"]), via: z.enum(["cash", "invoice"]).optional().default("invoice") })
      .parse(req.body ?? {});
    const booking = await loadBooking(req, res);
    if (!booking) return;
    const adjustment = mongoose.isValidObjectId(req.params.adjId) ? booking.priceAdjustments.id(req.params.adjId) : null;
    if (!adjustment) return res.status(404).json({ success: false, message: "Adjustment not found." });

    const before = { status: adjustment.status };
    await resolveAdjustment(booking, adjustment, { action, via, actorId: req.user._id });
    await recordAudit({
      actor: req.user._id,
      action: action === "waive" ? "booking.adjustment.waived" : "booking.adjustment.paid",
      entityType: "Booking",
      entityId: booking._id,
      before,
      after: { adjustmentId: adjustment._id, status: adjustment.status, paidVia: adjustment.paidVia },
    });
    return res.json({ success: true, message: action === "waive" ? "Adjustment waived." : "Adjustment marked as paid.", adjustment });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/bookings/:id/cancel-preview – fee the policy would apply right now
export const adminCancelPreview = async (req, res, next) => {
  try {
    const booking = await loadBooking(req, res);
    if (!booking) return;
    return res.json({ success: true, ...cancellationPreview(booking) });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/cash-debt – cleaners below the cash suspension line
export const listCashDebt = async (req, res, next) => {
  try {
    const rows = await cashDebtCleaners();
    const workers = await User.find({ _id: { $in: rows.map((r) => r.worker) } }).select("name email workerCommission.tierKey").lean();
    const byId = new Map(workers.map((w) => [String(w._id), w]));
    return res.json({
      success: true,
      cleaners: rows.map((r) => ({
        worker: byId.get(String(r.worker)) ?? { _id: r.worker },
        netCents: r.netCents,
      })),
    });
  } catch (error) {
    next(error);
  }
};
