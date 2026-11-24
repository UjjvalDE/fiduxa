// Cleaner earnings: one workerPayout entry per completed job,
// paid out by the office after WORKER_PAY.payoutDelayDays.
import Booking from "../models/booking.model.js";
import Payout from "../models/payout.model.js";
import User from "../models/user.model.js";
import { DAY_MS } from "../utils/helpers.js";
import { WORKER_PAY } from "../config/pricing.js";
import { netPayout } from "./cash.service.js";

export const workerRateCents = (worker) => worker?.workerPayRateCents ?? WORKER_PAY.hourlyRateCents;

/** Record the cleaner's pay when a job is completed. Does NOT save. */
export const recordWorkerEarning = async (booking) => {
  if (!booking.assignedWorker || booking.workerPayout?.status) return;
  const worker = await User.findById(booking.assignedWorker).select("workerPayRateCents");
  const rateCents = workerRateCents(worker);
  const minutes = booking.estimate?.durationMinutes ?? 120;
  const earnedAt = booking.job?.completedAt ?? new Date();
  booking.workerPayout = {
    amountCents: Math.round((minutes / 60) * rateCents),
    rateCents,
    minutes,
    earnedAt,
    dueAt: new Date(earnedAt.getTime() + WORKER_PAY.payoutDelayDays * DAY_MS),
    status: "pending",
  };
};

/** pending → "pending" (waiting period) or "due" (ready to transfer) */
export const displayPayoutStatus = (p) => {
  if (!p?.status) return null;
  if (p.status === "pending" && new Date(p.dueAt) <= new Date()) return "due";
  return p.status;
};

const payoutReference = async () => {
  const d = new Date();
  const prefix = `AUS-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const count = await Payout.countDocuments({ reference: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
};

/**
 * Pay out all due jobs of a cleaner (or the given ones). Returns the Payout or null.
 * includeNotYetDue lets the office pay early.
 */
export const createPayout = async ({ workerId, bookingIds, includeNotYetDue = false, adminId, note = "" }) => {
  const filter = {
    assignedWorker: workerId,
    status: "completed",
    "workerPayout.status": "pending",
  };
  if (!includeNotYetDue) filter["workerPayout.dueAt"] = { $lte: new Date() };
  if (bookingIds?.length) filter._id = { $in: bookingIds };

  const bookings = await Booking.find(filter).select("workerPayout");
  if (bookings.length === 0) return null;

  const worker = await User.findById(workerId).select("bankAccountLast4");
  const paidAt = new Date();
  const payout = await Payout.create({
    worker: workerId,
    reference: await payoutReference(),
    // Net: pay minus cash the cleaner already kept (negative = cleaner owes us)
    amountCents: bookings.reduce((sum, b) => sum + netPayout(b.workerPayout), 0),
    bookings: bookings.map((b) => b._id),
    bankAccountLast4: worker?.bankAccountLast4 ?? "",
    paidAt,
    createdBy: adminId,
    note,
  });

  await Booking.updateMany(
    { _id: { $in: payout.bookings }, "workerPayout.status": "pending" },
    { $set: { "workerPayout.status": "paid", "workerPayout.paidAt": paidAt, "workerPayout.payout": payout._id } }
  );

  return payout;
};

/** Totals for the cleaner earnings page */
export const earningsSummary = async (workerId) => {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await Booking.find({ assignedWorker: workerId, "workerPayout.status": { $exists: true } })
    .select("workerPayout")
    .lean();

  // All sums are net (pay minus cash the cleaner kept from customers)
  const sum = (pred) => rows.filter((r) => pred(r.workerPayout)).reduce((s, r) => s + netPayout(r.workerPayout), 0);
  const gross = (pred) => rows.filter((r) => pred(r.workerPayout)).reduce((s, r) => s + (r.workerPayout.amountCents || 0), 0);
  const waiting = rows.filter((r) => r.workerPayout.status === "pending").map((r) => new Date(r.workerPayout.dueAt));

  return {
    // Earned this month (gross pay, before cash deductions)
    thisMonthCents: gross((p) => new Date(p.earnedAt) >= monthStart),
    cashHeldCents: rows.reduce((s, r) => s + (r.workerPayout.cashHeldCents || 0), 0),
    pendingCents: sum((p) => p.status === "pending" && new Date(p.dueAt) > now),
    dueCents: sum((p) => p.status === "pending" && new Date(p.dueAt) <= now),
    onHoldCents: sum((p) => p.status === "on_hold"),
    paidCents: sum((p) => p.status === "paid"),
    totalCents: sum(() => true),
    nextDueAt: waiting.length ? new Date(Math.min(...waiting.map((d) => d.getTime()))) : null,
    payoutDelayDays: WORKER_PAY.payoutDelayDays,
  };
};
