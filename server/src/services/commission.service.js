// Rating-based cleaner commission engine (tiers, trust score, cached refresh).
//
// A cleaner's commission depends on completed jobs, verified reviews, average
// rating and reliability. The tier thresholds and percentages live in
// WORKER_PAY.commissionTiers (admin-configurable via settings). The tier only
// affects FUTURE completed jobs – the pay recorded on a booking at completion
// time is immutable (see recordWorkerEarning in payout.service.js).
import mongoose from "mongoose";
import Booking from "../models/booking.model.js";
import Review from "../models/review.model.js";
import User from "../models/user.model.js";
import { COMMISSION_TIER_ORDER, WORKER_PAY } from "../config/pricing.js";
import { recordAudit } from "./audit.service.js";
import { activeStrikes, reliabilityView } from "./reliability.service.js"; // [E]

const round1 = (n) => Math.round(n * 10) / 10;
const clamp01 = (n) => Math.min(1, Math.max(0, n));

/**
 * Counters that drive tier eligibility.
 * - jobsCompleted: completed bookings, minus fully refunded ones (a refunded
 *   cleaning is not a delivered cleaning).
 * - verifiedReviews / ratingAvg: visible (non-hidden) reviews only – rejected
 *   disputes keep counting, approved disputes are hidden and do not.
 * - reliabilityPct: completed / (completed + handed back), null until data.
 */
