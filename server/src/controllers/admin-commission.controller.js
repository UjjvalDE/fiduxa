import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import { COMMISSION_LIMITS, COMMISSION_TIER_ORDER, WORKER_PAY } from "../config/pricing.js";
import {
  commissionCountersBatch,
  effectiveCommissionPct,
  nextTierInfo,
  refreshWorkerTier,
  tierForCounters,
  trustScore,
} from "../services/commission.service.js";
import { recordAudit } from "../services/audit.service.js";

const round1 = (n) => Math.round(n * 10) / 10;

// GET /api/v1/admin/commission?tier=&minRating=&search=&sort=
// All approved cleaners with tier, counters, trust score and earnings totals.
export const commissionOverview = async (req, res, next) => {
  try {
    const q = z
      .object({
        tier: z.enum(COMMISSION_TIER_ORDER).optional(),
        minRating: z.coerce.number().min(0).max(5).optional(),
        search: z.string().trim().max(100).optional(),
        sort: z.enum(["trust", "rating", "jobs", "commission"]).optional().default("trust"),
        inactive: z.enum(["0", "1"]).optional(),
      })
      .parse(req.query);

    const filter = { role: "worker", workerStatus: "approved" };
    if (q.inactive !== "1") filter.isActive = { $ne: false };
    if (q.search) filter.name = { $regex: q.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const workers = await User.find(filter).select("name email isActive workerCommission createdAt").lean();

    // Lifetime money per cleaner from the immutable per-booking records
    const money = await Booking.aggregate([
      { $match: { assignedWorker: { $in: workers.map((w) => w._id) }, "workerPayout.status": { $exists: true } } },
      {
        $group: {
          _id: "$assignedWorker",
          grossCents: { $sum: { $ifNull: ["$workerPayout.grossCents", 0] } },
          earningsCents: { $sum: { $ifNull: ["$workerPayout.amountCents", 0] } },
          commissionCents: { $sum: { $ifNull: ["$workerPayout.commissionCents", 0] } },
        },
      },
    ]);
    const moneyBy = new Map(money.map((m) => [String(m._id), m]));

    const countersBy = await commissionCountersBatch(workers.map((w) => w._id));
    let rows = [];
    for (const w of workers) {
      const counters = countersBy.get(String(w._id));
      const tier = tierForCounters(counters);
      const override = w.workerCommission?.override?.commissionPct != null ? w.workerCommission.override : null;
      if (q.tier && tier.key !== q.tier) continue;
      if (q.minRating != null && (counters.ratingAvg == null || counters.ratingAvg < q.minRating)) continue;
      const m = moneyBy.get(String(w._id));
      rows.push({
        worker: { _id: w._id, name: w.name, email: w.email, isActive: w.isActive !== false },
        tier: { key: tier.key, commissionPct: tier.commissionPct, effectivePct: effectiveCommissionPct(w, tier), overridden: Boolean(override) },
        override: override ? { commissionPct: override.commissionPct, reason: override.reason, at: override.at } : null,
        counters: { ...counters, ratingAvg: counters.ratingAvg == null ? null : round1(counters.ratingAvg) },
        trustScore: trustScore(counters),
        totals: {
          grossCents: m?.grossCents ?? 0,
          earningsCents: m?.earningsCents ?? 0,
          commissionCents: m?.commissionCents ?? 0,
        },
      });
    }

    const sorters = {
      trust: (a, b) => b.trustScore - a.trustScore,
      rating: (a, b) => (b.counters.ratingAvg ?? 0) - (a.counters.ratingAvg ?? 0),
      jobs: (a, b) => b.counters.jobsCompleted - a.counters.jobsCompleted,
      commission: (a, b) => b.totals.commissionCents - a.totals.commissionCents,
    };
    rows.sort(sorters[q.sort]);

    return res.json({
      success: true,
      tiers: WORKER_PAY.commissionTiers,
      tierOrder: COMMISSION_TIER_ORDER,
      payModel: WORKER_PAY.payModel,
      workers: rows,
      totals: {
        workers: rows.length,
        grossCents: rows.reduce((s, r) => s + r.totals.grossCents, 0),
        earningsCents: rows.reduce((s, r) => s + r.totals.earningsCents, 0),
        commissionCents: rows.reduce((s, r) => s + r.totals.commissionCents, 0),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/commission/workers/:id – one cleaner in full detail
export const commissionWorkerDetail = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid cleaner ID." });
    }
    const refreshed = await refreshWorkerTier(req.params.id);
    if (!refreshed) return res.status(404).json({ success: false, message: "Cleaner not found." });
    const { worker, counters, tier } = refreshed;
    const override = worker.workerCommission?.override?.commissionPct != null ? worker.workerCommission.override : null;
    const recent = await Booking.find({ assignedWorker: worker._id, "workerPayout.status": { $exists: true } })
      .select("reference preferredDate workerPayout.grossCents workerPayout.amountCents workerPayout.commissionCents workerPayout.commissionPct workerPayout.tierKey workerPayout.basis workerPayout.status")
      .sort({ "workerPayout.earnedAt": -1 })
      .limit(50)
      .lean();
    return res.json({
      success: true,
      worker: { _id: worker._id, name: worker.name },
      tier: { key: tier.key, commissionPct: tier.commissionPct, effectivePct: effectiveCommissionPct(worker, tier), overridden: Boolean(override) },
      override: override ? { commissionPct: override.commissionPct, reason: override.reason, at: override.at } : null,
      counters: { ...counters, ratingAvg: counters.ratingAvg == null ? null : round1(counters.ratingAvg) },
      trustScore: trustScore(counters),
      nextTier: override ? null : nextTierInfo(tier.key, counters),
      transactions: recent.map((b) => ({
        _id: b._id,
        reference: b.reference,
        date: b.preferredDate,
        ...b.workerPayout,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/workers/:id/commission-override
// { commissionPct, reason } sets an override · { commissionPct: null, reason } removes it.
// Overrides only affect FUTURE completed jobs – recorded bookings stay as they are.
export const setCommissionOverride = async (req, res, next) => {
  try {
    const data = z
      .object({
        commissionPct: z.number().min(COMMISSION_LIMITS.minPct).max(COMMISSION_LIMITS.maxPct).nullable(),
        reason: z.string().trim().min(5).max(300),
      })
      .parse(req.body);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid cleaner ID." });
    }
    const worker = await User.findOne({ _id: req.params.id, role: "worker" }).select("name workerCommission");
    if (!worker) return res.status(404).json({ success: false, message: "Cleaner not found." });

    const previous = worker.workerCommission?.override?.commissionPct ?? null;
    if (data.commissionPct == null) {
      worker.set("workerCommission.override", undefined);
    } else {
      worker.set("workerCommission.override", {
        commissionPct: data.commissionPct,
        reason: data.reason,
        admin: req.user._id,
        at: new Date(),
      });
    }
    await worker.save();
    await recordAudit({
      actor: req.user._id,
      action: data.commissionPct == null ? "worker.commission_override_removed" : "worker.commission_override_set",
      entityType: "user",
      entityId: worker._id,
      before: { commissionPct: previous },
      after: { commissionPct: data.commissionPct, reason: data.reason },
    });
    const refreshed = await refreshWorkerTier(worker._id, { reason: "override_changed" });
    return res.json({
      success: true,
      message: data.commissionPct == null ? "The override has been removed." : "The commission override has been saved.",
      tier: {
        key: refreshed.tier.key,
        commissionPct: refreshed.tier.commissionPct,
        effectivePct: effectiveCommissionPct(refreshed.worker, refreshed.tier),
        overridden: data.commissionPct != null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/commission/report?from=&to=&format=csv
// Per-cleaner commission report over recorded (immutable) booking payouts.
export const commissionReport = async (req, res, next) => {
  try {
    const q = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        format: z.enum(["json", "csv"]).optional().default("json"),
      })
      .parse(req.query);
    const match = { "workerPayout.status": { $exists: true } };
    if (q.from || q.to) {
      match["workerPayout.earnedAt"] = {};
      if (q.from) match["workerPayout.earnedAt"].$gte = new Date(`${q.from}T00:00:00.000Z`);
      if (q.to) match["workerPayout.earnedAt"].$lte = new Date(`${q.to}T23:59:59.999Z`);
    }
    const rows = await Booking.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$assignedWorker",
          jobs: { $sum: 1 },
          grossCents: { $sum: { $ifNull: ["$workerPayout.grossCents", 0] } },
          earningsCents: { $sum: { $ifNull: ["$workerPayout.amountCents", 0] } },
          commissionCents: { $sum: { $ifNull: ["$workerPayout.commissionCents", 0] } },
        },
      },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "worker" } },
      { $unwind: { path: "$worker", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: "$worker.name",
          tierKey: "$worker.workerCommission.tierKey",
          jobs: 1,
          grossCents: 1,
          earningsCents: 1,
          commissionCents: 1,
        },
      },
      { $sort: { commissionCents: -1 } },
    ]);
    const totals = {
      jobs: rows.reduce((s, r) => s + r.jobs, 0),
      grossCents: rows.reduce((s, r) => s + r.grossCents, 0),
      earningsCents: rows.reduce((s, r) => s + r.earningsCents, 0),
      commissionCents: rows.reduce((s, r) => s + r.commissionCents, 0),
    };
    if (q.format === "csv") {
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [
        "Cleaner;Tier;Jobs;Gross EUR;Cleaner earnings EUR;Fiduxa commission EUR",
        ...rows.map((r) =>
          [esc(r.name), esc(r.tierKey ?? ""), r.jobs, (r.grossCents / 100).toFixed(2), (r.earningsCents / 100).toFixed(2), (r.commissionCents / 100).toFixed(2)].join(";")
        ),
        ["Total", "", totals.jobs, (totals.grossCents / 100).toFixed(2), (totals.earningsCents / 100).toFixed(2), (totals.commissionCents / 100).toFixed(2)].join(";"),
      ];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="fiduxa-commission-report.csv"`);
      return res.send("﻿" + lines.join("\n"));
    }
    return res.json({ success: true, rows, totals });
  } catch (error) {
    next(error);
  }
};
