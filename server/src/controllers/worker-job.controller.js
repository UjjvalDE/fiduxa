import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import { slotLabel, formatGermanDate, todayInBerlin } from "../utils/helpers.js";
import {
  sendAdminNotificationEmail,
  sendCleanerOnTheWayEmail,
  trySend,
} from "../services/email.service.js";
import {
  claimJob,
  conflictIn,
  findWorkerConflict,
  withWorkerSchedule,
  WORKER_CONFLICT_CODE,
  loadBusyRanges,
  isOpenJob,
  jobTimeRange,
  notifyAssignment,
  offerJob,
  priorityBlocks,
} from "../services/job-dispatch.service.js";
import { OPERATIONS, POLICIES } from "../config/pricing.js";
import { RELIABILITY } from "../config/pricing.js"; // [E]
import { addStrike, isPaused } from "../services/reliability.service.js"; // [E]
import { eligibilityProblem, rejectIfIneligible } from "../services/work-eligibility.service.js";
import { distanceKm, postcodeFromAddress } from "../data/berlin-postcodes.js"; // [E]
import { jobMismatch, MISMATCH_MESSAGES } from "../services/worker-profile.service.js";
import { previewPayCents, workerPayContext } from "../services/payout.service.js";
import { assertWorkerMayTakeCash } from "../services/money-policies.service.js";
import { unreadCounts } from "../services/booking-message.service.js";
import { EXTRA_TIME, requestExtraTime } from "../services/extra-time.service.js";
import { recordAudit } from "../services/audit.service.js";
import { isAutoMode } from "../services/assignment-mode.js";
import { emergencyStrikeDue, replaceAssignment } from "../services/auto-assign.service.js";
import {
  JOB_CONFIRMATION,
  OPEN_JOB_STATUSES,
  bookedTimes,
  completeJob,
  confirmDeadline,
  lateConfirmProblem,
  needsConfirmation,
  resolveActualTimes,
} from "../services/job-completion.service.js";

// Open jobs: no customer name, phone or street until the cleaner accepts.
const OPEN_JOB_FIELDS = [
  "reference",
  "serviceId",
  "areaM2",
  "condition",
  "frequency",
  "extras",
  "estimate.durationMinutes",
  "estimate.extras",
  "customerDetails.postcode",
  "preferredDate",
  "slot",
  "slotEnd",
  "status",
  "assignedWorker",
  "jobOffer",
  "pets",
  "payment.method",
  "pricing.totalCents",
  "estimate.totalCents",
].join(" ");

// Workers only see what they need to do the job: no prices, no customer email.
const WORKER_JOB_FIELDS = [
  "reference",
  "serviceId",
  "areaM2",
  "condition",
  "extras",
  "estimate.durationMinutes",
  "estimate.extras",
  "customerDetails.name",
  "customerDetails.phone",
  "customerDetails.address",
  "customerDetails.postcode",
  "customerDetails.accessNotes",
  "notes",
  "preferredDate",
  "slot",
  "slotEnd",
  "status",
  "job",
  "assignedAt",
  "pets",
  "workerPayout",
  "pricing.totalCents",
  "estimate.totalCents",
  "payment.method",
  "payment.amountCents",
  "payment.status",
  "payment.cashCollectedCents",
  "priceAdjustments",
  "assignedWorker",
  "assignment.workerSeenAt",
].join(" ");

