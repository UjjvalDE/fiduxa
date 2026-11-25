// Automatic cleaner assignment (round 3, POLICIES.assignment.mode = "auto").
//
// Flow
//   payment confirmed / gift card covers everything / admin manual booking
//   → confirmBooking() → autoAssign(): the best SUITABLE cleaner (see
//   matching.service.js) gets the job – no accept step. The time is already
//   held by the reservation (availability.service.js) since the booking was
//   created, so a suitable cleaner exists unless something changed meanwhile.
//
// Safety
//   – booking lock  `assign:<bookingId>`: one assignment run per booking at a
//     time; a booking that already has a cleaner is never assigned again, so
//     a repeated capture / webhook / retry is a no-op (idempotent).
//   – cleaner lock  `worker-schedule:<id>` (job-dispatch.service.js): the
//     overlap + workload re-check and the write happen as one step.
//   – the write itself is conditional ({ assignedWorker: null }) – exactly
//     one active assignment per booking – and runs in a MongoDB transaction
//     (booking + audit entry) when the deployment supports transactions
//     (replica set / sharded). A standalone server (tests, small installs)
//     falls back to the lock pattern above, which is equally safe here.
//   – the assignment is only confirmed (assignment.state = "assigned",
//     e-mails, notice) AFTER that schedule write succeeded.
//
// No suitable cleaner → never cancelled silently: state "needs_attention",
// admin informed at once, customer offered alternative times (pick / wait /
// cancel free with a full refund). A background job retries every
// POLICIES.assignment.retryMinutes and escalates close to the start.
import mongoose from "mongoose";

import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import AuditLog from "../models/audit-log.model.js";
import { POLICIES } from "../config/pricing.js";
import { DAY_MS, formatGermanDate, httpError, slotLabel, slotStartInstant, todayInBerlin } from "../utils/helpers.js";
import { withLock } from "../utils/lock.js";
import { findWorkerConflict, jobTimeRange, offerJob, withWorkerSchedule, workerConflictError } from "./job-dispatch.service.js";
import { PROBLEM_LABELS, jobProfile, loadSchedules, mainReason, rankCandidates, summariseProblems, workloadProblem } from "./matching.service.js";
import { assertWorkerMayTakeCash } from "./money-policies.service.js";
import { bumpAvailability, moveBooking, slotsForBooking } from "./availability.service.js";
import { recordAudit } from "./audit.service.js";
import { sendAdminNotificationEmail, sendCleanerAssignedEmail, trySend } from "./email.service.js";
import { sendAutoAssignedToWorkerEmail, sendCleanerChangedEmail, sendJobRemovedEmail, sendNoCleanerEmail } from "./assignment-email.service.js";
import { isAutoMode } from "./assignment-mode.js";

const rules = () => POLICIES.assignment;
const bookingLock = (id, fn) => withLock(`assign:${id}`, fn);

// ---------------------------------------------------------------------------
// Transactions (replica set) with a fallback for standalone servers
// ---------------------------------------------------------------------------
let txSupport = null;
export const supportsTransactions = async () => {
  if (txSupport !== null) return txSupport;
  if (process.env.ASSIGNMENT_TRANSACTIONS === "false") return (txSupport = false);
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    txSupport = Boolean(hello.setName || hello.msg === "isdbgrid");
  } catch {
    txSupport = false;
  }
  return txSupport;
};

