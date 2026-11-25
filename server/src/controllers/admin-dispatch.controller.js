// Admin → Disposition (dispatch): live cleaner availability, upcoming
// assignments, unassigned / failed bookings with the reason, emergency and
// replacement requests, conflicts, manual (re)assignment from the ranked list
// (same locks as the automatic assignment) and per booking the e-mails sent
// and the assignment audit trail.
import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import EmailMessage from "../models/email.model.js";
import AuditLog from "../models/audit-log.model.js";
import { OPERATIONS, POLICIES } from "../config/pricing.js";
import { DAY_MS, parseCalendarDate, slotStartInstant, todayInBerlin } from "../utils/helpers.js";
import { dayWindows, hasWeeklyPattern } from "../services/worker-profile.service.js";
import { isPaused } from "../services/reliability.service.js";
import { eligibilityProblem } from "../services/work-eligibility.service.js";
import {
  ACTIVE_WORKER_FILTER,
  PROBLEM_LABELS,
  WORKER_MATCH_FIELDS,
  homePostcodeOf,
  jobProfile,
  rankCandidates,
  suitabilityProblem,
} from "../services/matching.service.js";
import { autoAssign, manualAssign, replaceAssignment } from "../services/auto-assign.service.js";
import { assignmentMode } from "../services/assignment-mode.js";

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (s) => {
  const [h, m] = String(s).split(":").map(Number);
  return h * 60 + (m || 0);
};
const day = (d) => new Date(d).toISOString().slice(0, 10);
const BUSY = ["payment_pending", "confirmed", "in_progress"];

const bookingRow = (b) => ({
  id: b._id,
  reference: b.reference,
  date: day(b.preferredDate),
  slot: b.slot,
  slotEnd: b.slotEnd,
  status: b.status,
  serviceId: b.serviceId,
  extras: b.extras ?? [],
  postcode: b.customerDetails?.postcode,
  durationMinutes: b.estimate?.durationMinutes ?? null,
  paymentStatus: b.payment?.status,
  worker: b.assignedWorker ? { id: b.assignedWorker._id ?? b.assignedWorker, name: b.assignedWorker.name ?? null } : null,
  assignment: {
    state: b.assignment?.state ?? null,
    reason: b.assignment?.reason || null,
    reasonLabel: b.assignment?.reason ? PROBLEM_LABELS[b.assignment.reason] ?? b.assignment.reason : null,
    reasons: b.assignment?.reasons ?? null,
    score: b.assignment?.score ?? null,
    attempts: b.assignment?.attempts ?? 0,
    lastAttemptAt: b.assignment?.lastAttemptAt ?? null,
    needsAttentionAt: b.assignment?.needsAttentionAt ?? null,
    escalatedAt: b.assignment?.escalatedAt ?? null,
    customerChoice: b.assignment?.customerChoice ?? null,
    alternativesSentAt: b.assignment?.alternativesSentAt ?? null,
  },
});

