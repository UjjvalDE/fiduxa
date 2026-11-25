// Cleaner earnings: one workerPayout entry per completed job (or per late
// cancellation with a fee), settled monthly: everything earned in a calendar
// month (Berlin time) becomes due on POLICIES.payouts.payoutDayOfMonth (5th)
// of the following month.
import Booking from "../models/booking.model.js";
import Payout from "../models/payout.model.js";
import User from "../models/user.model.js";
import { httpError, slotStartInstant } from "../utils/helpers.js";
import { OPERATIONS, POLICIES, WORKER_PAY } from "../config/pricing.js";
import { netPayout } from "./cash.service.js";
import { withLock } from "../utils/lock.js";
import { createPayPalPayout, getPayPalPayoutStatus, isPayPalConfigured } from "./paypal.service.js";
import { sendPayoutEmail, trySend } from "./email.service.js";
import { commissionCounters, effectiveCommissionPct, tierForCounters } from "./commission.service.js";

export const workerRateCents = (worker) => worker?.workerPayRateCents ?? WORKER_PAY.hourlyRateCents;

/** Day of the month on which the previous month's earnings are paid out */
export const payoutDayOfMonth = () => {
  const d = Number(POLICIES.payouts?.payoutDayOfMonth);
  return Number.isInteger(d) && d >= 1 && d <= 28 ? d : 5;
};

const berlinYearMonth = (date) => {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: OPERATIONS.timezone || "Europe/Berlin", year: "numeric", month: "2-digit" })
    .format(date)
    .split("-")
    .map(Number);
  return { y, m }; // m = 1..12
};

/** Payout date (00:00 Berlin on the payout day of the month after `earnedAt`) */
export const payoutDueAt = (earnedAt = new Date()) => {
  const { y, m } = berlinYearMonth(new Date(earnedAt));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const iso = `${ny}-${String(nm).padStart(2, "0")}-${String(payoutDayOfMonth()).padStart(2, "0")}`;
  return slotStartInstant(iso, "00:00");
};

/** Record the cleaner's pay when a job is completed. Does NOT save. */
/**
 * What a cleaner would earn for a job under the CURRENT pay model/tier –
 * shown on job offers and upcoming jobs. The binding amount is still the
 * immutable snapshot taken at completion (recordWorkerEarning).
 */
export const workerPayContext = async (worker) => {
  if (WORKER_PAY.payModel !== "commission") {
    return { basis: "hourly", rateCents: workerRateCents(worker) };
  }
  const tier = tierForCounters(await commissionCounters(worker._id));
  return { basis: "commission", commissionPct: effectiveCommissionPct(worker, tier) };
};

export const previewPayCents = (ctx, { grossCents = 0, minutes = 120 }) =>
  ctx.basis === "commission"
    ? Math.max(0, grossCents - Math.round((grossCents * ctx.commissionPct) / 100))
    : Math.round((minutes / 60) * ctx.rateCents);

export const recordWorkerEarning = async (booking) => {
  // Idempotent: once a payout record exists (status set), it is immutable –
  // duplicate completion events and later tier changes never rewrite it.
  if (!booking.assignedWorker || booking.workerPayout?.status) return;
  const worker = await User.findById(booking.assignedWorker).select("workerPayRateCents workerCommission");
  const rateCents = workerRateCents(worker);
  const minutes = booking.estimate?.durationMinutes ?? 120;
  const earnedAt = booking.job?.completedAt ?? new Date();
  // Commission base: what the customer pays for the job – after promotions and
  // recurring discounts, incl. VAT, before gift-card redemption (gift cards
  // are a payment method, not a discount).
  const grossCents = booking.pricing?.totalCents ?? booking.estimate?.totalCents ?? 0;

  let amountCents;
  let commissionFields;
  if (WORKER_PAY.payModel === "commission") {
    // Rating-based commission: the % snapshot taken now stays on the booking.
    const tier = tierForCounters(await commissionCounters(worker._id));
    const pct = effectiveCommissionPct(worker, tier);
    amountCents = Math.max(0, grossCents - Math.round((grossCents * pct) / 100));
    commissionFields = { basis: "commission", commissionPct: pct, tierKey: tier.key };
  } else {
    amountCents = Math.round((minutes / 60) * rateCents);
    commissionFields = { basis: "hourly" };
  }

  booking.workerPayout = {
    amountCents,
    rateCents,
    minutes,
    grossCents,
    commissionCents: grossCents - amountCents,
    ...commissionFields,
    earnedAt,
    dueAt: payoutDueAt(earnedAt),
    status: "pending",
  };
};

