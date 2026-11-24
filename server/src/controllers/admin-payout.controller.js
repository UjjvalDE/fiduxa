import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import Payout from "../models/payout.model.js";
import User from "../models/user.model.js";
import { displayPayoutStatus, payoutTarget, refreshPayout, settleWorker } from "../services/payout.service.js";
import { recordAudit } from "../services/audit.service.js";
import { WORKER_PAY } from "../config/pricing.js";

// GET /api/v1/admin/payouts/open – unpaid cleaner earnings grouped by cleaner
export const listOpenPayouts = async (req, res, next) => {
  try {
    const now = new Date();
    const rows = await Booking.find({ "workerPayout.status": { $in: ["pending", "on_hold", "processing"] } })
      .select("reference preferredDate assignedWorker workerPayout")
      .populate("assignedWorker", "name email bankAccountLast4 bankAccountHolder payoutMethod")
      .sort({ "workerPayout.dueAt": 1 })
      .lean();

    const byWorker = new Map();
    for (const row of rows) {
      const w = row.assignedWorker;
      if (!w) continue;
      const key = String(w._id);
      if (!byWorker.has(key)) {
        byWorker.set(key, {
          worker: {
            _id: w._id,
            name: w.name,
            email: w.email,
            bankAccountLast4: w.bankAccountLast4,
            bankAccountHolder: w.bankAccountHolder,
            // How this cleaner wants to be paid (paypal target is masked)
            payout: payoutTarget(w),
          },
          dueCents: 0,
          pendingCents: 0,
          onHoldCents: 0,
          processingCents: 0,
          grossCents: 0,
          commissionCents: 0,
          jobs: [],
        });
      }
      const group = byWorker.get(key);
      const status = displayPayoutStatus(row.workerPayout);
      // Net amounts: pay minus cash the cleaner already kept
      const net = (row.workerPayout.amountCents ?? 0) - (row.workerPayout.cashHeldCents ?? 0);
      if (status === "due") group.dueCents += net;
      else if (status === "pending") group.pendingCents += net;
      else if (status === "processing") group.processingCents += net;
      else group.onHoldCents += net;
      group.grossCents += row.workerPayout.grossCents ?? 0;
      group.commissionCents += row.workerPayout.commissionCents ?? 0;
      group.jobs.push({
        _id: row._id,
        reference: row.reference,
        date: row.preferredDate,
        amountCents: row.workerPayout.amountCents,
        grossCents: row.workerPayout.grossCents ?? null,
        commissionCents: row.workerPayout.commissionCents ?? null,
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
        processingCents: groups.reduce((s, g) => s + g.processingCents, 0),
        grossCents: groups.reduce((s, g) => s + g.grossCents, 0),
        commissionCents: groups.reduce((s, g) => s + g.commissionCents, 0),
      },
      now,
      groups,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/payouts  { workerId, bookingIds?, includeNotYetDue?, note?, method? }
//   method "bank"   = the admin made the transfer themselves → recorded as paid
//   method "paypal" = initiate a payout via the PayPal Payouts API (sandbox/live)
// Omitted method = the cleaner's own preference.
export const createWorkerPayout = async (req, res, next) => {
  try {
    const data = z
      .object({
        workerId: z.string().refine((id) => mongoose.isValidObjectId(id), "Invalid worker ID."),
        bookingIds: z.array(z.string().refine((id) => mongoose.isValidObjectId(id))).max(500).optional(),
        includeNotYetDue: z.boolean().optional().default(false),
        note: z.string().trim().max(500).optional().default(""),
        method: z.enum(["bank", "paypal"]).optional(),
      })
      .parse(req.body);

    const payout = await settleWorker({ ...data, adminId: req.user._id });
    if (!payout) {
      return res.status(409).json({ success: false, message: "There is nothing to pay out for this cleaner." });
    }

    await recordAudit({
      actor: req.user._id,
      action: payout.status === "failed" ? "payout.failed" : "payout.created",
      entityType: "Payout",
      entityId: payout._id,
      after: {
        worker: data.workerId,
        amountCents: payout.amountCents,
        jobs: payout.bookings.length,
        provider: payout.provider,
        status: payout.status,
        providerBatchId: payout.providerBatchId,
        failureReason: payout.failureReason,
      },
    });

    if (payout.status === "failed") {
      return res.status(502).json({
        success: false,
        message: "The payout was refused by the provider. The earnings are released for a retry.",
        payout,
      });
    }
    return res.status(201).json({
      success: true,
      message: payout.status === "paid" ? "Payout recorded." : "Payout initiated. Refresh to confirm the provider result.",
      payout,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/payouts/:id/refresh  { forceFail? }
// Re-check a processing PayPal payout against the provider.
export const refreshWorkerPayout = async (req, res, next) => {
  try {
    const { forceFail } = z.object({ forceFail: z.boolean().optional().default(false) }).parse(req.body ?? {});
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid ID." });
    }
    const payout = await refreshPayout(req.params.id, { forceFail });
    await recordAudit({
      actor: req.user._id,
      action: "payout.refreshed",
      entityType: "Payout",
      entityId: payout._id,
      after: { status: payout.status, failureReason: payout.failureReason },
    });
    return res.json({ success: true, payout });
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