// Workers see the price only when they have to collect it in cash
const forWorker = (job, payCtx) => {
  const { payment, pricing, priceAdjustments, assignment, ...rest } = job;
  const confirmable = needsConfirmation(job) && !lateConfirmProblem(job);
  return {
    ...rest,
    // In-dashboard notice: assigned to me and not opened yet
    isNew: ["confirmed"].includes(job.status) && !assignment?.workerSeenAt,
    // "Can't make it" (emergency) possible until the start
    canReportEmergency: job.status === "confirmed" && jobTimeRange(job).start.getTime() > Date.now(),
    emergencyNoStrikeHours: POLICIES.assignment?.emergencyStrike === false ? null : POLICIES.assignment?.emergencyNoStrikeHours ?? 24,
    // Past job still open: "Job erledigt bestätigen" / "Nicht stattgefunden"
    confirmation: needsConfirmation(job)
      ? { needed: true, possible: confirmable, deadline: confirmDeadline(job.preferredDate), defaults: bookedTimes(job), graceDays: JOB_CONFIRMATION.graceDays }
      : null,
    // Own extra-time requests (no prices – the customer decides and pays)
    extraTimeRequests: (priceAdjustments ?? [])
      .filter((a) => a.origin === "cleaner")
      .map((a) => ({ id: a._id, minutes: a.minutes, reason: a.reason, status: a.status, expiresAt: a.expiresAt ?? null, newSlotEnd: a.newSlotEnd ?? "", at: a.at, decidedAt: a.decidedAt ?? null })),
    // Cleaner pay: the immutable record after completion, a preview before
    pay: job.workerPayout?.status
      ? { amountCents: job.workerPayout.amountCents, basis: job.workerPayout.basis ?? "hourly", commissionPct: job.workerPayout.commissionPct, final: true }
      : payCtx
        ? { ...payFor(payCtx, job), final: false }
        : null,
    cash:
      payment?.method === "cash"
        ? {
            amountCents: payment.amountCents ?? job.estimate?.totalCents ?? 0,
            collectedCents: payment.cashCollectedCents ?? null,
            collected: payment.status === "paid",
          }
        : null,
  };
};

const findAssignedJob = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid job ID." });
    return null;
  }

  const booking = await Booking.findOne({
    _id: req.params.id,
    assignedWorker: req.user._id,
  });

  if (!booking) {
    res.status(404).json({ success: false, message: "Job not found." });
    return null;
  }

  return booking;
};

// GET /api/v1/worker/jobs?scope=today|upcoming|past|confirm
export const listMyJobs = async (req, res, next) => {
  try {
    const today = todayInBerlin();
    const filter = { assignedWorker: req.user._id };
    let sort = { preferredDate: 1, slot: 1 };

    switch (req.query.scope) {
      case "today":
        filter.preferredDate = today;
        filter.status = { $in: ["confirmed", "in_progress", "completed"] };
        break;
      case "confirm": // past jobs still waiting for my confirmation
        filter.preferredDate = { $lt: today };
        filter.status = { $in: OPEN_JOB_STATUSES };
        filter["job.notHappened.reportedAt"] = { $exists: false };
        break;
      case "past":
        filter.$or = [
          { status: { $in: ["completed", "cancelled"] } },
          { preferredDate: { $lt: today } },
        ];
        sort = { preferredDate: -1 };
        break;
      default: // upcoming
        filter.preferredDate = { $gte: today };
        filter.status = { $in: ["confirmed", "in_progress"] };
    }

    const jobs = await Booking.find(filter)
      .select(WORKER_JOB_FIELDS)
      .sort(sort)
      .limit(100)
      .lean();

    const unread = await unreadCounts(jobs.map((j) => j._id), req.user._id);
    const payCtx = await workerPayContext(req.user);

    return res.json({ success: true, count: jobs.length, jobs: jobs.map((j) => forWorker(j, payCtx)), unread });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/worker/jobs/:id
export const getMyJob = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid job ID." });
    }

    const job = await Booking.findOne({
      _id: req.params.id,
      assignedWorker: req.user._id,
    })
      .select(WORKER_JOB_FIELDS)
      .lean();

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found." });
    }

    const payCtx = await workerPayContext(req.user);
    const out = forWorker(job, payCtx);
    // Opening the job marks the "new job" notice as read
    if (!job.assignment?.workerSeenAt) await Booking.updateOne({ _id: job._id, assignedWorker: req.user._id }, { $set: { "assignment.workerSeenAt": new Date() } });
    return res.json({ success: true, job: out });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/start
