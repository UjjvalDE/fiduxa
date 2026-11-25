// Extra time requested by the cleaner during an active job.
//
// Flow (reuses booking.priceAdjustments – kind "duration", origin "cleaner"):
//   cleaner requests N minutes + reason (job "in_progress")
//     → adjustment status "proposed", expiresAt = now + EXTRA_TIME.expiryMinutes
//     → customer email + prompt in the account (approve / decline)
//   approve → booking duration, end time and price grow; the extra amount is
//             charged through the existing adjustment pay link (PayPal while
//             POLICIES.paymentMethods is PayPal-only); cleaner pay is
//             recalculated (on completion, or right away if already recorded).
//             Both sides get the new end time + final price.
//   decline → the cleaner is told to finish within the original time.
//   expiry  → unanswered requests expire after EXTRA_TIME.expiryMinutes (2 h)
//             or as soon as the job is completed/cancelled, whichever is first
//             (an answer after the job ended could not change the work done).
//             The cleaner is notified; nothing is charged.
import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import { OPERATIONS, PRICING, WORKER_PAY } from "../config/pricing.js";
import { findWorkerConflict, saveScheduleChange, workerConflictError } from "./job-dispatch.service.js";
import { httpError } from "../utils/helpers.js";
import { addPriceAdjustment, settleAdjustment } from "./money-policies.service.js";
import {
  sendExtraTimeDecisionEmails,
  sendExtraTimeExpiredEmail,
  sendExtraTimeRequestEmail,
} from "./extra-time-email.service.js";
import { sendAdminNotificationEmail, trySend } from "./email.service.js";

export const EXTRA_TIME = {
  minMinutes: 15,
  maxMinutes: 240,
  stepMinutes: 15,
  expiryMinutes: 120,
};

const MIN = 60 * 1000;

const toMinutes = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const toHHMM = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Planned end "HH:MM" of a booking (slotEnd, else start + duration) */
export const plannedEnd = (booking) => {
  if (booking.slotEnd) return booking.slotEnd;
  const start = toMinutes(booking.slot);
  return start == null ? "" : toHHMM(start + (booking.estimate?.durationMinutes ?? 0));
};

const shiftEnd = (booking, minutes) => {
  const end = toMinutes(plannedEnd(booking));
  return end == null ? "" : toHHMM(end + minutes);
};

export const isCleanerRequest = (a) => a?.origin === "cleaner";

export const openCleanerRequest = (booking) =>
  (booking.priceAdjustments ?? []).find((a) => isCleanerRequest(a) && a.status === "proposed");

/** Price of N extra minutes at the booking's hourly rate */
export const extraTimePrice = (booking, minutes) => Math.round((minutes / 60) * (booking.estimate?.hourlyRateCents ?? PRICING.hourlyRateCents));

/** Mark an unanswered cleaner request as expired (mutates; caller saves) */
const markExpired = (adjustment, why) => {
  adjustment.status = "expired";
  adjustment.resolvedAt = new Date();
  adjustment.reason = adjustment.reason || why;
};

/** Expire the request lazily when its deadline passed. Returns true if it expired now. */
export const expireIfDue = (booking, adjustment, now = new Date()) => {
  if (!isCleanerRequest(adjustment) || adjustment.status !== "proposed") return false;
  const jobOver = booking.status !== "in_progress";
  if (!jobOver && !(adjustment.expiresAt && adjustment.expiresAt <= now)) return false;
  markExpired(adjustment, jobOver ? "job ended" : "no answer");
  return true;
};

/** Cleaner: request extra time for the running job. Saves the booking. */
export const requestExtraTime = async (booking, worker, { minutes, reason }) => {
  if (booking.status !== "in_progress") throw httpError(409, "Extra time can only be requested while the job is in progress.");
  const open = openCleanerRequest(booking);
  if (open && !expireIfDue(booking, open)) {
    throw httpError(409, "There is already an open extra-time request for this job.");
  }
  // The longer job must not run into the cleaner's next job (incl. travel buffer)
  if (OPERATIONS.extraTimeBlockedByNextJob !== false && booking.assignedWorker) {
    const probe = { _id: booking._id, preferredDate: booking.preferredDate, slot: booking.slot, estimate: { durationMinutes: (booking.estimate?.durationMinutes ?? 0) + minutes } };
    const conflict = await findWorkerConflict(booking.assignedWorker, probe);
    if (conflict) {
      throw workerConflictError(conflict, `Extra time would overlap your next job ${conflict.reference} (incl. ${OPERATIONS.travelBufferMinutes} min travel). Please contact the office.`);
    }
  }
  const deltaCents = extraTimePrice(booking, minutes);
  const adjustment = addPriceAdjustment(booking, {
    deltaCents,
    reason,
    kind: "duration",
    minutes,
    by: worker._id,
    status: "proposed",
  });
  adjustment.origin = "cleaner";
  adjustment.expiresAt = new Date(Date.now() + EXTRA_TIME.expiryMinutes * MIN);
  adjustment.previousDurationMinutes = booking.estimate?.durationMinutes;
  adjustment.newSlotEnd = shiftEnd(booking, minutes);
  await booking.save();
  await trySend("Extra time request", () => sendExtraTimeRequestEmail({ booking, adjustment, workerName: worker.name }));
  return adjustment;
};

