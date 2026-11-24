// Job completion pipeline – ONE place for everything that happens when a
// cleaning is done, whoever confirms it:
//   • cleaner "Done" after Start (completeMyJob)
//   • cleaner late confirmation of a past job ("Job erledigt bestätigen")
//   • admin correction (override with reason, audited)
// Cleaner pay, cash, extra-time expiry, invoice, thank-you + feedback e-mail.
//
// Also the job-confirmation watch (evening reminder to the cleaner, admin
// alert once the grace window is over) and the "did not happen" report.
import Booking from "../models/booking.model.js";
import { DAY_MS, formatGermanDate, httpError, slotLabel, slotStartInstant, todayInBerlin } from "../utils/helpers.js";
import { OPERATIONS } from "../config/pricing.js";
import { recordWorkerEarning } from "./payout.service.js";
import { recordCashPayment } from "./cash.service.js";
import { alertCashDebtIfNeeded } from "./money-policies.service.js";
import { flagDurationMismatch } from "./feedback.service.js";
import { issueInvoiceForBooking } from "./invoice.service.js";
import { expireOpenRequestsOnJobEnd } from "./extra-time.service.js";
import {
  sendAdminNotificationEmail,
  sendBookingStatusEmail,
  sendFeedbackRequestEmail,
  sendJobConfirmReminderEmail,
  trySend,
} from "./email.service.js";
import { logger } from "../utils/logger.js";

export const JOB_CONFIRMATION = {
  // A past job can be confirmed by the cleaner up to 7 days after the job date
  graceDays: 7,
  // Berlin hour after which the evening reminder for today's job goes out
  reminderHour: 19,
  // Plausible length of one cleaning (late confirmation)
  minMinutes: 15,
  maxMinutes: 12 * 60,
};

/** Statuses of a job that still waits for the cleaner's "done" */
export const OPEN_JOB_STATUSES = ["confirmed", "in_progress"];

const berlinHour = (now) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: OPERATIONS.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));

/** Last calendar day (inclusive) a job of `date` can still be confirmed late */
export const confirmDeadline = (date) => new Date(new Date(date).getTime() + JOB_CONFIRMATION.graceDays * DAY_MS);

/** Job is past (date before today), still open and not reported as "did not happen" */
export const needsConfirmation = (booking, today = todayInBerlin()) =>
  Boolean(booking.assignedWorker) &&
  OPEN_JOB_STATUSES.includes(booking.status) &&
  new Date(booking.preferredDate).getTime() < today.getTime() &&
  !booking.job?.notHappened?.reportedAt;

/** Late confirmation allowed: job day (after its start) up to graceDays later */
export const lateConfirmProblem = (booking, { now = new Date(), today = todayInBerlin() } = {}) => {
  if (!OPEN_JOB_STATUSES.includes(booking.status)) return "NOT_OPEN";
  if (booking.job?.notHappened?.reportedAt && booking.job.notHappened.decision === "pending") return "REPORTED_NOT_HAPPENED";
  const date = new Date(booking.preferredDate).getTime();
  if (date > today.getTime() || slotStartInstant(booking.preferredDate, booking.slot).getTime() > now.getTime()) return "NOT_YET";
  if (today.getTime() > confirmDeadline(booking.preferredDate).getTime()) return "WINDOW_CLOSED";
  return null;
};

const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Booked slot as default times for the late-confirmation form */
export const bookedTimes = (booking) => {
  const start = hhmm.test(booking.slot ?? "") ? booking.slot : "08:00";
  const end = hhmm.test(booking.slotEnd ?? "")
    ? booking.slotEnd
    : fromMinutes(Math.min(23 * 60 + 59, toMinutes(start) + (booking.estimate?.durationMinutes ?? 120)));
  return { startTime: start, endTime: end };
};

/**
 * Validate the actual times of a late confirmation (same day as the job).
 * Returns { startedAt, completedAt, minutes } or throws 422.
 */