export const startMyJob = async (req, res, next) => {
  try {
    const booking = await findAssignedJob(req, res);
    if (!booking) return;

    if (booking.status !== "confirmed") {
      return res.status(409).json({
        success: false,
        message: "Only confirmed jobs can be started.",
      });
    }

    const today = todayInBerlin();
    if (booking.preferredDate.getTime() !== today.getTime()) {
      return res.status(409).json({
        success: false,
        message: "This job is not scheduled for today.",
      });
    }

    booking.setStatus("in_progress", req.user._id, "Started by worker");
    booking.set("job.startedAt", new Date());
    await booking.save();

    return res.json({
      success: true,
      message: "Job started.",
      job: { id: booking._id, status: booking.status, job: booking.job },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/complete  { note? }
export const completeMyJob = async (req, res, next) => {
  try {
    const { note, checklistDone, cashCollectedCents, actualDurationMinutes } = z
      .object({
        note: z.string().trim().max(2000).optional().default(""),
        checklistDone: z.array(z.string().trim().max(100)).max(100).optional().default([]),
        // Cash bookings: amount the cleaner received from the customer
        cashCollectedCents: z.number().int().min(0).max(1_000_000).optional(),
        // How long the cleaning actually took (follow-up / payroll review)
        actualDurationMinutes: z.number().int().min(15).max(1440).optional(),
      })
      .parse(req.body ?? {});

    const booking = await findAssignedJob(req, res);
    if (!booking) return;

    if (booking.status !== "in_progress") {
      return res.status(409).json({
        success: false,
        message: "Only jobs in progress can be completed.",
      });
    }

    const { feedbackPending } = await completeJob(booking, {
      actor: req.user,
      source: "worker",
      note,
      checklistDone,
      cashCollectedCents,
      actualDurationMinutes,
    });

    return res.json({
      success: true,
      message: "Job completed.",
      job: { id: booking._id, status: booking.status, job: booking.job },
      feedbackPending,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/confirm-late  { startTime?, endTime?, note?, cashCollectedCents? }
// "Job erledigt bestätigen": the cleaner forgot Start/Done on the day – confirm
// with the actual times up to JOB_CONFIRMATION.graceDays after the job date.
export const confirmMyJobLate = async (req, res, next) => {
  try {
    const data = z
      .object({
        startTime: z.string().trim().optional(),
        endTime: z.string().trim().optional(),
        note: z.string().trim().max(2000).optional().default(""),
        checklistDone: z.array(z.string().trim().max(100)).max(100).optional().default([]),
        cashCollectedCents: z.number().int().min(0).max(1_000_000).optional(),
      })
      .parse(req.body ?? {});

    const booking = await findAssignedJob(req, res);
    if (!booking) return;

    // Idempotent: a repeated confirmation of the same job is a no-op
    if (booking.status === "completed" && booking.job?.lateConfirmation) {
      return res.json({
        success: true,
        alreadyCompleted: true,
        message: "Job already confirmed.",
        job: { id: booking._id, status: booking.status, job: booking.job },
        feedbackPending: false,
      });
    }

    const problem = lateConfirmProblem(booking);
    if (problem) {
      const messages = {
        NOT_OPEN: "This job cannot be confirmed any more.",
        REPORTED_NOT_HAPPENED: "You reported that this job did not take place – the office decides.",
        NOT_YET: "This job has not started yet.",
        WINDOW_CLOSED: `Jobs can be confirmed up to ${JOB_CONFIRMATION.graceDays} days after the date. Please contact the office.`,
      };
      return res.status(409).json({ success: false, code: `LATE_CONFIRM_${problem}`, message: messages[problem] });
    }

    const { startedAt, completedAt, minutes } = resolveActualTimes(booking, data);
    const { feedbackPending } = await completeJob(booking, {
      actor: req.user,
      source: "late",
      note: data.note,
      checklistDone: data.checklistDone,
      cashCollectedCents: data.cashCollectedCents,
      actualDurationMinutes: minutes,
      startedAt,
      completedAt,
      historyNote: "Confirmed late by worker",
    });

    return res.json({
      success: true,
      message: "Job confirmed.",
      job: { id: booking._id, status: booking.status, job: booking.job },
      feedbackPending,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/not-happened  { reason, note? }
// Customer not home / no access / other → office decides (no automatic fee)
export const reportJobNotHappened = async (req, res, next) => {
  try {
    const { reason, note } = z
      .object({
        reason: z.enum(["customer_absent", "no_access", "other"]),
        note: z.string().trim().max(1000).optional().default(""),
      })
      .refine((d) => d.reason !== "other" || d.note.length >= 5, { message: "Please describe what happened.", path: ["note"] })
      .parse(req.body ?? {});

    const booking = await findAssignedJob(req, res);
    if (!booking) return;

    if (booking.job?.notHappened?.reportedAt) {
      return res.json({ success: true, alreadyReported: true, message: "Already reported. The office has been notified." });
    }
    const problem = lateConfirmProblem(booking);
    if (problem && problem !== "WINDOW_CLOSED") {
      return res.status(409).json({ success: false, code: `NOT_HAPPENED_${problem}`, message: "This job cannot be reported now." });
    }

    const claimed = await Booking.updateOne(
      { _id: booking._id, status: { $in: OPEN_JOB_STATUSES }, "job.notHappened.reportedAt": { $exists: false } },
      {
        $set: {
          "job.notHappened": { reportedAt: new Date(), reportedBy: req.user._id, reason, note, decision: "pending" },
        },
        $push: { statusHistory: { status: booking.status, changedAt: new Date(), changedBy: req.user._id, note: `Reported not happened (${reason})${note ? `: ${note}` : ""}` } },
      }
    );
    if (claimed.modifiedCount === 0) {
      return res.status(409).json({ success: false, message: "This job cannot be reported now." });
    }

    await recordAudit({
      actor: req.user._id,
      action: "booking.job.not_happened",
      entityType: "Booking",
      entityId: booking._id,
      after: { reason, note },
    });
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Auftrag nicht stattgefunden: ${booking.reference}`,
        lines: [
          `Referenz: ${booking.reference}`,
          `Termin: ${formatGermanDate(booking.preferredDate)}, ${slotLabel(booking.slot, booking.slotEnd)}`,
          `Reinigungskraft: ${req.user.name}`,
          `Grund: ${reason}`,
          `Notiz: ${note || "–"}`,
          "Bitte im Admin-Bereich entscheiden (Gebühr nach Richtlinie / kostenlos stornieren / zurückweisen).",
        ],
      })
    );

    return res.status(201).json({ success: true, message: "Reported. The office will decide." });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/extra-time  { minutes, reason }
// Ask the customer for more time during the running job (see extra-time.service.js)
export const requestMyExtraTime = async (req, res, next) => {
  try {
    const { minutes, reason } = z
      .object({
        minutes: z
          .number()
          .int()
          .min(EXTRA_TIME.minMinutes)
          .max(EXTRA_TIME.maxMinutes)
          .refine((m) => m % EXTRA_TIME.stepMinutes === 0, `Minutes must be in ${EXTRA_TIME.stepMinutes}-minute steps.`),
        reason: z.string().trim().min(5, "Please explain why you need more time.").max(500),
      })
      .parse(req.body ?? {});
    const booking = await findAssignedJob(req, res);
    if (!booking) return;
    const adjustment = await requestExtraTime(booking, req.user, { minutes, reason });
    return res.status(201).json({
      success: true,
      message: "Extra time requested. The customer has been asked to approve it.",
      request: { id: adjustment._id, minutes: adjustment.minutes, reason: adjustment.reason, status: adjustment.status, expiresAt: adjustment.expiresAt, newSlotEnd: adjustment.newSlotEnd },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/report-issue  { type, message }
// Damage, safety concern, missing access, scope mismatch (blueprint §11)
export const reportJobIssue = async (req, res, next) => {
  try {
    const data = z
      .object({
        type: z.enum(["damage", "safety", "no-access", "scope-mismatch", "other"]),
        message: z.string().trim().min(5).max(2000),
      })
      .parse(req.body);

    const booking = await findAssignedJob(req, res);
    if (!booking) return;

    const entry = `[${new Date().toISOString()}] ${data.type}: ${data.message}`;
    const existing = booking.job?.issueReported || "";
    booking.set(
      "job.issueReported",
      (existing ? `${existing}\n${entry}` : entry).slice(-2000)
    );
    await booking.save();

    await trySend("Issue report", () =>
      sendAdminNotificationEmail({
        subject: `Problem gemeldet: ${booking.reference}`,
        lines: [
          `Referenz: ${booking.reference}`,
          `Reinigungskraft: ${req.user.name}`,
          `Art: ${data.type}`,
          `Nachricht: ${data.message}`,
        ],
      })
    );

    return res.status(201).json({
      success: true,
      message: "Issue reported. The office has been notified.",
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Open-job marketplace
// ---------------------------------------------------------------------------

const jobGrossCents = (booking) => booking.pricing?.totalCents ?? booking.estimate?.totalCents ?? 0;

/** What THIS cleaner earns for the job (their tier % or hourly rate). */
const payFor = (ctx, booking) => ({
  amountCents: previewPayCents(ctx, { grossCents: jobGrossCents(booking), minutes: booking.estimate?.durationMinutes ?? 120 }),
  basis: ctx.basis,
  ...(ctx.basis === "commission" && { commissionPct: ctx.commissionPct }),
});

const toOpenJob = (booking, payCtx, homePlz = null) => ({
  _id: booking._id,
  reference: booking.reference,
  serviceId: booking.serviceId,
  areaM2: booking.areaM2,
  condition: booking.condition,
  frequency: booking.frequency,
  extras: booking.extras,
  estimate: {
    durationMinutes: booking.estimate?.durationMinutes,
    extras: booking.estimate?.extras ?? [],
  },
  postcode: booking.customerDetails?.postcode,
  preferredDate: booking.preferredDate,
  slot: booking.slot,
  slotEnd: booking.slotEnd,
  pets: Boolean(booking.pets),
  // Customer pays the cleaner in cash at the end
  cash: booking.payment?.method === "cash",
  // Your pay for this job (current tier – the final record is set at completion)
  pay: payCtx ? payFor(payCtx, booking) : null,
  // Approximate distance from the cleaner's home postcode (package E)
  distanceKm: homePlz ? distanceKm(homePlz, booking.customerDetails?.postcode) : null,
});

// GET /api/v1/worker/jobs/open – confirmed jobs without cleaner that fit my calendar
export const listOpenJobs = async (req, res, next) => {
  try {
    // Auto mode: jobs are assigned automatically – there is no job board
    if (isAutoMode()) return res.json({ success: true, count: 0, jobs: [], assignmentMode: "auto" });
    // Paused cleaners (reliability strikes) see no open jobs
    if (isPaused(req.user)) {
      return res.json({ success: true, count: 0, jobs: [], paused: true, pausedAt: req.user.reliability.pausedAt });
    }
    // Documents missing / expired → no open jobs at all (409 codes explain why on accept)
    const blocked = eligibilityProblem(req.user, null);
    if (blocked) return res.json({ success: true, count: 0, jobs: [], eligibility: { code: blocked.code, kind: blocked.kind } });
    const homePlz = postcodeFromAddress(req.user.workerProfile?.address);
    const candidates = await Booking.find({
      status: "confirmed",
      assignedWorker: null,
      preferredDate: { $gte: todayInBerlin() },
      "jobOffer.declinedBy": { $ne: req.user._id },
      "jobOffer.releasedBy": { $ne: req.user._id },
    })
      .select(OPEN_JOB_FIELDS)
      .sort({ preferredDate: 1, slot: 1 })
      .limit(100)
      .lean(); // plain objects – hydrating 100 full documents was the bottleneck

    // My own jobs on those days – one query instead of one per open job
    const dates = [...new Set(candidates.map((b) => b.preferredDate.getTime()))].map((t) => new Date(t));
    const myBusy = (await loadBusyRanges([req.user._id], dates)).get(String(req.user._id));

    const payCtx = await workerPayContext(req.user);
    const jobs = candidates
      .filter((booking) => isOpenJob(booking)) // not started / not in the past
      .filter((booking) => !priorityBlocks(booking, req.user._id)) // reserved for the preferred cleaner
      .filter((booking) => !jobMismatch(req.user, booking)) // holiday, pets, working hours
      .filter((booking) => !eligibilityProblem(req.user, booking.preferredDate)) // ID / permit valid on the job date
      .filter((booking) => !conflictIn(myBusy, booking))
      .map((booking) => toOpenJob(booking, payCtx, homePlz))
      // nearest first, then date/time (unknown distances last)
      .sort(
        (a, b) =>
          (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) ||
          new Date(a.preferredDate) - new Date(b.preferredDate) ||
          String(a.slot).localeCompare(String(b.slot))
      );

    return res.json({ success: true, count: jobs.length, jobs });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/accept – first come, first served
const autoModeRefusal = (res) =>
  res.status(409).json({ success: false, code: "ASSIGNMENT_AUTO", message: "Jobs are assigned automatically – there is nothing to accept." });

export const acceptJob = async (req, res, next) => {
  try {
    if (isAutoMode()) return autoModeRefusal(res);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid job ID." });
    }

    const booking = await Booking.findById(req.params.id);

    if (!booking || !isOpenJob(booking)) {
      return res.status(409).json({
        success: false,
        message: "This job is no longer available.",
      });
    }

    if (priorityBlocks(booking, req.user._id)) {
      return res.status(409).json({
        success: false,
        message: "This job is reserved for the customer's preferred cleaner for now.",
        reason: "priority",
      });
    }

    const mismatch = jobMismatch(req.user, booking);
    if (mismatch) {
      return res.status(409).json({ success: false, message: MISMATCH_MESSAGES[mismatch], reason: mismatch });
    }

    // Work eligibility: documents verified + valid on the job date (409 DOCUMENTS_* / *_EXPIRES_BEFORE_JOB)
    if (rejectIfIneligible(res, req.user, booking.preferredDate)) return;

    // Cash policy: below the minimum tier or holding too much cash → no cash jobs (409 CASH_BLOCKED)
    await assertWorkerMayTakeCash(req.user, booking);

    // Overlap check + claim under the cleaner's schedule lock: two parallel
    // accepts of overlapping jobs can never both succeed.
    const { conflict, claimed } = await withWorkerSchedule(req.user._id, async () => {
      const clash = await findWorkerConflict(req.user._id, booking);
      if (clash) return { conflict: clash };
      return { claimed: await claimJob(booking._id, req.user._id) };
    });
    if (conflict) {
      return res.status(409).json({
        success: false,
        code: WORKER_CONFLICT_CODE,
        message: `You already have job ${conflict.reference} at that time.`,
      });
    }
    if (!claimed) {
      return res.status(409).json({
        success: false,
        message: "This job is no longer available.",
      });
    }

    await notifyAssignment(claimed, req.user, { byAdmin: false });
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Auftrag angenommen: ${claimed.reference}`,
        lines: [
          `Referenz: ${claimed.reference}`,
          `Reinigungskraft: ${req.user.name}`,
          `Termin: ${formatGermanDate(claimed.preferredDate)}, ${slotLabel(claimed.slot, claimed.slotEnd)}`,
        ],
      })
    );

    return res.json({
      success: true,
      message: "Job accepted.",
      job: { id: claimed._id, reference: claimed.reference, status: claimed.status },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/decline – hide an open job for me
export const declineJob = async (req, res, next) => {
  try {
    if (isAutoMode()) return autoModeRefusal(res);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid job ID." });
    }

    const result = await Booking.updateOne(
      { _id: req.params.id, status: "confirmed", assignedWorker: null },
      { $addToSet: { "jobOffer.declinedBy": req.user._id } }
    );

    if (result.matchedCount === 0) {
      return res.status(409).json({ success: false, message: "This job is no longer available." });
    }

    return res.json({ success: true, message: "Job declined." });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/release { reason } – hand an accepted job back
export const releaseJob = async (req, res, next) => {
  try {
    const { reason } = z
      .object({ reason: z.string().trim().min(3).max(500) })
      .parse(req.body ?? {});

    const booking = await findAssignedJob(req, res);
    if (!booking) return;

    if (booking.status !== "confirmed") {
      return res.status(409).json({
        success: false,
        message: "Only confirmed jobs that have not started can be handed back.",
      });
    }
    // Auto mode: handing back = "can't make it" → automatic replacement
    if (isAutoMode()) return handleEmergency(req, res, booking, reason);

    const cutoff =
      jobTimeRange(booking).start.getTime() - OPERATIONS.workerReleaseCutoffHours * 60 * 60 * 1000;
    if (Date.now() > cutoff) {
      return res.status(409).json({
        success: false,
        message: `Jobs can be handed back up to ${OPERATIONS.workerReleaseCutoffHours} hours before the start. Please call the office.`,
      });
    }

    booking.assignedWorker = null;
    booking.assignedAt = undefined;
    booking.assignedBy = undefined;
    booking.jobOffer.releasedBy.addToSet(req.user._id);
    booking.set("jobOffer.unassignedAlertSentAt", undefined);
    booking.statusHistory.push({
      status: "confirmed",
      changedBy: req.user._id,
      note: `Handed back by cleaner: ${reason}`,
    });
    await offerJob(booking);
    await booking.save();

    // Reliability (package E): handing back closer than lateReleaseHours = strike
    const lateCutoff = jobTimeRange(booking).start.getTime() - RELIABILITY.lateReleaseHours * 60 * 60 * 1000;
    const strike = Date.now() > lateCutoff ? await addStrike(req.user, { kind: "late_release", bookingRef: booking.reference, note: reason }) : null;

    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Auftrag zurückgegeben: ${booking.reference}`,
        lines: [
          `Referenz: ${booking.reference}`,
          `Reinigungskraft: ${req.user.name}`,
          `Grund: ${reason}`,
          "Der Auftrag ist wieder für andere Reinigungskräfte offen.",
        ],
      })
    );

    return res.json({ success: true, message: strike ? "Job handed back. Because it was short notice, a reliability strike was recorded." : "Job handed back.", strike });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/emergency { reason } – "I can't make it"
// The job is taken off the cleaner and given to the next best cleaner at once
// (customer informed). A strike only when reported less than
// POLICIES.assignment.emergencyNoStrikeHours before the start.
const handleEmergency = async (req, res, booking, reason) => {
  if (booking.status !== "confirmed" || jobTimeRange(booking).start.getTime() <= Date.now()) {
    return res.status(409).json({ success: false, message: "Only confirmed jobs that have not started yet can be reported. Please call the office." });
  }
  const strikeDue = emergencyStrikeDue(booking);
  const result = await replaceAssignment(booking._id, { workerId: req.user._id, kind: "emergency", reason, by: req.user._id, byRole: "worker" });
  if (result.state === "not_assigned") return res.status(409).json({ success: false, message: "This job is no longer assigned to you." });
  const strike = strikeDue ? await addStrike(req.user._id, { kind: "late_release", bookingRef: booking.reference, note: `Emergency: ${reason}` }) : null;
  await trySend("Admin notification", () =>
    sendAdminNotificationEmail({
      bookingRef: booking.reference,
      subject: `Notfall gemeldet: ${booking.reference}`,
      lines: [
        `Referenz: ${booking.reference}`,
        `Reinigungskraft: ${req.user.name}`,
        `Termin: ${formatGermanDate(booking.preferredDate)}, ${slotLabel(booking.slot, booking.slotEnd)}`,
        `Grund: ${reason}`,
        result.state === "assigned" ? `Ersatz automatisch zugewiesen: ${result.worker?.name ?? ""}` : "KEIN Ersatz gefunden – Buchung braucht Aufmerksamkeit.",
        strike ? "Kurzfristig: 1 Zuverlässigkeits-Strike vergeben." : "Kein Strike (rechtzeitig gemeldet).",
      ],
    })
  );
  return res.json({
    success: true,
    message: strike ? "Thanks for letting us know. Because it was short notice, a reliability strike was recorded." : "Thanks for letting us know. The job has been handed over.",
    replacement: result.state === "assigned" ? "assigned" : result.state === "needs_attention" ? "searching" : result.state,
    strike,
  });
};

export const reportEmergency = async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body ?? {});
    const booking = await findAssignedJob(req, res);
    if (!booking) return;
    return await handleEmergency(req, res, booking, reason);
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/on-the-way – tell the customer I'm coming
export const markOnTheWay = async (req, res, next) => {
  try {
    const booking = await findAssignedJob(req, res);
    if (!booking) return;

    if (booking.status !== "confirmed") {
      return res.status(409).json({ success: false, message: "Only confirmed jobs can be started." });
    }

    if (booking.preferredDate.getTime() !== todayInBerlin().getTime()) {
      return res.status(409).json({ success: false, message: "This job is not scheduled for today." });
    }

    if (!booking.job?.onTheWayAt) {
      booking.set("job.onTheWayAt", new Date());
      await booking.save();
      await trySend("On the way", () =>
        sendCleanerOnTheWayEmail({ booking, workerName: req.user.name })
      );
    }

    return res.json({
      success: true,
      message: "Customer informed.",
      job: { id: booking._id, status: booking.status, job: booking.job },
    });
  } catch (error) {
    next(error);
  }
};
