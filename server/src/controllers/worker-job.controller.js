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
  loadBusyRanges,
  isOpenJob,
  jobTimeRange,
  notifyAssignment,
  offerJob,
} from "../services/job-dispatch.service.js";
import { OPERATIONS } from "../config/pricing.js";
import { jobMismatch, MISMATCH_MESSAGES } from "../services/worker-profile.service.js";
import { recordWorkerEarning } from "../services/payout.service.js";
import { recordCashPayment } from "../services/cash.service.js";
import { unreadCounts } from "../services/booking-message.service.js";
import { sendBookingStatusEmail } from "../services/email.service.js";

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
  "payment.method",
  "payment.amountCents",
  "payment.status",
  "payment.cashCollectedCents",
].join(" ");

// Workers see the price only when they have to collect it in cash
const forWorker = (job) => {
  const { payment, ...rest } = job;
  return {
    ...rest,
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

// GET /api/v1/worker/jobs?scope=today|upcoming|past
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

    return res.json({ success: true, count: jobs.length, jobs: jobs.map(forWorker), unread });
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

    return res.json({ success: true, job: forWorker(job) });
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
    const { note, checklistDone, cashCollectedCents } = z
      .object({
        note: z.string().trim().max(2000).optional().default(""),
        checklistDone: z.array(z.string().trim().max(100)).max(100).optional().default([]),
        // Cash bookings: amount the cleaner received from the customer
        cashCollectedCents: z.number().int().min(0).max(1_000_000).optional(),
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

    const cashOpen = booking.payment?.method === "cash" && booking.payment?.status !== "paid";
    if (cashOpen && cashCollectedCents === undefined) {
      return res.status(422).json({
        success: false,
        message: "Please enter the cash amount you received from the customer.",
      });
    }

    booking.setStatus("completed", req.user._id, "Completed by worker");
    booking.set("job.completedAt", new Date());
    booking.set("job.workerNote", note);
    booking.set("job.checklistDone", checklistDone);
    await recordWorkerEarning(booking);
    if (cashOpen) {
      await recordCashPayment(booking, { amountCents: cashCollectedCents, actorId: req.user._id, byWorker: true });
    }
    await booking.save();

    // Thank-you email with the invitation to rate the cleaner
    await trySend("Booking status", () => sendBookingStatusEmail({ booking, status: "completed" }));

    return res.json({
      success: true,
      message: "Job completed.",
      job: { id: booking._id, status: booking.status, job: booking.job },
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

const toOpenJob = (booking) => ({
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
});

// GET /api/v1/worker/jobs/open – confirmed jobs without cleaner that fit my calendar
export const listOpenJobs = async (req, res, next) => {
  try {
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

    const jobs = candidates
      .filter((booking) => isOpenJob(booking)) // not started / not in the past
      .filter((booking) => !jobMismatch(req.user, booking)) // holiday, pets, working hours
      .filter((booking) => !conflictIn(myBusy, booking))
      .map(toOpenJob);

    return res.json({ success: true, count: jobs.length, jobs });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/accept – first come, first served
export const acceptJob = async (req, res, next) => {
  try {
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

    const mismatch = jobMismatch(req.user, booking);
    if (mismatch) {
      return res.status(409).json({ success: false, message: MISMATCH_MESSAGES[mismatch], reason: mismatch });
    }

    const conflict = await findWorkerConflict(req.user._id, booking);
    if (conflict) {
      return res.status(409).json({
        success: false,
        message: `You already have job ${conflict.reference} at that time.`,
      });
    }

    const claimed = await claimJob(booking._id, req.user._id);
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

    return res.json({ success: true, message: "Job handed back." });
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