const runAtomic = async (fn) => {
  if (!(await supportsTransactions())) return fn(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const entry = (action, { worker = null, previousWorker = null, by = null, byRole = "system", reason = "", score, details } = {}) => ({
  at: new Date(),
  action,
  worker,
  previousWorker,
  by,
  byRole,
  reason: String(reason ?? "").slice(0, 500),
  ...(score !== undefined && { score }),
  ...(details && { details }),
});

const audit = (session, { actor, action, booking, before = null, after = null }) =>
  AuditLog.create([{ actor: actor ?? null, action, entityType: "Booking", entityId: booking._id, before, after }], session ? { session } : {});

const isFuture = (booking) => jobTimeRange(booking).start.getTime() > Date.now();

// ---------------------------------------------------------------------------
// Write one assignment (under the cleaner's schedule lock)
// ---------------------------------------------------------------------------
/**
 * Atomically give `booking` to `worker` if it still has `expectWorker`
 * (null = unassigned). Re-checks overlaps and workload under the cleaner's
 * schedule lock. Returns the updated booking or null (taken / clash).
 * Throws 409 WORKER_SCHEDULE_CONFLICT when `throwOnConflict`.
 */
const writeAssignment = (booking, worker, { expectWorker = null, action = "assigned", by = null, byRole = "system", reason = "", score, details, throwOnConflict = false, skipWorkload = false }) =>
  withWorkerSchedule(worker._id, async () => {
    const conflict = await findWorkerConflict(worker._id, booking);
    if (conflict) {
      if (throwOnConflict) throw workerConflictError(conflict);
      return null;
    }
    if (!skipWorkload) {
      const schedules = await loadSchedules([worker._id], [booking.preferredDate], { excludeId: booking._id });
      if (workloadProblem(worker, schedules.get(String(worker._id)), jobProfile(booking))) return null;
    }
    return runAtomic(async (session) => {
      const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, status: "confirmed", assignedWorker: expectWorker },
        {
          $set: {
            assignedWorker: worker._id,
            assignedAt: new Date(),
            assignedBy: by,
            "assignment.state": "assigned",
            "assignment.reason": "",
            "assignment.score": score ?? null,
            "assignment.workerSeenAt": null,
            "assignment.escalatedAt": null,
          },
          $push: { assignmentHistory: entry(action, { worker: worker._id, previousWorker: expectWorker, by, byRole, reason, score, details }) },
        },
        { returnDocument: "after", ...(session && { session }) }
      );
      if (!updated) return null;
      await audit(session, {
        actor: by,
        action: action === "reassigned" ? "booking.worker.reassigned" : "booking.worker.auto_assigned",
        booking: updated,
        before: { assignedWorker: expectWorker },
        after: { assignedWorker: worker._id, score: score ?? null, reason, byRole },
      });
      return updated;
    });
  });

/** E-mails + "notified" history after a successful assignment */
const afterAssigned = async (booking, worker, { changed = false, previousWorker = null } = {}) => {
  bumpAvailability();
  await trySend("Job assigned", () => sendAutoAssignedToWorkerEmail({ worker, booking }));
  if (changed) await trySend("Cleaner changed", () => sendCleanerChangedEmail({ booking, workerName: worker.name }));
  else await trySend("Cleaner assigned", () => sendCleanerAssignedEmail({ booking, workerName: worker.name }));
  if (previousWorker) {
    const prev = await User.findById(previousWorker).select("name email preferredLanguage");
    if (prev) await trySend("Job removed", () => sendJobRemovedEmail({ worker: prev, booking }));
  }
  await Booking.updateOne(
    { _id: booking._id },
    { $push: { assignmentHistory: entry("notified", { worker: worker._id, reason: changed ? "cleaner + customer (cleaner changed)" : "cleaner + customer" }) } }
  );
};

// ---------------------------------------------------------------------------
// Automatic assignment
// ---------------------------------------------------------------------------
const autoAssignLocked = async (bookingId, { by = null, byRole = "system", reason = "payment confirmed", preferWorker = null, changed = false, previousWorker = null } = {}) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { state: "missing" };
  if (booking.assignedWorker) return { state: "already_assigned", booking };
  if (booking.status !== "confirmed") return { state: "skipped", booking };
  if (!isFuture(booking)) return { state: "past", booking };

  const rows = await rankCandidates(booking, { preferWorker });
  await Booking.updateOne({ _id: booking._id }, { $inc: { "assignment.attempts": 1 }, $set: { "assignment.lastAttemptAt": new Date() } });
  for (const row of rows) {
    if (!row.suitable) break;
    try {
      await assertWorkerMayTakeCash(row.worker, booking);
    } catch {
      continue; // cash rules (tier / cash held) – next candidate
    }
    const updated = await writeAssignment(booking, row.worker, {
      by,
      byRole,
      reason,
      score: row.score.total,
      details: { parts: row.score.parts, km: row.score.km, candidates: rows.filter((r) => r.suitable).length },
    });
    if (updated) {
      await afterAssigned(updated, row.worker, { changed, previousWorker });
      return { state: "assigned", booking: updated, worker: row.worker, score: row.score.total };
    }
  }
  return markNeedsAttention(booking, rows, { by, byRole, reason });
};

