import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import Payout from "../models/payout.model.js";
import User from "../models/user.model.js";
import { createPayout, displayPayoutStatus } from "../services/payout.service.js";
import { recordAudit } from "../services/audit.service.js";
import { sendPayoutEmail, trySend } from "../services/email.service.js";
import { WORKER_PAY } from "../config/pricing.js";

// GET /api/v1/admin/payouts/open – unpaid cleaner earnings grouped by cleaner
export const listOpenPayouts = async (req, res, next) => {
  try {
    const now = new Date();
    const rows = await Booking.find({ "workerPayout.status": { $in: ["pending", "on_hold"] } })
      .select("reference preferredDate assignedWorker workerPayout")
      .populate("assignedWorker", "name email bankAccountLast4 bankAccountHolder")
      .sort({ "workerPayout.dueAt": 1 })
      .lean();

    const byWorker = new Map();
    for (const row of rows) {
      const w = row.assignedWorker;
      if (!w) continue;
      const key = String(w._id);
      if (!byWorker.has(key)) {
        byWorker.set(key, {
          worker: { _id: w._id, name: w.name, email: w.email, bankAccountLast4: w.bankAccountLast4, bankAccountHolder: w.bankAccountHolder },
          dueCents: 0,
          pendingCents: 0,
          onHoldCents: 0,
          jobs: [],
        });
      }
      const group = byWorker.get(key);
      const status = displayPayoutStatus(row.workerPayout);
      // Net amounts: pay minus cash the cleaner already kept
      const net = (row.workerPayout.amountCents ?? 0) - (row.workerPayout.cashHeldCents ?? 0);
      if (status === "due") group.dueCents += net;
      else if (status === "pending") group.pendingCents += net;
      else group.onHoldCents += net;
      group.jobs.push({
        _id: row._id,
        reference: row.reference,
        date: row.preferredDate,
        amountCents: row.workerPayout.amountCents,
        cashHeldCents: row.workerPayout.cashHeldCents ?? 0,
        netCents: net,
        minutes: row.workerPayout.minutes,
        earnedAt: row.workerPayout.earnedAt,
        dueAt: row.workerPayout.dueAt,
        status,
      });
    }

    const groups = [...byWorker.values()].sort((a, b) => b.dueCents - a.dueCents);
    return res.json({
      success: true,
      payoutDelayDays: WORKER_PAY.payoutDelayDays,
      defaultRateCents: WORKER_PAY.hourlyRateCents,
      totals: {
        dueCents: groups.reduce((s, g) => s + g.dueCents, 0),
        pendingCents: groups.reduce((s, g) => s + g.pendingCents, 0),
        onHoldCents: groups.reduce((s, g) => s + g.onHoldCents, 0),
      },
      now,
      groups,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/payouts  { workerId, bookingIds?, includeNotYetDue?, note? }
// Call AFTER the bank transfer was made – marks the jobs as paid.
export const createWorkerPayout = async (req, res, next) => {
  try {
    const data = z
      .object({
        workerId: z.string().refine((id) => mongoose.isValidObjectId(id), "Invalid worker ID."),
        bookingIds: z.array(z.string().refine((id) => mongoose.isValidObjectId(id))).max(500).optional(),
        includeNotYetDue: z.boolean().optional().default(false),
        note: z.string().trim().max(500).optional().default(""),
      })
      .parse(req.body);

    const payout = await createPayout({ ...data, adminId: req.user._id });
    if (!payout) {
      return res.status(409).json({ success: false, message: "There is nothing to pay out for this cleaner." });
    }

    const worker = await User.findById(data.workerId).select("name email preferredLanguage");
    if (worker) await trySend("Payout", () => sendPayoutEmail({ worker, payout }));

    await recordAudit({
      actor: req.user._id,
      action: "payout.created",
      entityType: "Payout",
      entityId: payout._id,
      after: { worker: data.workerId, amountCents: payout.amountCents, jobs: payout.bookings.length },
    });

    return res.status(201).json({ success: true, message: "Payout recorded.", payout });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/payouts?worker=
export const listPayouts = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.worker && mongoose.isValidObjectId(req.query.worker)) filter.worker = req.query.worker;
    const payouts = await Payout.find(filter)
      .populate("worker", "name email")
      .populate("createdBy", "name")
      .sort({ paidAt: -1 })
      .limit(200)
      .lean();
    return res.json({ success: true, payouts: payouts.map((p) => ({ ...p, jobCount: p.bookings.length })) });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/bookings/:id/payout  { status: "on_hold" | "pending" }
export const setBookingPayoutHold = async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(["on_hold", "pending"]) }).parse(req.body);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid booking ID." });
    }
    const result = await Booking.updateOne(
      { _id: req.params.id, "workerPayout.status": { $in: ["pending", "on_hold"] } },
      { $set: { "workerPayout.status": status } }
    );
    if (result.matchedCount === 0) {
      return res.status(409).json({ success: false, message: "This job has no open payout." });
    }
    await recordAudit({ actor: req.user._id, action: `payout.${status}`, entityType: "Booking", entityId: req.params.id });
    return res.json({ success: true, message: status === "on_hold" ? "Payout on hold." : "Payout released." });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/workers/:id/pay-rate  { payRateCents | null }
export const setWorkerPayRate = async (req, res, next) => {
  try {
    const { payRateCents } = z
      .object({ payRateCents: z.number().int().min(0).max(10000).nullable() })
      .parse(req.body);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid worker ID." });
    }
    const worker = await User.findOneAndUpdate(
      { _id: req.params.id, role: "worker" },
      { workerPayRateCents: payRateCents },
      { returnDocument: "after" }
    ).select("name workerPayRateCents");
    if (!worker) return res.status(404).json({ success: false, message: "Worker not found." });
    await recordAudit({
      actor: req.user._id,
      action: "worker.payrate.changed",
      entityType: "User",
      entityId: worker._id,
      after: { payRateCents },
    });
    return res.json({
      success: true,
      payRateCents: worker.workerPayRateCents ?? WORKER_PAY.hourlyRateCents,
      custom: worker.workerPayRateCents != null,
    });
  } catch (error) {
    next(error);
  }
};
