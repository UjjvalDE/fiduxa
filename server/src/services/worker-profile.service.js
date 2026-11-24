// Cleaner profile helpers: availability / holidays, public stats, public card.
import Booking from "../models/booking.model.js";
import Review from "../models/review.model.js";
import { slotStartInstant, slotStartTime } from "../utils/helpers.js";

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** ISO weekday (1 = Monday … 7 = Sunday) of a calendar day stored as UTC midnight */
export const isoWeekday = (date) => {
  const d = new Date(date).getUTCDay();
  return d === 0 ? 7 : d;
};

/** Holiday entry covering the booking day, or null */
export const holidayOn = (worker, date) => {
  const t = new Date(date).getTime();
  return (worker.holidays ?? []).find((h) => new Date(h.from).getTime() <= t && t <= new Date(h.to).getTime()) ?? null;
};

/** true if the job lies within the cleaner's weekly hours (no hours set = always) */
export const withinWeeklyHours = (worker, booking) => {
  const windows = worker.availability ?? [];
  if (windows.length === 0) return true;
  const weekday = isoWeekday(booking.preferredDate);
  const start = toMinutes(slotStartTime(booking.slot));
  const end = start + (booking.estimate?.durationMinutes ?? 120);
  return windows.some((w) => w.weekday === weekday && toMinutes(w.start) <= start && end <= toMinutes(w.end));
};

/**
 * Why a cleaner cannot take a job (null = fits).
 * strictHours=false skips the weekly-hours check (admin assignment).
 */
export const jobMismatch = (worker, booking, { strictHours = true } = {}) => {
  if (holidayOn(worker, booking.preferredDate)) return "holiday";
  if (booking.pets && !worker.workerProfile?.petsOk) return "pets";
  if (strictHours && !withinWeeklyHours(worker, booking)) return "hours";
  return null;
};

export const MISMATCH_MESSAGES = {
  holiday: "You are on holiday on that day.",
  pets: "There are pets in this home and your profile says you do not work with pets.",
  hours: "This job is outside your working hours.",
};

const round1 = (n) => Math.round(n * 10) / 10;

/** Ratings, reliability and punctuality of a cleaner */
export const getWorkerStats = async (workerId) => {
  const [ratingAgg, completed, released] = await Promise.all([
    Review.aggregate([
      { $match: { worker: workerId, hidden: false } },
      {
        $group: {
          _id: null,
          avg: { $avg: "$rating" },
          count: { $sum: 1 },
          punctuality: { $avg: "$punctuality" },
          quality: { $avg: "$quality" },
          friendliness: { $avg: "$friendliness" },
        },
      },
    ]),
    Booking.find({ assignedWorker: workerId, status: "completed" })
      .select("preferredDate slot job.startedAt customer")
      .lean(),
    Booking.countDocuments({ "jobOffer.releasedBy": workerId }),
  ]);

  const r = ratingAgg[0];
  const timed = completed.filter((b) => b.job?.startedAt);
  const onTime = timed.filter(
    (b) => new Date(b.job.startedAt).getTime() <= slotStartInstant(b.preferredDate, b.slot).getTime() + 15 * 60 * 1000
  ).length;

  const customerCounts = new Map();
  for (const b of completed) customerCounts.set(String(b.customer), (customerCounts.get(String(b.customer)) ?? 0) + 1);
  const repeatCustomers = [...customerCounts.values()].filter((n) => n > 1).length;

  const commitments = completed.length + released;

  return {
    ratingAvg: r ? round1(r.avg) : null,
    ratingCount: r?.count ?? 0,
    ratingDetails: r
      ? {
          punctuality: r.punctuality ? round1(r.punctuality) : null,
          quality: r.quality ? round1(r.quality) : null,
          friendliness: r.friendliness ? round1(r.friendliness) : null,
        }
      : null,
    jobsCompleted: completed.length,
    jobsHandedBack: released,
    // Share of accepted jobs that were actually done (null until there is data)
    reliabilityPct: commitments > 0 ? Math.round((completed.length / commitments) * 100) : null,
    // Started at most 15 minutes after the slot start
    punctualityPct: timed.length > 0 ? Math.round((onTime / timed.length) * 100) : null,
    repeatCustomers,
  };
};

export const avatarUrl = (worker) =>
  worker?.avatarUpdatedAt
    ? `/api/v1/cleaners/${worker._id}/avatar?v=${new Date(worker.avatarUpdatedAt).getTime()}`
    : null;

export const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

/** Short public card (customer booking page, cleaner list) */
export const publicWorkerCard = (worker, stats) => ({
  id: worker._id,
  firstName: firstName(worker.name),
  avatarUrl: avatarUrl(worker),
  experienceYears: worker.workerProfile?.experienceYears ?? 0,
  specialties: worker.workerProfile?.specialties ?? [],
  languages: worker.workerProfile?.languages ?? [],
  petsOk: Boolean(worker.workerProfile?.petsOk),
  ...(stats && {
    ratingAvg: stats.ratingAvg,
    ratingCount: stats.ratingCount,
    jobsCompleted: stats.jobsCompleted,
    reliabilityPct: stats.reliabilityPct,
  }),
});

export const PUBLIC_WORKER_FIELDS = "name workerProfile avatarUpdatedAt createdAt";