export const commissionCounters = async (workerId) => {
  const [ratingAgg, completed, refunded, released] = await Promise.all([
    Review.aggregate([
      { $match: { worker: workerId, hidden: false } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]),
    Booking.countDocuments({ assignedWorker: workerId, status: "completed" }),
    Booking.countDocuments({ assignedWorker: workerId, status: "completed", "payment.status": "refunded" }),
    Booking.countDocuments({ "jobOffer.releasedBy": workerId }),
  ]);
  const r = ratingAgg[0];
  const jobsCompleted = Math.max(0, completed - refunded);
  const commitments = jobsCompleted + released;
  return {
    jobsCompleted,
    verifiedReviews: r?.count ?? 0,
    // Exact average for eligibility checks (display rounds to 1 decimal)
    ratingAvg: r ? r.avg : null,
    reliabilityPct: commitments > 0 ? Math.round((jobsCompleted / commitments) * 100) : null,
  };
};

/** Batch version of commissionCounters – one aggregation per metric for N workers. */
export const commissionCountersBatch = async (workerIds) => {
  const ids = workerIds.map((id) => (typeof id === "string" ? new mongoose.Types.ObjectId(id) : id));
  const [ratings, completed, refunded, released] = await Promise.all([
    Review.aggregate([
      { $match: { worker: { $in: ids }, hidden: false } },
      { $group: { _id: "$worker", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]),
    Booking.aggregate([
      { $match: { assignedWorker: { $in: ids }, status: "completed" } },
      { $group: { _id: "$assignedWorker", count: { $sum: 1 } } },
    ]),
    Booking.aggregate([
      { $match: { assignedWorker: { $in: ids }, status: "completed", "payment.status": "refunded" } },
      { $group: { _id: "$assignedWorker", count: { $sum: 1 } } },
    ]),
    Booking.aggregate([
      { $match: { "jobOffer.releasedBy": { $in: ids } } },
      { $group: { _id: "$jobOffer.releasedBy", count: { $sum: 1 } } },
    ]),
  ]);
  const by = (rows) => new Map(rows.map((r) => [String(r._id), r]));
  const ratingBy = by(ratings);
  const completedBy = by(completed);
  const refundedBy = by(refunded);
  const releasedBy = by(released);
  const result = new Map();
  for (const id of ids) {
    const key = String(id);
    const r = ratingBy.get(key);
    const jobsCompleted = Math.max(0, (completedBy.get(key)?.count ?? 0) - (refundedBy.get(key)?.count ?? 0));
    const commitments = jobsCompleted + (releasedBy.get(key)?.count ?? 0);
    result.set(key, {
      jobsCompleted,
      verifiedReviews: r?.count ?? 0,
      ratingAvg: r ? r.avg : null,
      reliabilityPct: commitments > 0 ? Math.round((jobsCompleted / commitments) * 100) : null,
    });
  }
  return result;
};

const meetsTier = (tier, c) =>
  c.jobsCompleted >= tier.minJobs &&
  c.verifiedReviews >= tier.minReviews &&
  c.ratingAvg != null &&
  // Guard against float noise: 4.8999999 qualifies for 4.9
  c.ratingAvg >= tier.minRating - 1e-9;

/** Highest tier whose requirements are ALL met ("new" always qualifies). */
export const tierForCounters = (counters) => {
  const tiers = WORKER_PAY.commissionTiers;
  for (let i = COMMISSION_TIER_ORDER.length - 1; i > 0; i--) {
    const key = COMMISSION_TIER_ORDER[i];
    if (meetsTier(tiers[key], counters)) return { key, commissionPct: tiers[key].commissionPct };
  }
  return { key: "new", commissionPct: tiers.new.commissionPct };
};

/** The next tier above `tierKey` with what is still missing for it. */
export const nextTierInfo = (tierKey, counters) => {
  const idx = COMMISSION_TIER_ORDER.indexOf(tierKey);
  if (idx < 0 || idx >= COMMISSION_TIER_ORDER.length - 1) return null;
  const key = COMMISSION_TIER_ORDER[idx + 1];
  const t = WORKER_PAY.commissionTiers[key];
  return {
    key,
    commissionPct: t.commissionPct,
    requirements: { minJobs: t.minJobs, minReviews: t.minReviews, minRating: t.minRating },
    missing: {
      jobs: Math.max(0, t.minJobs - counters.jobsCompleted),
      reviews: Math.max(0, t.minReviews - counters.verifiedReviews),
      // 0 when the rating requirement is already met
      rating: counters.ratingAvg != null && counters.ratingAvg >= t.minRating - 1e-9 ? 0 : t.minRating,
    },
  };
};

/**
 * Internal trust score 0–100 (admin ranking aid – NOT used for commission).
 * Normalised so a handful of 5★ reviews cannot max it out:
 * - rating (40): scaled from 3.0→5.0, dampened until ~10 reviews exist;
 * - review volume (25) and job volume (20): logarithmic ramps capped at the
 *   Diamond thresholds, so growth keeps counting but with diminishing returns;
 * - reliability (15): scaled from 50 %→100 %, neutral 7.5 when unknown.
 */
export const trustScore = (c, { activeStrikes: strikes = 0 } = {}) => {
  const diamond = WORKER_PAY.commissionTiers.diamond;
  const confidence = clamp01(c.verifiedReviews / 10);
  const rating = c.ratingAvg == null ? 0 : 40 * clamp01((c.ratingAvg - 3) / 2) * confidence;
  const reviews = 25 * clamp01(Math.log1p(c.verifiedReviews) / Math.log1p(diamond.minReviews));
  const jobs = 20 * clamp01(Math.log1p(c.jobsCompleted) / Math.log1p(diamond.minJobs));
  const reliability = c.reliabilityPct == null ? 7.5 : 15 * clamp01((c.reliabilityPct - 50) / 50);
  // Package E: −5 points per active reliability strike, never below 0
  return Math.max(0, Math.round(rating + reviews + jobs + reliability) - 5 * strikes);
};

/** Commission % that applies to the next completed job (override wins). */
export const effectiveCommissionPct = (worker, tier) =>
  worker?.workerCommission?.override?.commissionPct ?? tier.commissionPct;

/**
 * Recompute a cleaner's tier from live data, cache it on the user and write an
 * audit entry when the tier changed. Returns { worker, counters, tier }.
 * `reason` tags the audit entry with what triggered the change.
 */
export const refreshWorkerTier = async (workerId, { reason = "recalculation" } = {}) => {
  const worker = await User.findById(workerId).select("name role workerCommission reliability");
  if (!worker || worker.role !== "worker") return null;
  const counters = await commissionCounters(worker._id);
  const tier = tierForCounters(counters);
  const previous = worker.workerCommission?.tierKey;
  const changed = previous !== tier.key || worker.workerCommission?.commissionPct !== tier.commissionPct;
  if (changed) {
    worker.set("workerCommission.tierKey", tier.key);
    worker.set("workerCommission.commissionPct", tier.commissionPct);
    worker.set("workerCommission.computedAt", new Date());
    await worker.save();
    if (previous !== tier.key) {
      await recordAudit({
        action: "worker.commission_tier_changed",
        entityType: "user",
        entityId: worker._id,
        before: { tierKey: previous ?? null },
        after: { tierKey: tier.key, commissionPct: tier.commissionPct, trigger: reason, counters },
      });
    }
  } else if (!worker.workerCommission?.computedAt) {
    worker.set("workerCommission.computedAt", new Date());
    await worker.save();
  }
  return { worker, counters, tier };
};

/** Full performance view for dashboards (cleaner + admin). */
export const workerPerformance = async (workerId) => {
  const refreshed = await refreshWorkerTier(workerId);
  if (!refreshed) return null;
  const { worker, counters, tier } = refreshed;
  const override = worker.workerCommission?.override?.commissionPct != null ? worker.workerCommission.override : null;
  return {
    counters: { ...counters, ratingAvg: counters.ratingAvg == null ? null : round1(counters.ratingAvg) },
    tier: {
      key: tier.key,
      commissionPct: tier.commissionPct,
      effectivePct: effectiveCommissionPct(worker, tier),
      overridden: Boolean(override),
    },
    trustScore: trustScore(counters, { activeStrikes: activeStrikes(worker).length }),
    reliability: reliabilityView(worker),
    nextTier: override ? null : nextTierInfo(tier.key, counters),
  };
};

/** Daily safety net: recompute the tier of every approved cleaner. */
export const reconcileCommissionTiers = async () => {
  const workers = await User.find({ role: "worker", workerStatus: "approved" }).select("_id").lean();
  let changed = 0;
  for (const w of workers) {
    const before = await User.findById(w._id).select("workerCommission.tierKey").lean();
    const result = await refreshWorkerTier(w._id, { reason: "daily_reconciliation" });
    if (result && before?.workerCommission?.tierKey !== result.tier.key) changed++;
  }
  if (changed) console.log(`Commission reconciliation: ${changed} tier change(s).`);
  return changed;
};