/**
 * Assign the best suitable cleaner to a confirmed booking without one.
 * Idempotent: an assigned booking is left as it is.
 */
export const autoAssign = (bookingId, opts = {}) => bookingLock(bookingId, () => autoAssignLocked(bookingId, opts));

/** Hook for confirmBooking(): auto mode assigns, board mode offers the job */
export const assignAfterConfirmation = async (booking, { by = null, byRole = "system", reason = "payment confirmed" } = {}) => {
  if (booking.assignedWorker) return { state: "already_assigned" };
  if (!isAutoMode()) {
    await offerJob(booking);
    await booking.save();
    return { state: "offered" };
  }
  try {
    return await autoAssign(booking._id, { by, byRole, reason });
  } catch (error) {
    // Never lose the booking: the retry job picks it up
    console.error(`Auto-assignment failed for ${booking.reference}:`, error.message);
    return { state: "error", error: error.message };
  }
};

// ---------------------------------------------------------------------------
// Nobody suitable → needs attention
// ---------------------------------------------------------------------------
const ALTERNATIVE_DAYS_BEFORE = 3;
const ALTERNATIVE_DAYS_AFTER = 10;
const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
};

/** The next N genuinely free times near the booked one (suitable cleaner free) */
export const computeAlternatives = async (booking, n = rules().alternativesCount ?? 5) => {
  const tomorrow = todayInBerlin().getTime() + DAY_MS;
  const latest = todayInBerlin().getTime() + 90 * DAY_MS;
  const base = new Date(booking.preferredDate).getTime();
  const origin = toMin(booking.slot);
  const found = [];
  for (let d = -ALTERNATIVE_DAYS_BEFORE; d <= ALTERNATIVE_DAYS_AFTER; d++) {
    const t = base + d * DAY_MS;
    if (t < tomorrow || t > latest) continue;
    const date = new Date(t);
    const options = await slotsForBooking(booking, date);
    for (const o of options) {
      if (d === 0 && o.startTime === booking.slot) continue;
      found.push({ date: date.toISOString().slice(0, 10), slotId: o.windowId, startTime: o.startTime, endTime: o.endTime, distance: Math.abs(d * 1440 + toMin(o.startTime) - origin) });
    }
  }
  return found
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n)
    .map(({ distance: _d, ...rest }) => rest)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
};

const markNeedsAttention = async (booking, rows, { by, byRole, reason }) => {
  const code = mainReason(rows);
  const counts = summariseProblems(rows);
  const first = booking.assignment?.state !== "needs_attention";
  const set = { "assignment.state": "needs_attention", "assignment.reason": code, "assignment.reasons": counts };
  if (first) set["assignment.needsAttentionAt"] = new Date();
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, assignedWorker: null },
    { $set: set, ...(first && { $push: { assignmentHistory: entry("needs_attention", { by, byRole, reason: `${reason}: ${PROBLEM_LABELS[code] ?? code}`, details: counts }) } }) },
    { returnDocument: "after" }
  );
  if (!updated) return { state: "already_assigned" };
  if (!first) return { state: "needs_attention", reason: code, booking: updated };

  await recordAudit({ actor: by, action: "booking.assignment.needs_attention", entityType: "Booking", entityId: booking._id, after: { reason: code, counts, trigger: reason } });
  await trySend("Admin notification", () =>
    sendAdminNotificationEmail({
      bookingRef: updated.reference,
      subject: `Keine Reinigungskraft gefunden: ${updated.reference}`,
      lines: [
        `Referenz: ${updated.reference}`,
        `Termin: ${formatGermanDate(updated.preferredDate)}, ${slotLabel(updated.slot, updated.slotEnd)}`,
        `PLZ: ${updated.customerDetails.postcode}`,
        `Grund: ${PROBLEM_LABELS[code] ?? code}`,
        `Auslöser: ${reason}`,
        "Die Kundin / der Kunde bekommt Ausweichtermine angeboten. Bitte unter Admin → Disposition prüfen.",
      ],
    })
  );
  await Booking.updateOne({ _id: booking._id }, { $set: { "assignment.adminNotifiedAt": new Date() } });

  // Alternatives for the customer (once per needs-attention episode)
  try {
    const alternatives = await computeAlternatives(updated);
    await Booking.updateOne({ _id: booking._id }, { $set: { "assignment.alternatives": alternatives, "assignment.alternativesSentAt": new Date(), "assignment.customerChoice": null } });
    updated.set("assignment.alternatives", alternatives);
    await trySend("No cleaner available", () => sendNoCleanerEmail({ booking: updated, alternatives }));
  } catch (error) {
    console.error(`Alternatives failed for ${updated.reference}:`, error.message);
  }
  return { state: "needs_attention", reason: code, booking: updated };
};

