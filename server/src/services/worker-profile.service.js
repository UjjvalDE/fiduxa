// Cleaner profile helpers: availability / holidays, public stats, public card.
import Booking from "../models/booking.model.js";
import Review from "../models/review.model.js";
import { slotStartInstant, slotStartTime } from "../utils/helpers.js";
import { isAutoMode } from "./assignment-mode.js";

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

// ---------------------------------------------------------------------------
// Availability pattern (round 3)
//   weekly windows { weekday, start, end, weeks: "all" | "A" | "B" }
//   – "A"/"B" = every second week. Week A/B is counted from Monday
//     2024-01-01 (week A), so it never jumps at a year boundary.
//   date overrides { date, kind: "off" | "extra", start, end } – the monthly
//   calendar: a day off, or extra hours on a single day.
// In "auto" mode a cleaner WITHOUT a weekly pattern counts as not available.
// In the legacy "board" mode an empty pattern still means "always".
// ---------------------------------------------------------------------------
const WEEK_ANCHOR = Date.UTC(2024, 0, 1); // a Monday → week A
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "A" or "B" for the calendar week of `date` */
export const weekParity = (date) => {
  const day = new Date(date);
  const utc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const weeks = Math.floor((utc - WEEK_ANCHOR) / WEEK_MS);
  return ((weeks % 2) + 2) % 2 === 0 ? "A" : "B";
};

const sameDay = (a, b) => new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

/** The cleaner's date override for that day, or null */
export const overrideOn = (worker, date) => (worker.availabilityOverrides ?? []).find((o) => sameDay(o.date, date)) ?? null;

export const hasWeeklyPattern = (worker) => (worker.availability ?? []).length > 0;

const patternRequired = () => isAutoMode();

/**
 * Working windows of a cleaner on a calendar day as [{ start, end }] in
 * minutes (Berlin). Holidays and "off" overrides → []. Without a weekly
 * pattern: [] in auto mode, the whole day in board mode.
 */
export const dayWindows = (worker, date) => {
  if (holidayOn(worker, date)) return [];
  const override = overrideOn(worker, date);
  if (override?.kind === "off") return [];
  const extra = override?.kind === "extra" && override.start && override.end ? [{ start: toMinutes(override.start), end: toMinutes(override.end) }] : [];
  if (!hasWeeklyPattern(worker)) return patternRequired() ? extra : [{ start: 0, end: 24 * 60 }];
  const weekday = isoWeekday(date);
  const parity = weekParity(date);
  const weekly = (worker.availability ?? [])
    .filter((w) => w.weekday === weekday && (!w.weeks || w.weeks === "all" || w.weeks === parity))
    .map((w) => ({ start: toMinutes(w.start), end: toMinutes(w.end) }));
  return [...weekly, ...extra];
};

/** true if the job lies within the cleaner's working windows of that day */
export const withinWeeklyHours = (worker, booking) => {
  const start = toMinutes(slotStartTime(booking.slot));
  const end = start + (booking.estimate?.durationMinutes ?? 120);
  return dayWindows(worker, booking.preferredDate).some((w) => w.start <= start && end <= w.end);
};

/**
 * Why a cleaner cannot take a job (null = fits).
 * strictHours=false skips the weekly-hours check (admin assignment).
 */
export const jobMismatch = (worker, booking, { strictHours = true } = {}) => {
  if (holidayOn(worker, booking.preferredDate)) return "holiday";
  if (overrideOn(worker, booking.preferredDate)?.kind === "off") return "day_off";
  if (booking.pets && !worker.workerProfile?.petsOk) return "pets";
  if (strictHours && patternRequired() && !hasWeeklyPattern(worker)) return "no_pattern";
  if (strictHours && !withinWeeklyHours(worker, booking)) return "hours";
  return null;
};

export const MISMATCH_MESSAGES = {
  holiday: "You are on holiday on that day.",
  day_off: "You marked this day as not available.",
  pets: "There are pets in this home and your profile says you do not work with pets.",
  hours: "This job is outside your working hours.",
  no_pattern: "Please set your weekly availability first.",
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