// GET /api/v1/admin/dispatch?from=YYYY-MM-DD&days=1..14
export const getDispatchOverview = async (req, res, next) => {
  try {
    const from = parseCalendarDate(req.query.from) ?? todayInBerlin();
    const days = Math.min(14, Math.max(1, Number(req.query.days) || 7));
    const to = new Date(from.getTime() + (days - 1) * DAY_MS);
    const dates = Array.from({ length: days }, (_, i) => new Date(from.getTime() + i * DAY_MS));

    const [workers, inRange, unassigned, recentChanges] = await Promise.all([
      User.find(ACTIVE_WORKER_FILTER).select(WORKER_MATCH_FIELDS).sort({ name: 1 }).lean(),
      Booking.find({ preferredDate: { $gte: from, $lte: to }, status: { $in: BUSY }, assignedWorker: { $ne: null } })
        .select("reference preferredDate slot slotEnd status serviceId extras customerDetails.postcode estimate.durationMinutes payment.status assignedWorker assignment pets customer series")
        .populate("assignedWorker", "name")
        .sort({ preferredDate: 1, slot: 1 })
        .lean(),
      Booking.find({ status: "confirmed", assignedWorker: null, preferredDate: { $gte: todayInBerlin() } })
        .select("reference preferredDate slot slotEnd status serviceId extras customerDetails.postcode estimate.durationMinutes payment.status assignedWorker assignment")
        .sort({ preferredDate: 1, slot: 1 })
        .limit(200)
        .lean(),
      Booking.find({ "assignmentHistory.action": { $in: ["emergency", "removed"] }, "assignmentHistory.at": { $gte: new Date(Date.now() - 14 * DAY_MS) } })
        .select("reference preferredDate slot slotEnd assignmentHistory assignedWorker assignment status")
        .populate("assignedWorker", "name")
        .limit(200)
        .lean(),
    ]);
    const names = new Map(workers.map((w) => [String(w._id), w.name]));

    // Availability grid: working windows, jobs and day-offs per cleaner and day
    const jobsBy = new Map();
    for (const b of inRange) {
      const key = `${b.assignedWorker?._id ?? b.assignedWorker}|${day(b.preferredDate)}`;
      if (!jobsBy.has(key)) jobsBy.set(key, []);
      jobsBy.get(key).push(b);
    }
    const availability = workers.map((w) => ({
      id: w._id,
      name: w.name,
      postcode: homePostcodeOf(w),
      maxTravelKm: w.workerProfile?.maxTravelKm ?? 10,
      paused: isPaused(w),
      hasPattern: hasWeeklyPattern(w),
      excludedServices: w.workerProfile?.excludedServices ?? [],
      excludedExtras: w.workerProfile?.excludedExtras ?? [],
      workload: w.workload ?? {},
      days: dates.map((d) => {
        const windows = dayWindows(w, d);
        const jobs = (jobsBy.get(`${w._id}|${day(d)}`) ?? []).map((b) => ({ id: b._id, reference: b.reference, start: b.slot, end: b.slotEnd }));
        const holiday = (w.holidays ?? []).some((h) => new Date(h.from) <= d && d <= new Date(h.to));
        const dayOff = (w.availabilityOverrides ?? []).some((o) => day(o.date) === day(d) && o.kind === "off");
        return {
          date: day(d),
          windows: windows.map((x) => `${hhmm(x.start)}–${hhmm(Math.min(x.end, 1440 - 1))}`),
          freeMinutes: Math.max(0, windows.reduce((s, x) => s + (x.end - x.start), 0) - jobs.reduce((s, j) => s + (toMin(j.end) - toMin(j.start)), 0)),
          jobs,
          off: holiday ? "holiday" : dayOff ? "day_off" : isPaused(w) ? "paused" : eligibilityProblem(w, d) ? "documents" : null,
        };
      }),
    }));

    // Conflicts: overlapping jobs of one cleaner (incl. buffer) and jobs whose
    // cleaner is no longer suitable (paused, holiday, documents …)
    const buffer = (OPERATIONS.travelBufferMinutes ?? 0) * 60_000;
    const conflicts = [];
    const byWorker = new Map();
    for (const b of inRange) {
      const wid = String(b.assignedWorker?._id ?? b.assignedWorker);
      if (!byWorker.has(wid)) byWorker.set(wid, []);
      byWorker.get(wid).push(b);
    }
    const workerDocs = new Map(workers.map((w) => [String(w._id), w]));
    for (const [wid, list] of byWorker) {
      const ranges = list.map((b) => {
        const start = slotStartInstant(b.preferredDate, b.slot).getTime();
        return { b, start, end: start + (b.estimate?.durationMinutes ?? 120) * 60_000 };
      });
      for (let i = 0; i < ranges.length; i++) {
        for (let j = i + 1; j < ranges.length; j++) {
          if (ranges[i].start < ranges[j].end + buffer && ranges[j].start < ranges[i].end + buffer) {
            conflicts.push({ kind: "overlap", worker: { id: wid, name: names.get(wid) ?? null }, bookings: [ranges[i].b.reference, ranges[j].b.reference] });
          }
        }
        const w = workerDocs.get(wid);
        const b = ranges[i].b;
        if (b.status !== "confirmed") continue;
        const problem = w ? suitabilityProblem(w, jobProfile(b), {}, { strictHours: false, checkBusy: false }) : "inactive";
        if (problem && ["inactive", "paused", "holiday", "day_off", "documents", "pets"].includes(problem)) {
          conflicts.push({ kind: "unsuitable", problem, problemLabel: PROBLEM_LABELS[problem] ?? problem, worker: { id: wid, name: names.get(wid) ?? null }, bookings: [b.reference], bookingId: b._id });
        }
      }
    }

    const emergencies = [];
    for (const b of recentChanges) {
      for (const h of b.assignmentHistory ?? []) {
        if (!["emergency", "removed"].includes(h.action) || new Date(h.at).getTime() < Date.now() - 14 * DAY_MS) continue;
        emergencies.push({
          bookingId: b._id,
          reference: b.reference,
          date: day(b.preferredDate),
          slot: b.slot,
          at: h.at,
          kind: h.details?.kind ?? h.action,
          reason: h.reason,
          worker: h.worker ? { id: h.worker, name: names.get(String(h.worker)) ?? null } : null,
          byRole: h.byRole,
          replacement: b.assignedWorker ? { id: b.assignedWorker._id, name: b.assignedWorker.name } : null,
          state: b.assignment?.state ?? null,
        });
      }
    }
    emergencies.sort((a, b) => new Date(b.at) - new Date(a.at));

    const dayOffs = [];
    for (const w of workers) {
      for (const o of w.availabilityOverrides ?? []) if (o.kind === "off" && new Date(o.date) >= from && new Date(o.date) <= to) dayOffs.push({ worker: { id: w._id, name: w.name }, date: day(o.date), kind: "day_off", note: o.note });
      for (const h of w.holidays ?? []) if (new Date(h.to) >= from && new Date(h.from) <= to) dayOffs.push({ worker: { id: w._id, name: w.name }, date: `${day(h.from)} – ${day(h.to)}`, kind: "holiday", note: h.note });
      if (isPaused(w)) dayOffs.push({ worker: { id: w._id, name: w.name }, date: "", kind: "paused", note: w.reliability?.pausedReason ?? "" });
    }

    return res.json({
      success: true,
      mode: assignmentMode(),
      rules: POLICIES.assignment,
      from: day(from),
      to: day(to),
      dates: dates.map(day),
      availability,
      upcoming: inRange.filter((b) => b.status !== "payment_pending").map(bookingRow),
      unassigned: unassigned.map(bookingRow),
      emergencies,
      dayOffs,
      conflicts,
      cleanersWithoutPattern: workers.filter((w) => !hasWeeklyPattern(w)).map((w) => ({ id: w._id, name: w.name })),
    });
  } catch (error) {
    next(error);
  }
};

