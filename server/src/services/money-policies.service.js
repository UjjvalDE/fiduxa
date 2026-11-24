// Money policies (owner-approved, admin-configurable – see POLICIES):
//   · cancellation fees by time to start, cleaner share of the fee
//   · cash rules (booking limit, cleaner tier, cash-debt suspension)
//   · price adjustments after edits / duration reviews (pay link or refund)
// All amounts are integer cents. Nothing here saves a booking unless stated.
import Booking from "../models/booking.model.js";
import Payment from "../models/payment.model.js";
import User from "../models/user.model.js";
import { COMMISSION_TIER_ORDER, POLICIES, PRICING } from "../config/pricing.js";
import { DAY_MS, httpError, slotStartInstant } from "../utils/helpers.js";
import { commissionCounters, tierForCounters } from "./commission.service.js";
import { netPayout } from "./cash.service.js";
import { createAdjustmentCheckout, refundBookingPayment } from "./payment.service.js";
import { capturePayPalOrder } from "./paypal.service.js";
import { payoutEligibilityDays } from "./payout.service.js";
import { sendAdminNotificationEmail, trySend } from "./email.service.js";
import { sendCancellationFeeEmail, sendPriceAdjustmentEmail } from "./money-policies-email.service.js";

const HOUR_MS = 60 * 60 * 1000;
const euro = (cents) => `${(cents / 100).toFixed(2)} €`;

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

/** Online-paid amount of a booking (0 for cash / invoice / gift-card-only) */
export const paidOnlineCents = (booking) =>
  ["paid", "partially_refunded"].includes(booking.payment?.status) && ["stripe", "paypal"].includes(booking.payment?.method)
    ? booking.payment.amountCents ?? 0
    : 0;

/** Statuses a fee can apply to (a reservation that was never confirmed is always free) */
const FEE_STATUSES = ["confirmed", "in_progress"];

/**
 * What a cancellation costs right now: fee tier (free / late / very_late),
 * fee, refund of the online payment, outstanding part, cleaner share and the
 * cut-off instants for the UI. `noAccess` = cleaner could not get in (full fee).
 */
export const cancellationPreview = (booking, { now = new Date(), noAccess = false } = {}) => {
  const c = POLICIES.cancellation;
  const priceCents = booking.pricing?.totalCents ?? booking.estimate?.totalCents ?? 0;
  const start = slotStartInstant(booking.preferredDate, booking.slot);
  const freeUntil = new Date(start.getTime() - c.freeHours * HOUR_MS);
  const veryLateFrom = new Date(start.getTime() - c.veryLateHours * HOUR_MS);

  let tier = "free";
  let feePct = 0;
  if (FEE_STATUSES.includes(booking.status)) {
    if (noAccess || now.getTime() >= veryLateFrom.getTime()) {
      tier = "very_late";
      feePct = c.veryLateFeePct;
    } else if (now.getTime() > freeUntil.getTime()) {
      tier = "late";
      feePct = c.lateFeePct;
    }
  }
  const feeCents = Math.round((priceCents * feePct) / 100);
  const paidCents = paidOnlineCents(booking);
  const chargedCents = Math.min(feeCents, paidCents);
  const refundCents = Math.max(0, paidCents - feeCents);
  const outstandingCents = feeCents - chargedCents;
  const cleanerCents = booking.assignedWorker ? Math.round((feeCents * c.cleanerSharePct) / 100) : 0;

  return {
    tier,
    feePct,
    feeCents,
    priceCents,
    paidCents,
    chargedCents,
    refundCents,
    outstandingCents,
    cleanerCents,
    cutoffs: { start: start.toISOString(), freeUntil: freeUntil.toISOString(), veryLateFrom: veryLateFrom.toISOString() },
    policy: { freeHours: c.freeHours, lateFeePct: c.lateFeePct, veryLateHours: c.veryLateHours, veryLateFeePct: c.veryLateFeePct, cleanerSharePct: c.cleanerSharePct },
  };
};

/**
 * Book the money side of a fee-bearing cancellation on the booking (mutates,
 * does NOT save): partial refund of (paid − fee), outstanding fee on the
 * customer, cleaner earning for their share. Returns { refunded, refundPending }.
 */