export const resolveActualTimes = (booking, { startTime, endTime } = {}, { now = new Date() } = {}) => {
  const def = bookedTimes(booking);
  const start = startTime ?? def.startTime;
  const end = endTime ?? def.endTime;
  if (!hhmm.test(start) || !hhmm.test(end)) throw Object.assign(httpError(422, "Please enter times as HH:MM."), { code: "INVALID_TIME" });
  const minutes = toMinutes(end) - toMinutes(start);
  if (minutes <= 0) throw Object.assign(httpError(422, "The end time must be after the start time (same day)."), { code: "END_BEFORE_START" });
  if (minutes < JOB_CONFIRMATION.minMinutes || minutes > JOB_CONFIRMATION.maxMinutes) {
    throw Object.assign(
      httpError(422, `A cleaning must last between ${JOB_CONFIRMATION.minMinutes} minutes and ${JOB_CONFIRMATION.maxMinutes / 60} hours.`),
      { code: "DURATION_OUT_OF_RANGE" }
    );
  }
  const startedAt = slotStartInstant(booking.preferredDate, start);
  const completedAt = slotStartInstant(booking.preferredDate, end);
  if (completedAt.getTime() > now.getTime()) throw Object.assign(httpError(422, "The end time cannot be in the future."), { code: "END_IN_FUTURE" });
  return { startedAt, completedAt, minutes };
};

/**
 * Complete a job: the shared pipeline. Mutates + saves the booking.
 *  source: "worker" | "late" | "admin"
 * Cash bookings that are still open need cashCollectedCents (422 CASH_AMOUNT_REQUIRED)
 * – except an admin correction, which may record it later.
 * Returns { booking, feedbackPending }.
 */
export const completeJob = async (
  booking,
  { actor, source = "worker", note = "", checklistDone = [], cashCollectedCents, actualDurationMinutes, startedAt, completedAt, historyNote }
) => {
  const cashOpen = booking.payment?.method === "cash" && booking.payment?.status !== "paid";
  if (cashOpen && cashCollectedCents === undefined && source !== "admin") {
    throw Object.assign(httpError(422, "Please enter the cash amount you received from the customer."), { code: "CASH_AMOUNT_REQUIRED" });
  }

  // Claim atomically: a double tap / two devices / admin + cleaner at once
  // never run the pipeline twice (earning, invoice, e-mails).
  const claimed = await Booking.updateOne(
    { _id: booking._id, status: { $in: OPEN_JOB_STATUSES } },
    { $set: { status: "completed" } }
  );
  if (claimed.modifiedCount === 0) throw Object.assign(httpError(409, "This job is already completed."), { code: "ALREADY_COMPLETED" });

  booking.setStatus("completed", actor?._id ?? actor, historyNote ?? "Completed by worker");
  if (startedAt) booking.set("job.startedAt", startedAt);
  else if (!booking.job?.startedAt) booking.set("job.startedAt", completedAt ?? new Date());
  booking.set("job.completedAt", completedAt ?? new Date());
  if (note) booking.set("job.workerNote", note);
  if (checklistDone?.length) booking.set("job.checklistDone", checklistDone);
  if (source === "late") booking.set("job.lateConfirmation", true);
  if (actualDurationMinutes !== undefined) {
    booking.set("job.actualDurationMinutes", actualDurationMinutes);
    await flagDurationMismatch(booking);
  }
  // Unanswered extra-time requests end with the job (nothing is charged)
  expireOpenRequestsOnJobEnd(booking);
  await recordWorkerEarning(booking);
  const takeCash = cashOpen && cashCollectedCents !== undefined;
  if (takeCash) {
    await recordCashPayment(booking, { amountCents: cashCollectedCents, actorId: actor?._id ?? actor, byWorker: source !== "admin" });
  }
  await booking.save();
  // Cash held vs. pay: warn the office when the cleaner crosses the suspension line
  if (takeCash && source !== "admin") await alertCashDebtIfNeeded(actor);

  // Every completed cleaning has an invoice: online/cash-paid bookings got it
  // when the payment was recorded – everything else gets it now.
  if (!booking.invoice?.number) {
    try {
      await issueInvoiceForBooking(booking);
    } catch (error) {
      console.error(`Invoice creation on completion failed for ${booking.reference}:`, error.message);
    }
  }

  // Thank-you email with the invitation to rate the cleaner
  await trySend("Booking status", () => sendBookingStatusEmail({ booking, status: "completed" }));
  // One-time feedback request – never sent twice per booking (atomic flag)
  const flagged = await Booking.updateOne(
    { _id: booking._id, "feedback.emailedAt": { $exists: false } },
    { $set: { "feedback.emailedAt": new Date() } }
  );
  if (flagged.modifiedCount === 1) {
    booking.set("feedback.emailedAt", new Date());
    await trySend("Feedback request", () => sendFeedbackRequestEmail({ booking }));
  }

  // The cleaner app opens the (internal) feedback pop-up right away
  return { booking, feedbackPending: source !== "admin" };
};