// ---------------------------------------------------------------------------
// Replacement (emergency, suspension, block, document expiry, admin removal)
// ---------------------------------------------------------------------------
export const REPLACEMENT_KINDS = ["emergency", "removed", "suspended", "blocked", "paused", "documents", "no_show"];

/**
 * Take the job away from `workerId`, exclude them for this booking and
 * assign the next best cleaner (auto mode) – or re-open it on the board.
 * Idempotent: does nothing if the booking no longer belongs to `workerId`.
 */
export const replaceAssignment = (bookingId, { workerId, kind = "removed", reason = "", by = null, byRole = "system", notifyPrevious = true } = {}) =>
  bookingLock(bookingId, async () => {
    const booking = await Booking.findById(bookingId);
    if (!booking || !booking.assignedWorker || String(booking.assignedWorker) !== String(workerId)) return { state: "not_assigned" };
    if (booking.status !== "confirmed") return { state: "skipped" };
    const updated = await runAtomic(async (session) => {
      const doc = await Booking.findOneAndUpdate(
        { _id: booking._id, assignedWorker: workerId, status: "confirmed" },
        {
          $set: { assignedWorker: null, assignedAt: null, assignedBy: null, "assignment.state": null, "assignment.score": null, "jobOffer.unassignedAlertSentAt": null },
          $addToSet: { "assignment.excluded": workerId, ...(["emergency", "no_show"].includes(kind) && { "jobOffer.releasedBy": workerId }) },
          $push: { assignmentHistory: entry(kind === "emergency" ? "emergency" : "removed", { worker: workerId, by, byRole, reason: reason || kind, details: { kind } }) },
        },
        { returnDocument: "after", ...(session && { session }) }
      );
      if (doc) await audit(session, { actor: by, action: `booking.worker.${kind === "emergency" ? "emergency" : "removed"}`, booking: doc, before: { assignedWorker: workerId }, after: { kind, reason, byRole } });
      return doc;
    });
    if (!updated) return { state: "not_assigned" };
    bumpAvailability();
    if (!isFuture(updated)) return { state: "past", booking: updated };
    if (!isAutoMode()) {
      await offerJob(updated);
      await updated.save();
      return { state: "offered", booking: updated };
    }
    const result = await autoAssignLocked(updated._id, { by, byRole, reason: `replacement (${kind})`, changed: true, previousWorker: notifyPrevious && kind !== "emergency" ? workerId : null });
    return { ...result, replaced: true };
  });

/**
 * Replace a cleaner on all their future confirmed jobs (suspension, block,
 * pause) – optionally only jobs before `until` / from `from`.
 */
export const replaceWorkerJobs = async (workerId, { kind, reason = "", by = null, byRole = "system", from = null, until = null } = {}) => {
  // Board mode (legacy): jobs stay where they are, the office reassigns by hand
  if (!isAutoMode()) return { total: 0, assigned: 0, needsAttention: 0, skipped: "board mode" };
  const today = todayInBerlin();
  const filter = {
    assignedWorker: workerId,
    status: "confirmed",
    preferredDate: { $gte: from && from > today ? from : today, ...(until && { $lte: until }) },
  };
  const jobs = await Booking.find(filter).select("_id preferredDate slot estimate.durationMinutes").lean();
  const result = { total: 0, assigned: 0, needsAttention: 0 };
  for (const job of jobs) {
    if (slotStartInstant(job.preferredDate, job.slot).getTime() <= Date.now()) continue;
    const r = await replaceAssignment(job._id, { workerId, kind, reason, by, byRole });
    result.total += 1;
    if (r.state === "assigned") result.assigned += 1;
    if (r.state === "needs_attention") result.needsAttention += 1;
  }
  return result;
};