const loadBooking = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid booking ID." });
    return null;
  }
  const booking = await Booking.findById(req.params.id);
  if (!booking) res.status(404).json({ success: false, message: "Booking not found." });
  return booking;
};

// GET /api/v1/admin/dispatch/bookings/:id – ranked cleaners, history, e-mails, audit
export const getDispatchBooking = async (req, res, next) => {
  try {
    const booking = await loadBooking(req, res);
    if (!booking) return;
    const [rows, emails, audit] = await Promise.all([
      rankCandidates(booking, { excluded: booking.assignedWorker ? [booking.assignedWorker] : [] }),
      EmailMessage.find({ bookingRef: booking.reference }).select("to subject template status createdAt sentAt attempts").sort({ createdAt: 1 }).limit(200).lean(),
      AuditLog.find({ entityId: booking._id }).sort({ createdAt: 1 }).limit(200).populate("actor", "name role").lean(),
    ]);
    const ids = [...new Set(booking.assignmentHistory.flatMap((h) => [h.worker, h.previousWorker, h.by]).filter(Boolean).map(String))];
    const people = new Map((await User.find({ _id: { $in: ids } }).select("name role").lean()).map((u) => [String(u._id), u]));
    const who = (id) => (id ? { id, name: people.get(String(id))?.name ?? null, role: people.get(String(id))?.role ?? null } : null);
    const current = booking.assignedWorker ? await User.findById(booking.assignedWorker).select("name").lean() : null;
    return res.json({
      success: true,
      booking: { ...bookingRow({ ...booking.toObject(), assignedWorker: current ?? booking.assignedWorker }), customerName: booking.customerDetails?.name, address: booking.customerDetails?.address, pets: booking.pets },
      candidates: rows.slice(0, 40).map((r) => ({
        id: r.worker._id,
        name: r.worker.name,
        suitable: r.suitable && String(r.worker._id) !== String(booking.assignedWorker),
        problem: r.problem,
        problemLabel: r.problem ? PROBLEM_LABELS[r.problem] ?? r.problem : null,
        score: r.score.total,
        parts: r.score.parts,
        km: r.score.km,
      })),
      history: booking.assignmentHistory.map((h) => ({ at: h.at, action: h.action, worker: who(h.worker), previousWorker: who(h.previousWorker), by: who(h.by), byRole: h.byRole, reason: h.reason, score: h.score ?? null, details: h.details ?? null })),
      emails: emails.map((e) => ({ id: e._id, to: e.to, subject: e.subject, template: e.template, status: e.status, createdAt: e.createdAt, sentAt: e.sentAt ?? null })),
      audit: audit.map((a) => ({ at: a.createdAt, action: a.action, actor: a.actor ? { id: a.actor._id, name: a.actor.name, role: a.actor.role } : null, after: a.after })),
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/dispatch/bookings/:id/assign  { workerId, reason?, override? }
export const dispatchAssign = async (req, res, next) => {
  try {
    const data = z
      .object({
        workerId: z.string().refine((id) => mongoose.isValidObjectId(id), "Invalid worker ID."),
        reason: z.string().trim().max(500).optional().default(""),
        override: z.boolean().optional().default(false),
      })
      .parse(req.body ?? {});
    const booking = await loadBooking(req, res);
    if (!booking) return;
    const result = await manualAssign(booking._id, { workerId: data.workerId, by: req.user._id, reason: data.reason || "manual assignment (dispatch)", override: data.override });
    return res.json({ success: true, message: "Cleaner assigned.", state: result.state, score: result.score ?? null, worker: result.worker ? { id: result.worker._id, name: result.worker.name } : null });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/dispatch/bookings/:id/auto – run the matching again now
export const dispatchAuto = async (req, res, next) => {
  try {
    const booking = await loadBooking(req, res);
    if (!booking) return;
    const result = await autoAssign(booking._id, { by: req.user._id, byRole: "admin", reason: "admin re-ran the matching" });
    return res.json({ success: true, state: result.state, reason: result.reason ?? null, worker: result.worker ? { id: result.worker._id, name: result.worker.name } : null });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/dispatch/bookings/:id/unassign  { reason } – remove + automatic replacement
export const dispatchUnassign = async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body ?? {});
    const booking = await loadBooking(req, res);
    if (!booking) return;
    if (!booking.assignedWorker) return res.status(409).json({ success: false, message: "This booking has no cleaner." });
    const result = await replaceAssignment(booking._id, { workerId: booking.assignedWorker, kind: "removed", reason, by: req.user._id, byRole: "admin" });
    return res.json({ success: true, state: result.state, worker: result.worker ? { id: result.worker._id, name: result.worker.name } : null });
  } catch (error) {
    next(error);
  }
};
