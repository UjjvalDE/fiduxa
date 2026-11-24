// Open-job marketplace: confirmed bookings are offered to approved cleaners
// who are free at that time. The first cleaner to accept gets the job.
import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import { OPERATIONS } from "../config/pricing.js";
import { DAY_MS, formatGermanDate, slotLabel, slotStartInstant, todayInBerlin } from "../utils/helpers.js";
import {
  sendAdminNotificationEmail,
  sendCleanerAssignedEmail,
  sendJobAssignedToWorkerEmail,
  sendNewJobAvailableEmail,
  trySend,
} from "./email.service.js";
import { jobMismatch } from "./worker-profile.service.js";
import { eligibilityProblem } from "./work-eligibility.service.js";

const BUSY_STATUSES = ["confirmed", "in_progress", "accepted"];

/** [start, end) of a booking in real time (slot start + booked duration) */
export const jobTimeRange = (booking) => {
  const start = slotStartInstant(booking.preferredDate, booking.slot);
  const minutes = booking.estimate?.durationMinutes ?? 120;
  return { start, end: new Date(start.getTime() + minutes * 60 * 1000) };
};

const overlaps = (a, b, bufferMs) =>
  a.start.getTime() < b.end.getTime() + bufferMs && b.start.getTime() < a.end.getTime() + bufferMs;

/**
 * Another job of this cleaner that overlaps (incl. travel buffer), or null.
 */
export const findWorkerConflict = async (workerId, booking) => {
  const sameDay = await Booking.find({
    _id: { $ne: booking._id },
    assignedWorker: workerId,
    preferredDate: booking.preferredDate,
    status: { $in: BUSY_STATUSES },
  }).select("reference preferredDate slot estimate.durationMinutes");

  const range = jobTimeRange(booking);
  const buffer = OPERATIONS.travelBufferMinutes * 60 * 1000;
  return sameDay.find((other) => overlaps(range, jobTimeRange(other), buffer)) ?? null;
};

/**
 * Busy time ranges of several cleaners on several days in ONE query
 * (avoids one query per cleaner/job). Map workerId → [{ start, end, reference, day }].
 */
export const loadBusyRanges = async (workerIds, dates) => {
  const rows = await Booking.find({
    assignedWorker: { $in: workerIds },
    preferredDate: { $in: dates },
    status: { $in: BUSY_STATUSES },
  })
    .select("assignedWorker reference preferredDate slot estimate.durationMinutes")
    .lean();
  const map = new Map();
  for (const row of rows) {
    const key = String(row.assignedWorker);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ ...jobTimeRange(row), reference: row.reference, id: String(row._id) });
  }
  return map;
};

/** In-memory version of findWorkerConflict using loadBusyRanges() output */
export const conflictIn = (ranges = [], booking) => {
  const range = jobTimeRange(booking);
  const buffer = OPERATIONS.travelBufferMinutes * 60 * 1000;
  return ranges.find((other) => other.id !== String(booking._id) && overlaps(range, other, buffer)) ?? null;
};

/** A confirmed booking without cleaner that is still in the future */
export const isOpenJob = (booking) =>
  booking.status === "confirmed" &&
  !booking.assignedWorker &&
  jobTimeRange(booking).start.getTime() > Date.now();

/**
 * Recurring plans: a new occurrence is reserved for the customer's preferred
 * cleaner until jobOffer.priorityUntil. True = this worker may NOT see/accept it yet.
 */
export const priorityBlocks = (booking, workerId, now = Date.now()) => {
  const offer = booking.jobOffer;
  if (!offer?.priorityWorker || !offer.priorityUntil) return false;
  if (new Date(offer.priorityUntil).getTime() <= now) return false;
  return String(offer.priorityWorker) !== String(workerId);
};

/** Approved, active cleaners who haven't declined and are free at that time */
export const findEligibleWorkers = async (booking) => {
  const excluded = [
    ...(booking.jobOffer?.declinedBy ?? []),
    ...(booking.jobOffer?.releasedBy ?? []),
  ].map(String);

  const exclusive = booking.jobOffer?.priorityWorker && new Date(booking.jobOffer.priorityUntil ?? 0).getTime() > Date.now();
  const workers = await User.find({
    role: "worker",
    workerStatus: "approved",
    isActive: true,
    emailVerified: true,
    ...(exclusive && { _id: booking.jobOffer.priorityWorker }),
  }).select("name email role preferredLanguage workerProfile.petsOk availability holidays reliability.pausedAt documents workEligibility");

  const busy = await loadBusyRanges(workers.map((w) => w._id), [booking.preferredDate]);
  return workers.filter(
    (worker) =>
      !excluded.includes(String(worker._id)) &&
      !worker.reliability?.pausedAt && // paused for reliability strikes (package E)
      !jobMismatch(worker, booking) &&
      !eligibilityProblem(worker, booking.preferredDate) && // documents valid on the job date
      !conflictIn(busy.get(String(worker._id)), booking)
  );
};

/** Email all eligible cleaners about a new open job. Does NOT save the booking. */
export const offerJob = async (booking) => {
  if (!isOpenJob(booking)) return 0;
  const workers = await findEligibleWorkers(booking);
  for (const worker of workers) {
    await trySend("New job", () => sendNewJobAvailableEmail({ worker, booking }));
  }
  booking.set("jobOffer.notifiedAt", new Date());
  return workers.length;
};

/**
 * Atomically give an open job to a cleaner (first come, first served).
 * Returns the updated booking, or null if someone else was faster / it is no longer open.
 */
export const claimJob = async (bookingId, workerId) =>
  Booking.findOneAndUpdate(
    { _id: bookingId, status: "confirmed", assignedWorker: null },
    {
      $set: { assignedWorker: workerId, assignedAt: new Date(), assignedBy: workerId },
      $push: {
        statusHistory: {
          status: "confirmed",
          changedAt: new Date(),
          changedBy: workerId,
          note: "Job accepted by cleaner",
        },
      },
    },
    { returnDocument: "after" }
  );

/** Customer (and, if assigned by the office, the cleaner) get an email. */
export const notifyAssignment = async (booking, worker, { byAdmin }) => {
  await trySend("Cleaner assigned", () =>
    sendCleanerAssignedEmail({ booking, workerName: worker.name })
  );
  if (byAdmin) {
    await trySend("Job assigned", () => sendJobAssignedToWorkerEmail({ worker, booking }));
  }
};

/**
 * Warn the admin once about confirmed jobs that still have no cleaner shortly
 * before the appointment (runs every minute with the hold expiry).
 */
export const alertUnassignedJobs = async () => {
  const horizon = new Date(Date.now() + OPERATIONS.unassignedAlertHours * 60 * 60 * 1000);
  const today = todayInBerlin();

  const candidates = await Booking.find({
    status: "confirmed",
    assignedWorker: null,
    preferredDate: { $gte: today, $lte: new Date(horizon.getTime() + DAY_MS) },
    "jobOffer.unassignedAlertSentAt": { $exists: false },
  }).limit(100);

  let sent = 0;
  for (const booking of candidates) {
    if (jobTimeRange(booking).start > horizon) continue;
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Noch keine Reinigungskraft: ${booking.reference}`,
        lines: [
          `Referenz: ${booking.reference}`,
          `Termin: ${formatGermanDate(booking.preferredDate)}, ${slotLabel(booking.slot, booking.slotEnd)}`,
          `PLZ: ${booking.customerDetails.postcode}`,
          "Bitte manuell zuweisen.",
        ],
      })
    );
    booking.set("jobOffer.unassignedAlertSentAt", new Date());
    await booking.save();
    sent += 1;
  }
  return sent;
};