// ---------------------------------------------------------------------------
// Admin: manual (re)assignment from the ranked list – same locks
// ---------------------------------------------------------------------------
const HARD_PROBLEMS = ["inactive", "paused", "documents", "busy", "holiday", "day_off", "pets"];

export const manualAssign = (bookingId, { workerId, by, reason = "", override = false }) =>
  bookingLock(bookingId, async () => {
    const booking = await Booking.findById(bookingId);
    if (!booking) throw httpError(404, "Booking not found.");
    if (booking.status !== "confirmed") throw httpError(409, "Only confirmed bookings that have not started can be (re)assigned.");
    const previous = booking.assignedWorker ? String(booking.assignedWorker) : null;
    if (previous === String(workerId)) return { state: "unchanged", booking };
    const rows = await rankCandidates(booking, { strictHours: true });
    const row = rows.find((r) => String(r.worker._id) === String(workerId));
    if (!row) throw httpError(404, "Approved, active cleaner not found.");
    const problem = row.problem === "excluded" && override ? null : row.problem;
    if (problem === "busy") {
      const conflict = await findWorkerConflict(row.worker._id, booking);
      throw workerConflictError(conflict, `This cleaner already has job ${conflict?.reference ?? ""} at that time (incl. travel buffer).`);
    }
    if (problem && HARD_PROBLEMS.includes(problem)) {
      throw Object.assign(httpError(409, `This cleaner cannot take the job: ${PROBLEM_LABELS[problem] ?? problem}.`), { code: "ASSIGN_NOT_SUITABLE", reason: problem });
    }
    if (problem && !override) {
      throw Object.assign(httpError(409, `Not suitable: ${PROBLEM_LABELS[problem] ?? problem}. Confirm the override to assign anyway.`), { code: "ASSIGN_OVERRIDE_REQUIRED", reason: problem });
    }
    await assertWorkerMayTakeCash(row.worker, booking);
    const updated = await writeAssignment(booking, row.worker, {
      expectWorker: previous ? booking.assignedWorker : null,
      action: previous ? "reassigned" : "assigned",
      by,
      byRole: "admin",
      reason: reason || "manual assignment",
      score: row.score.total,
      details: { parts: row.score.parts, km: row.score.km, override: Boolean(problem), problem: problem ?? undefined },
      throwOnConflict: true,
      skipWorkload: Boolean(override),
    });
    if (!updated) throw httpError(409, "The booking changed meanwhile – please reload and try again.");
    if (previous) await Booking.updateOne({ _id: booking._id }, { $addToSet: { "assignment.excluded": previous } });
    await afterAssigned(updated, row.worker, { changed: Boolean(previous), previousWorker: previous });
    return { state: "assigned", booking: updated, worker: row.worker, score: row.score.total };
  });

// ---------------------------------------------------------------------------
// Cleaner: "emergency / can't make it"
// ---------------------------------------------------------------------------
/** Strike only when reported less than emergencyNoStrikeHours before the start */
export const emergencyStrikeDue = (booking, now = Date.now()) => {
  const r = rules();
  if (r.emergencyStrike === false) return false;
  const hoursAhead = (jobTimeRange(booking).start.getTime() - now) / 3600e3;
  return hoursAhead < (r.emergencyNoStrikeHours ?? 24);
};