export const applyCancellationFee = async (booking, fee, { actorId, reason = "" } = {}) => {
  let refunded = false;
  let refundPending = false;

  if (fee.paidCents > 0) {
    if (fee.refundCents > 0) {
      refunded = await refundBookingPayment(booking, {
        amountCents: fee.refundCents,
        reason: `Cancellation – fee ${euro(fee.feeCents)} kept`,
        by: actorId,
      });
      if (!refunded) {
        refundPending = true;
        booking.set("payment.status", "refund_pending");
      }
    }
    // refundCents === 0 → the whole payment is the fee; payment stays "paid"
  }

  if (fee.outstandingCents > 0) {
    await User.updateOne({ _id: booking.customer }, { $inc: { outstandingCents: fee.outstandingCents } });
  }

  // The assigned cleaner is compensated with their share of the fee (one
  // earning per booking – never overwrite an existing payout record)
  if (booking.assignedWorker && fee.cleanerCents > 0 && !booking.workerPayout?.status) {
    const now = new Date();
    const worker = await User.findById(booking.assignedWorker).select("workerCommission");
    booking.workerPayout = {
      amountCents: fee.cleanerCents,
      rateCents: 0,
      minutes: 0,
      grossCents: fee.feeCents,
      commissionCents: fee.feeCents - fee.cleanerCents,
      basis: "cancellation",
      commissionPct: 100 - POLICIES.cancellation.cleanerSharePct,
      tierKey: worker?.workerCommission?.tierKey ?? "new",
      cashHeldCents: 0,
      earnedAt: now,
      dueAt: new Date(now.getTime() + payoutEligibilityDays() * DAY_MS),
      status: "pending",
    };
  }

  booking.set("cancellation.feeCents", fee.feeCents);
  booking.set("cancellation.feePct", fee.feePct);
  booking.set("cancellation.cleanerCents", booking.assignedWorker ? fee.cleanerCents : 0);
  booking.set("cancellation.refundCents", refunded ? fee.refundCents : 0);
  booking.set("cancellation.charged", fee.chargedCents > 0);
  booking.set("cancellation.at", new Date());
  if (reason && !booking.cancellation?.reason) booking.set("cancellation.reason", reason);

  return { refunded, refundPending };
};

/** Fee notice to the customer (after the booking was saved) */
export const notifyCancellationFee = (booking, fee) =>
  trySend("Cancellation fee", () => sendCancellationFeeEmail({ booking, fee }));

// ---------------------------------------------------------------------------
// Cash policy
// ---------------------------------------------------------------------------

export const tierRank = (key) => Math.max(0, COMMISSION_TIER_ORDER.indexOf(key ?? "new"));

/** Cached tier of a cleaner, computed from live data when missing */
export const workerTierKey = async (worker) =>
  worker?.workerCommission?.tierKey ?? tierForCounters(await commissionCounters(worker._id)).key;

/** Unsettled net balance of a cleaner: pay − cash held (negative = owes cash) */
export const workerNetBalanceCents = async (workerId) => {
  const rows = await Booking.find({ assignedWorker: workerId, "workerPayout.status": { $in: ["pending", "on_hold", "processing"] } })
    .select("workerPayout")
    .lean();
  return rows.reduce((sum, r) => sum + netPayout(r.workerPayout), 0);
};

/** Cash bookings are limited to policies.cash.maxTotalCents (422 CASH_LIMIT) */
export const assertCashWithinLimit = (totalCents) => {
  const max = POLICIES.cash.maxTotalCents;
  if (totalCents > max) {
    throw Object.assign(httpError(422, `Cash payment is only possible up to ${euro(max)}.`), { code: "CASH_LIMIT", maxTotalCents: max });
  }
};

/** null | "tier" | "balance" – why a cleaner may not take cash jobs right now */
export const cashRestriction = async (worker) => {
  const tier = await workerTierKey(worker);
  if (tierRank(tier) < tierRank(POLICIES.cash.minTier)) return "tier";
  if ((await workerNetBalanceCents(worker._id)) < POLICIES.cash.suspendBelowCents) return "balance";
  return null;
};

const CASH_BLOCKED = {
  tier: "Cash jobs require at least the Bronze level. Please choose jobs paid online.",
  balance: "You are holding too much customer cash. Please settle it with the office before taking new cash jobs.",
};

/** Throws 409 CASH_BLOCKED when `worker` may not take the (still unpaid) cash job */
export const assertWorkerMayTakeCash = async (worker, booking) => {
  if (booking.payment?.method !== "cash" || booking.payment?.status === "paid") return;
  const why = await cashRestriction(worker);
  if (why) throw Object.assign(httpError(409, CASH_BLOCKED[why]), { code: `CASH_BLOCKED_${why.toUpperCase()}`, reason: why });
};