/** pending → "pending" (waiting period) or "due" (eligible) · on_hold · processing · paid */
export const displayPayoutStatus = (p) => {
  if (!p?.status) return null;
  if (p.status === "pending" && new Date(p.dueAt) <= new Date()) return "due";
  return p.status;
};

const maskEmail = (email) => {
  const [local = "", domain = ""] = String(email || "").split("@");
  return local && domain ? `${local[0]}•••@${domain}` : "";
};

/** How a cleaner gets paid: { type: "bank"|"paypal", target } for display */
export const payoutTarget = (worker) => {
  const type = worker?.payoutMethod?.type === "paypal" && worker.payoutMethod.paypalEmail ? "paypal" : "bank";
  return {
    type,
    target: type === "paypal" ? maskEmail(worker.payoutMethod.paypalEmail) : worker?.bankAccountLast4 ? `•••• ${worker.bankAccountLast4}` : "",
  };
};

const payoutReference = async () => {
  const d = new Date();
  const prefix = `AUS-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const count = await Payout.countDocuments({ reference: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
};

/** Payout confirmed by the provider (or recorded manually): jobs become paid */
const finalizePayout = async (payout, refs = {}) => {
  payout.status = "paid";
  payout.paidAt = new Date();
  if (refs.batchId) payout.providerBatchId = refs.batchId;
  // Prefer the PayPal transaction id (what the cleaner sees in their account)
  payout.providerItemId = refs.transactionId ?? refs.itemId ?? payout.providerItemId;
  await payout.save();
  await Booking.updateMany(
    { "workerPayout.payout": payout._id, "workerPayout.status": "processing" },
    { $set: { "workerPayout.status": "paid", "workerPayout.paidAt": payout.paidAt } }
  );
  const worker = await User.findById(payout.worker).select("name email preferredLanguage");
  if (worker) await trySend("Payout", () => sendPayoutEmail({ worker, payout }));
  return payout;
};

/** Payout failed: release the jobs so a retry settles them safely */
const failPayout = async (payout, reason) => {
  payout.status = "failed";
  payout.failureReason = String(reason || "").slice(0, 500);
  await payout.save();
  await Booking.updateMany(
    { "workerPayout.payout": payout._id, "workerPayout.status": "processing" },
    { $set: { "workerPayout.status": "pending", "workerPayout.payout": null } }
  );
  return payout;
};

/**
 * Settle a cleaner's eligible earnings (admin action, one at a time per cleaner).
 *   provider "bank":   the admin made the transfer → recorded as paid at once.
 *   provider "paypal": a sandbox/live payout is initiated via the Payouts API;
 *                      jobs are "processing" until PayPal confirms. DENIED or a
 *                      definite API error releases the jobs for a retry.
 * Duplicate settlements are impossible: jobs are claimed atomically
 * (pending → processing) under a per-worker lock.
 * Returns the Payout, or null when nothing is eligible.
 */
export const settleWorker = async ({ workerId, bookingIds, includeNotYetDue = false, adminId, note = "", method }) =>
  withLock(`payout:${workerId}`, async () => {
    const worker = await User.findById(workerId).select(
      "name email preferredLanguage bankAccountLast4 payoutMethod"
    );
    if (!worker) throw httpError(404, "Worker not found.");

    // Completed jobs AND cancelled bookings with a cleaner share of the fee
    const filter = {
      assignedWorker: workerId,
      status: { $in: ["completed", "cancelled"] },
      "workerPayout.status": "pending",
    };
    if (!includeNotYetDue) filter["workerPayout.dueAt"] = { $lte: new Date() };
    if (bookingIds?.length) filter._id = { $in: bookingIds };

    const bookings = await Booking.find(filter).select("workerPayout");
    if (bookings.length === 0) return null;

    const amountCents = bookings.reduce((sum, b) => sum + netPayout(b.workerPayout), 0);
    const provider = method ?? (worker.payoutMethod?.type === "paypal" ? "paypal" : "bank");

    if (provider === "paypal") {
      if (!isPayPalConfigured()) throw httpError(503, "PayPal is not configured.");
      if (!worker.payoutMethod?.paypalEmail) {
        throw httpError(409, "This cleaner has not set a PayPal address for payouts.");
      }
      if (amountCents <= 0) {
        throw httpError(409, "A zero or negative amount cannot be sent via PayPal. Settle it as a bank entry.");
      }
    }

    const payout = await Payout.create({
      worker: workerId,
      reference: await payoutReference(),
      status: "processing",
      provider,
      amountCents,
      bookings: bookings.map((b) => b._id),
      bankAccountLast4: worker.bankAccountLast4 ?? "",
      paypalEmail: provider === "paypal" ? worker.payoutMethod.paypalEmail : "",
      initiatedAt: new Date(),
      createdBy: adminId,
      note,
    });

    // Claim the jobs atomically – a second settlement finds nothing to claim
    const claim = await Booking.updateMany(
      { _id: { $in: payout.bookings }, "workerPayout.status": "pending" },
      { $set: { "workerPayout.status": "processing", "workerPayout.payout": payout._id } }
    );
    if (claim.modifiedCount !== bookings.length) {
      await failPayout(payout, "Earnings changed while settling. Please try again.");
      throw httpError(409, "The earnings changed while settling. Please try again.");
    }

    if (provider === "bank") return finalizePayout(payout);

    // PayPal sandbox/live payout. The payout id is the idempotency key.
    try {
      const { batchId } = await createPayPalPayout({
        senderBatchId: `fiduxa-${payout._id}`,
        receiverEmail: worker.payoutMethod.paypalEmail,
        amountCents,
        note: `Fiduxa Auszahlung ${payout.reference}`,
      });
      payout.providerBatchId = batchId;
      await payout.save();

      // Short poll – the sandbox usually settles quickly; otherwise it stays
      // "processing" and the admin refreshes it.
      for (let i = 0; i < 5; i++) {
        const status = await getPayPalPayoutStatus(batchId);
        if (status.status === "SUCCESS") {
          return finalizePayout(payout, { batchId, itemId: status.itemId, transactionId: status.transactionId });
        }
        if (["DENIED", "FAILED", "CANCELED"].includes(status.status) || status.itemStatus === "DENIED") {
          return failPayout(payout, status.errorMessage || `PayPal: ${status.status}`);
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      return payout; // still processing
    } catch (error) {
      if (error?.paypal) {
        // Definite answer from PayPal (request was received and refused)
        return failPayout(payout, error.message);
      }
      // Network failure with unknown outcome: keep "processing", never retry
      // blindly – the admin refreshes it against the provider.
      throw error;
    }
  });

/** Re-check a processing PayPal payout against the provider and settle its state */
export const refreshPayout = async (payoutId, { forceFail = false } = {}) => {
  const payout = await Payout.findById(payoutId);
  if (!payout) throw httpError(404, "Payout not found.");
  if (payout.status !== "processing") return payout;

  if (payout.provider === "paypal" && payout.providerBatchId) {
    const status = await getPayPalPayoutStatus(payout.providerBatchId);
    if (status.status === "SUCCESS") {
      return finalizePayout(payout, { batchId: payout.providerBatchId, itemId: status.itemId, transactionId: status.transactionId });
    }
    if (["DENIED", "FAILED", "CANCELED"].includes(status.status) || status.itemStatus === "DENIED") {
      return failPayout(payout, status.errorMessage || `PayPal: ${status.status}`);
    }
    if (forceFail) return failPayout(payout, "Marked as failed by admin.");
    return payout;
  }

  // No provider reference (the request never got an answer): only a manual decision
  if (forceFail) return failPayout(payout, "Marked as failed by admin (no provider reference).");
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
  const processingCents = sum((p) => p.status === "processing");
  const gross = (pred) => rows.filter((r) => pred(r.workerPayout)).reduce((s, r) => s + (r.workerPayout.amountCents || 0), 0);
  const waiting = rows.filter((r) => r.workerPayout.status === "pending").map((r) => new Date(r.workerPayout.dueAt));

  return {
    // Earned this month (gross pay, before cash deductions)
    thisMonthCents: gross((p) => new Date(p.earnedAt) >= monthStart),
    cashHeldCents: rows.reduce((s, r) => s + (r.workerPayout.cashHeldCents || 0), 0),
    pendingCents: sum((p) => p.status === "pending" && new Date(p.dueAt) > now),
    dueCents: sum((p) => p.status === "pending" && new Date(p.dueAt) <= now),
    onHoldCents: sum((p) => p.status === "on_hold"),
    processingCents,
    paidCents: sum((p) => p.status === "paid"),
    totalCents: sum(() => true),
    nextDueAt: waiting.length ? new Date(Math.min(...waiting.map((d) => d.getTime()))) : null,
    payoutDayOfMonth: payoutDayOfMonth(),
  };
};