// ---------------------------------------------------------------------------
// Customer choices when nobody is free
// ---------------------------------------------------------------------------
export const customerPickAlternative = (booking, { slotId, startTime, actor }) =>
  bookingLock(booking._id, async () => {
    const fresh = await Booking.findById(booking._id);
    if (!fresh || fresh.status !== "confirmed" || fresh.assignedWorker || fresh.assignment?.state !== "needs_attention") {
      throw Object.assign(httpError(409, "This booking does not need a new time any more."), { code: "NO_ALTERNATIVE_NEEDED" });
    }
    const option = (fresh.assignment.alternatives ?? []).find((a) => a.slotId === String(slotId) && a.startTime === startTime);
    const date = option ? new Date(`${option.date}T00:00:00.000Z`) : undefined;
    const moved = await moveBooking(fresh, { slotId, date, startTime, durationMinutes: fresh.estimate?.durationMinutes ?? 120 });
    if (!moved) throw Object.assign(httpError(409, "This time is no longer available. Please choose another one."), { code: "SLOT_TAKEN" });
    fresh.set("assignment.customerChoice", "rescheduled");
    fresh.set("assignment.customerChoiceAt", new Date());
    fresh.assignmentHistory.push(entry("customer_choice", { by: actor, byRole: "customer", reason: `new time ${fresh.preferredDate.toISOString().slice(0, 10)} ${fresh.slot}` }));
    await fresh.save();
    await recordAudit({ actor, action: "booking.assignment.rescheduled_by_customer", entityType: "Booking", entityId: fresh._id, after: { date: fresh.preferredDate, slot: fresh.slot } });
    return autoAssignLocked(fresh._id, { by: actor, byRole: "customer", reason: "customer picked a new time" });
  });

export const customerKeepWaiting = async (booking, { actor }) => {
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, "assignment.state": "needs_attention", assignedWorker: null },
    { $set: { "assignment.customerChoice": "wait", "assignment.customerChoiceAt": new Date() }, $push: { assignmentHistory: entry("customer_choice", { by: actor, byRole: "customer", reason: "keep waiting" }) } },
    { returnDocument: "after" }
  );
  if (!updated) throw Object.assign(httpError(409, "This booking does not need a new time any more."), { code: "NO_ALTERNATIVE_NEEDED" });
  return updated;
};

// ---------------------------------------------------------------------------
// Background: retry unassigned bookings, escalate close to the start
// ---------------------------------------------------------------------------
export const retryUnassignedBookings = async ({ now = new Date(), force = false } = {}) => {
  if (!isAutoMode()) return { skipped: "board mode" };
  const r = rules();
  const due = new Date(now.getTime() - (r.retryMinutes ?? 10) * 60_000);
  const candidates = await Booking.find({
    status: "confirmed",
    assignedWorker: null,
    preferredDate: { $gte: todayInBerlin() },
    ...(!force && { $or: [{ "assignment.lastAttemptAt": null }, { "assignment.lastAttemptAt": { $exists: false } }, { "assignment.lastAttemptAt": { $lte: due } }] }),
  })
    .select("_id reference preferredDate slot slotEnd customerDetails.postcode assignment")
    .limit(100);
  const result = { tried: 0, assigned: 0, escalated: 0 };
  for (const b of candidates) {
    if (slotStartInstant(b.preferredDate, b.slot).getTime() <= now.getTime()) continue;
    result.tried += 1;
    const out = await autoAssign(b._id, { reason: "background retry" });
    if (out.state === "assigned") {
      result.assigned += 1;
      continue;
    }
    const hoursLeft = (slotStartInstant(b.preferredDate, b.slot).getTime() - now.getTime()) / 3600e3;
    if (out.state === "needs_attention" && hoursLeft <= (r.escalateHours ?? 24)) {
      const marked = await Booking.findOneAndUpdate({ _id: b._id, "assignment.escalatedAt": null }, { $set: { "assignment.escalatedAt": new Date() } });
      if (!marked) continue;
      await trySend("Admin notification", () =>
        sendAdminNotificationEmail({
          bookingRef: b.reference,
          subject: `DRINGEND – noch keine Reinigungskraft: ${b.reference}`,
          lines: [
            `Referenz: ${b.reference}`,
            `Termin: ${formatGermanDate(b.preferredDate)}, ${slotLabel(b.slot, b.slotEnd)} (in ${Math.max(0, Math.round(hoursLeft))} Std.)`,
            `PLZ: ${b.customerDetails?.postcode ?? ""}`,
            "Bitte sofort manuell zuweisen (Admin → Disposition) oder die Kundin / den Kunden anrufen.",
          ],
        })
      );
      await recordAudit({ actor: null, action: "booking.assignment.escalated", entityType: "Booking", entityId: b._id, after: { hoursLeft: Math.round(hoursLeft) } });
      result.escalated += 1;
    }
  }
  return result;
};
