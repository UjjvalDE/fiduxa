// Admin trust actions (package E): mark a no-show, lift a reliability pause,
// view a cleaner's strikes.
import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import { recordAudit } from "../services/audit.service.js";
import { offerJob } from "../services/job-dispatch.service.js";
import { addStrike, isPaused, reliabilityView, unpauseWorker } from "../services/reliability.service.js";

const loadWorker = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid worker ID." });
    return null;
  }
  const worker = await User.findOne({ _id: req.params.id, role: "worker" });
  if (!worker) res.status(404).json({ success: false, message: "Worker not found." });
  return worker;
};

// POST /api/v1/admin/bookings/:id/no-show { note? }
// The assigned cleaner did not show up: unassign, re-open the job offer,
// add strikes (default 2) and email the cleaner.
export const markNoShow = async (req, res, next) => {
  try {
    const { note } = z.object({ note: z.string().trim().max(500).optional().default("") }).parse(req.body ?? {});
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid booking ID." });
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });
    if (!booking.assignedWorker) return res.status(409).json({ success: false, message: "This booking has no assigned cleaner." });
    if (!["confirmed", "in_progress"].includes(booking.status)) {
      return res.status(409).json({ success: false, message: "A no-show can only be recorded for confirmed bookings." });
    }
    const worker = await User.findById(booking.assignedWorker);
    const before = { assignedWorker: booking.assignedWorker };

    booking.assignedWorker = null;
    booking.assignedAt = undefined;
    booking.assignedBy = undefined;
    if (worker) booking.jobOffer.releasedBy.addToSet(worker._id);
    booking.set("jobOffer.notifiedAt", undefined);
    booking.set("jobOffer.unassignedAlertSentAt", undefined);
    if (booking.status === "in_progress") booking.setStatus("confirmed", req.user._id, "Reset after no-show");
    booking.statusHistory.push({ status: "confirmed", changedBy: req.user._id, note: `No-show recorded${worker ? ` for ${worker.name}` : ""}${note ? `: ${note}` : ""}` });
    const notified = await offerJob(booking); // re-opens the offer (future jobs only)
    await booking.save();

    const strike = worker
      ? await addStrike(worker, { kind: "no_show", bookingRef: booking.reference, note, actor: req.user._id })
      : null;

    await recordAudit({
      actor: req.user._id,
      action: "booking.no_show",
      entityType: "Booking",
      entityId: booking._id,
      before,
      after: { note, worker: worker?._id ?? null, strikes: strike?.strikes ?? 0, paused: strike?.paused ?? false, notified },
    });

    return res.json({
      success: true,
      message: strike?.justPaused ? "No-show recorded. The cleaner has been paused." : "No-show recorded. The job is open for other cleaners again.",
      booking: { id: booking._id, reference: booking.reference, status: booking.status, assignedWorker: null },
      strike,
      notified,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/workers/:id/reliability
export const getWorkerReliability = async (req, res, next) => {
  try {
    const worker = await loadWorker(req, res);
    if (!worker) return;
    return res.json({ success: true, reliability: reliabilityView(worker) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/workers/:id/unpause { note? }
export const unpauseWorkerAction = async (req, res, next) => {
  try {
    const { note } = z.object({ note: z.string().trim().max(500).optional().default("") }).parse(req.body ?? {});
    const worker = await loadWorker(req, res);
    if (!worker) return;
    if (!isPaused(worker)) return res.status(409).json({ success: false, message: "This cleaner is not paused." });
    const reliability = await unpauseWorker(worker, { actor: req.user._id, note });
    return res.json({ success: true, message: "Pause lifted. The cleaner can take jobs again.", reliability });
  } catch (error) {
    next(error);
  }
};