/** Cleaners whose net balance is below policies.cash.suspendBelowCents → [{ worker, netCents }] */
export const cashDebtCleaners = async () => {
  const rows = await Booking.aggregate([
    { $match: { assignedWorker: { $ne: null }, "workerPayout.status": { $in: ["pending", "on_hold", "processing"] } } },
    { $group: { _id: "$assignedWorker", netCents: { $sum: { $subtract: [{ $ifNull: ["$workerPayout.amountCents", 0] }, { $ifNull: ["$workerPayout.cashHeldCents", 0] }] } } } },
    { $match: { netCents: { $lt: POLICIES.cash.suspendBelowCents } } },
  ]);
  return rows.map((r) => ({ worker: r._id, netCents: r.netCents }));
};

/** After a cash job: warn the office once a cleaner crosses the suspension line */
export const alertCashDebtIfNeeded = async (worker) => {
  const net = await workerNetBalanceCents(worker._id);
  if (net >= POLICIES.cash.suspendBelowCents) return false;
  await trySend("Admin notification", () =>
    sendAdminNotificationEmail({
      subject: `Bar-Saldo unter Grenze: ${worker.name}`,
      lines: [
        `Reinigungskraft: ${worker.name} (${worker.email ?? ""})`,
        `Netto-Saldo (Vergütung − einbehaltenes Bargeld): ${euro(net)}`,
        `Grenze: ${euro(POLICIES.cash.suspendBelowCents)} – bis zur Abrechnung erhält sie keine neuen Bar-Aufträge.`,
      ],
    })
  );
  return true;
};

// ---------------------------------------------------------------------------
// Price adjustments (delta settlement after edits / duration reviews)
// ---------------------------------------------------------------------------

/** Append an adjustment entry (does NOT save). Returns the subdocument. */
export const addPriceAdjustment = (booking, { deltaCents, reason = "", kind = "edit", minutes, by, status = "open" }) => {
  booking.priceAdjustments.push({ deltaCents, reason, kind, minutes, by, status, at: new Date() });
  return booking.priceAdjustments[booking.priceAdjustments.length - 1];
};

/** Open / proposed adjustments of a booking */
export const openAdjustments = (booking) => (booking.priceAdjustments ?? []).filter((a) => ["open", "proposed"].includes(a.status));

/**
 * Settle an approved adjustment: positive → pay link (Payment purpose
 * "adjustment") + mail; negative → partial refund of the online payment.
 * Mutates the booking (caller saves). Returns the adjustment.
 */
export const settleAdjustment = async (booking, adjustment, { actorId } = {}) => {
  if (adjustment.deltaCents > 0) {
    adjustment.status = "open";
    try {
      const { url, paymentId } = await createAdjustmentCheckout(booking, adjustment);
      adjustment.checkoutUrl = url;
      adjustment.payment = paymentId;
      await trySend("Price adjustment", () => sendPriceAdjustmentEmail({ booking, adjustment, variant: "pay" }));
    } catch (error) {
      console.error(`Adjustment pay link failed for ${booking.reference}:`, error.message);
      await trySend("Admin notification", () =>
        sendAdminNotificationEmail({
          subject: `Nachzahlung ohne Zahlungslink: ${booking.reference}`,
          lines: [`Differenz: ${euro(adjustment.deltaCents)}`, `Grund: ${adjustment.reason || "-"}`, `Fehler: ${error.message}`, "Bitte bar / per Rechnung abrechnen und im Admin als bezahlt markieren."],
        })
      );
    }
    return adjustment;
  }

  if (adjustment.deltaCents < 0) {
    const refunded = await refundBookingPayment(booking, {
      amountCents: -adjustment.deltaCents,
      reason: `Price adjustment: ${adjustment.reason || adjustment.kind}`,
      by: actorId,
    });
    if (refunded) {
      adjustment.status = "refunded";
      adjustment.resolvedAt = new Date();
      adjustment.resolvedBy = actorId;
      await trySend("Price adjustment", () => sendPriceAdjustmentEmail({ booking, adjustment, variant: "refunded" }));
    } else {
      adjustment.status = "open";
      await trySend("Admin notification", () =>
        sendAdminNotificationEmail({
          subject: `Teilerstattung offen: ${booking.reference}`,
          lines: [`Betrag: ${euro(-adjustment.deltaCents)}`, `Grund: ${adjustment.reason || "-"}`, "Die automatische Erstattung war nicht möglich – bitte manuell erstatten."],
        })
      );
    }
    return adjustment;
  }

  adjustment.status = "waived";
  adjustment.resolvedAt = new Date();
  return adjustment;
};