/** Cleaner pay after more time was approved (only while not yet paid out) */
const recalcWorkerPay = (booking) => {
  const p = booking.workerPayout;
  if (!p?.status || !["pending", "on_hold"].includes(p.status) || p.payout) return;
  const grossCents = booking.pricing?.totalCents ?? booking.estimate?.totalCents ?? 0;
  const minutes = booking.estimate?.durationMinutes ?? p.minutes;
  const amountCents =
    p.basis === "hourly"
      ? Math.round((minutes / 60) * (p.rateCents ?? WORKER_PAY.hourlyRateCents))
      : Math.max(0, grossCents - Math.round((grossCents * (p.commissionPct ?? 0)) / 100));
  booking.set("workerPayout.minutes", minutes);
  booking.set("workerPayout.grossCents", grossCents);
  booking.set("workerPayout.amountCents", amountCents);
  booking.set("workerPayout.commissionCents", grossCents - amountCents);
};

/** Apply an approved request to the booking: duration, end time, price, cleaner pay */
const applyExtraTime = (booking, adjustment) => {
  const minutes = adjustment.minutes;
  const estimate = { ...(booking.estimate ?? {}) };
  estimate.durationMinutes = (estimate.durationMinutes ?? 0) + minutes;
  estimate.extraTimeMinutes = (estimate.extraTimeMinutes ?? 0) + minutes;
  // Extra time is labour: keep the invoice line (hours × rate) in step with the total
  if (typeof estimate.labourCents === "number") estimate.labourCents += adjustment.deltaCents;
  booking.estimate = estimate;
  booking.markModified("estimate");
  if (adjustment.newSlotEnd) booking.slotEnd = adjustment.newSlotEnd;

  const total = (booking.pricing?.totalCents ?? booking.estimate?.totalCents ?? 0) + adjustment.deltaCents;
  const vatRate = booking.pricing?.vatRate ?? PRICING.vatRate ?? 0;
  booking.set("pricing.totalCents", total);
  booking.set("pricing.vatRate", vatRate);
  booking.set("pricing.vatCents", Math.round(total - total / (1 + vatRate)));
  recalcWorkerPay(booking);
};

/**
 * Customer decision on a cleaner's request. Saves the booking.
 * Throws 409 EXTRA_TIME_EXPIRED when the request is no longer answerable.
 */
export const decideExtraTime = async (booking, adjustment, decision, { actorId }) => {
  if (expireIfDue(booking, adjustment)) {
    await booking.save();
    await notifyExpired(booking, adjustment);
    throw Object.assign(httpError(409, "This extra-time request has expired."), { code: "EXTRA_TIME_EXPIRED" });
  }
  if (adjustment.status !== "proposed") throw httpError(409, "This adjustment has already been decided.");
  adjustment.decidedAt = new Date();
  if (decision === "decline") {
    adjustment.status = "declined";
    adjustment.resolvedAt = new Date();
    adjustment.resolvedBy = actorId;
  } else {
    applyExtraTime(booking, adjustment);
    // Positive amount → pay link (existing adjustment checkout) + customer mail
    await settleAdjustment(booking, adjustment, { actorId });
  }
  // Approved extra time lengthens the job: atomic overlap re-check for the cleaner
  if (decision !== "decline" && OPERATIONS.extraTimeBlockedByNextJob !== false) await saveScheduleChange(booking);
  else await booking.save();
  const worker = await User.findById(booking.assignedWorker).select("name email").lean();
  await trySend("Extra time decision", () => sendExtraTimeDecisionEmails({ booking, adjustment, worker, approved: decision === "approve" }));
  return adjustment;
};

const notifyExpired = async (booking, adjustment) => {
  const worker = await User.findById(booking.assignedWorker).select("name email").lean();
  if (worker) await trySend("Extra time expired", () => sendExtraTimeExpiredEmail({ booking, adjustment, worker }));
};

/** Job completed / cancelled: unanswered requests expire (mutates; caller saves) */
export const expireOpenRequestsOnJobEnd = (booking) => {
  const expired = [];
  for (const a of booking.priceAdjustments ?? []) {
    if (isCleanerRequest(a) && a.status === "proposed") {
      markExpired(a, "job ended");
      expired.push(a);
    }
  }
  return expired;
};

/** Scheduler sweep: expire requests whose deadline passed. Returns the count. */
export const expireStaleExtraTimeRequests = async (now = new Date()) => {
  const bookings = await Booking.find({
    priceAdjustments: { $elemMatch: { origin: "cleaner", status: "proposed", expiresAt: { $lte: now } } },
  }).limit(200);
  let count = 0;
  for (const booking of bookings) {
    const expired = [];
    for (const a of booking.priceAdjustments) if (expireIfDue(booking, a, now)) expired.push(a);
    if (!expired.length) continue;
    await booking.save();
    for (const a of expired) {
      count++;
      await notifyExpired(booking, a);
    }
  }
  if (count > 0) {
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({ subject: `${count} Mehrzeit-Anfrage(n) unbeantwortet abgelaufen`, lines: ["Es wurde nichts berechnet."] })
    );
  }
  return count;
};

/** Customer-facing view of a cleaner request (reason, minutes, price, deadline) */
export const extraTimeView = (a) => ({
  id: a._id,
  origin: a.origin,
  minutes: a.minutes,
  reason: a.reason,
  deltaCents: a.deltaCents,
  status: a.status,
  expiresAt: a.expiresAt ?? null,
  previousDurationMinutes: a.previousDurationMinutes ?? null,
  newSlotEnd: a.newSlotEnd ?? "",
  at: a.at,
  decidedAt: a.decidedAt ?? null,
  checkoutUrl: a.status === "open" ? a.checkoutUrl || "" : "",
});