// ---------------------------------------------------------------------------
// Job-confirmation watch (housekeeping, lock-guarded by the scheduler)
// ---------------------------------------------------------------------------

/**
 * 1) Evening reminder to the cleaner: today's job (after reminderHour) or a
 *    past job inside the grace window that is still not confirmed – once.
 * 2) Admin alert once the grace window is over – once.
 */
export const processJobConfirmations = async ({ now = new Date() } = {}) => {
  const today = todayInBerlin();
  const windowStart = new Date(today.getTime() - JOB_CONFIRMATION.graceDays * DAY_MS);
  const lastReminderDay = berlinHour(now) >= JOB_CONFIRMATION.reminderHour ? today : new Date(today.getTime() - DAY_MS);
  const base = {
    status: { $in: OPEN_JOB_STATUSES },
    assignedWorker: { $ne: null },
    "job.notHappened.reportedAt": { $exists: false },
  };

  let reminders = 0;
  const due = await Booking.find({
    ...base,
    preferredDate: { $gte: windowStart, $lte: lastReminderDay },
    "job.confirmReminderAt": { $exists: false },
  })
    .populate("assignedWorker", "name email preferredLanguage")
    .limit(200);
  for (const booking of due) {
    const claimed = await Booking.updateOne(
      { _id: booking._id, "job.confirmReminderAt": { $exists: false } },
      { $set: { "job.confirmReminderAt": now } }
    );
    if (claimed.modifiedCount === 0 || !booking.assignedWorker?.email) continue;
    reminders += 1;
    await trySend("Job confirm reminder", () => sendJobConfirmReminderEmail({ worker: booking.assignedWorker, booking }));
  }

  let alerts = 0;
  const stuck = await Booking.find({
    ...base,
    preferredDate: { $lt: windowStart },
    "job.stuckAlertAt": { $exists: false },
  })
    .populate("assignedWorker", "name phone")
    .limit(200);
  for (const booking of stuck) {
    const claimed = await Booking.updateOne(
      { _id: booking._id, "job.stuckAlertAt": { $exists: false } },
      { $set: { "job.stuckAlertAt": now } }
    );
    if (claimed.modifiedCount === 0) continue;
    alerts += 1;
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Auftrag nicht bestätigt: ${booking.reference}`,
        lines: [
          `Referenz: ${booking.reference}`,
          `Termin: ${formatGermanDate(booking.preferredDate)}, ${slotLabel(booking.slot, booking.slotEnd)}`,
          `Reinigungskraft: ${booking.assignedWorker?.name ?? "–"} (${booking.assignedWorker?.phone || "–"})`,
          `Status: ${booking.status}`,
          `Die Reinigungskraft hat den Auftrag ${JOB_CONFIRMATION.graceDays} Tage nach dem Termin nicht bestätigt.`,
          "Bitte klären und ggf. per Admin-Korrektur abschließen oder stornieren.",
        ],
      })
    );
    logger.warn({ bookingRef: booking.reference }, "Unconfirmed job after grace window");
  }

  return { reminders, alerts };
};

/** Admin dashboard: jobs waiting for the cleaner's confirmation or an admin decision */
export const findStuckJobs = async ({ limit = 50 } = {}) => {
  const today = todayInBerlin();
  const jobs = await Booking.find({
    status: { $in: OPEN_JOB_STATUSES },
    assignedWorker: { $ne: null },
    preferredDate: { $lt: today },
  })
    .select("reference preferredDate slot slotEnd status assignedWorker customerDetails.name job.notHappened job.stuckAlertAt")
    .populate("assignedWorker", "name")
    .sort({ preferredDate: 1 })
    .limit(limit)
    .lean();
  return jobs.map((b) => ({
    id: b._id,
    reference: b.reference,
    preferredDate: b.preferredDate,
    slot: b.slot,
    slotEnd: b.slotEnd,
    status: b.status,
    worker: b.assignedWorker?.name ?? null,
    customer: b.customerDetails?.name ?? null,
    notHappened: b.job?.notHappened?.reportedAt ? b.job.notHappened : null,
    windowClosed: today.getTime() > confirmDeadline(b.preferredDate).getTime(),
  }));
};