/** Admin: propose a duration-based adjustment; the customer approves/declines in the account. */
export const proposeDurationAdjustment = async (booking, { minutes, note = "", by }) => {
  const rateCents = booking.estimate?.hourlyRateCents ?? PRICING.hourlyRateCents;
  const deltaCents = Math.round((minutes / 60) * rateCents);
  if (deltaCents === 0) throw httpError(422, "The duration change does not change the price.");
  const adjustment = addPriceAdjustment(booking, {
    deltaCents,
    reason: note || (minutes > 0 ? `${minutes} min longer than booked` : `${-minutes} min shorter than booked`),
    kind: "duration",
    minutes,
    by,
    status: "proposed",
  });
  await booking.save();
  await trySend("Price adjustment", () => sendPriceAdjustmentEmail({ booking, adjustment, variant: "proposal" }));
  return adjustment;
};

/** Customer decision on a proposed adjustment. Saves the booking. */
export const decideAdjustment = async (booking, adjustment, decision, { actorId }) => {
  if (adjustment.status !== "proposed") throw httpError(409, "This adjustment has already been decided.");
  adjustment.decidedAt = new Date();
  if (decision === "decline") {
    adjustment.status = "declined";
    adjustment.resolvedAt = new Date();
    adjustment.resolvedBy = actorId;
  } else {
    await settleAdjustment(booking, adjustment, { actorId });
  }
  await booking.save();
  return adjustment;
};

/** Admin: mark an open/proposed adjustment as paid (cash / invoice) or waive it. Saves. */
export const resolveAdjustment = async (booking, adjustment, { action, via = "invoice", actorId }) => {
  if (!["open", "proposed"].includes(adjustment.status)) throw httpError(409, "This adjustment is already settled.");
  const now = new Date();
  if (action === "waive") {
    adjustment.status = "waived";
  } else {
    if (adjustment.deltaCents < 0) throw httpError(409, "A negative adjustment is refunded, not paid. Use waive or refund it manually.");
    adjustment.status = "paid";
    adjustment.paidVia = via;
  }
  adjustment.resolvedAt = now;
  adjustment.resolvedBy = actorId;
  // A pay link that is still open is no longer needed
  await Payment.updateMany({ purpose: "adjustment", adjustment: adjustment._id, status: "created" }, { $set: { status: "expired" } });
  await booking.save();
  if (action === "waive") await trySend("Price adjustment", () => sendPriceAdjustmentEmail({ booking, adjustment, variant: "waived" }));
  return adjustment;
};

/** Webhook / capture: an adjustment pay link was paid. Returns the booking. */
export const applyPaidAdjustment = async (payment) => {
  const booking = await Booking.findById(payment.booking);
  if (!booking) return null;
  const adjustment = booking.priceAdjustments.id(payment.adjustment);
  if (!adjustment || adjustment.status === "paid") return booking;
  adjustment.status = "paid";
  adjustment.paidVia = "online";
  adjustment.payment = payment._id;
  adjustment.resolvedAt = new Date();
  await booking.save();
  await trySend("Price adjustment", () => sendPriceAdjustmentEmail({ booking, adjustment, variant: "paid" }));
  return booking;
};

/**
 * PayPal return for an adjustment pay link: capture the order, verify the
 * amount and mark the adjustment paid. Returns true when paid.
 */
export const captureAdjustmentPayPal = async ({ booking, payment, orderId }) => {
  if (payment.status === "paid") return true;
  if (payment.status === "expired" || booking.status === "cancelled") return false;
  const capture = await capturePayPalOrder(orderId);
  if (capture.status !== "COMPLETED") {
    payment.status = capture.status === "PENDING" ? "processing" : "failed";
    payment.paymentIntentId = capture.captureId;
    payment.failureReason = capture.status === "PENDING" ? "" : `PayPal status ${capture.status}`;
    await payment.save();
    return false;
  }
  if (capture.amountCents !== payment.amountCents || capture.currency !== "EUR") {
    payment.status = "failed";
    payment.paymentIntentId = capture.captureId;
    payment.failureReason = `Amount mismatch: got ${capture.amountCents} ${capture.currency}`;
    await payment.save();
    return false;
  }
  payment.status = "paid";
  payment.paidAt = new Date();
  payment.paymentIntentId = capture.captureId;
  await payment.save();
  await applyPaidAdjustment(payment);
  return true;
};

/** Refresh (or create) the pay link of an open positive adjustment for the account page */
export const adjustmentPayLink = async (booking, adjustment) => {
  if (adjustment.status !== "open" || adjustment.deltaCents <= 0) throw httpError(409, "There is nothing to pay for this adjustment.");
  const { url, paymentId } = await createAdjustmentCheckout(booking, adjustment);
  adjustment.checkoutUrl = url;
  adjustment.payment = paymentId;
  await booking.save();
  return url;
};
