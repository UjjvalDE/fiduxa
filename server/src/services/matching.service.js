// Cleaner matching (round 3): who is SUITABLE for a job, and how well.
//
// Suitable = approved, active, verified e-mail, not paused, not excluded for
// this booking, not on the customer's "do not send" list, inside the weekly
// pattern / date overrides, no holiday, pets OK, documents valid on the day,
// the booked service and extras are skills they do, the job is inside their
// travel radius, their daily / weekly workload limit is not exceeded and they
// have no overlapping job (incl. OPERATIONS.travelBufferMinutes).
//
// Location model: home postcode + maximum travel distance in km
// (workerProfile.homePostcode, else the postcode in workerProfile.address;
// workerProfile.maxTravelKm, default 10). Distances use the approximate
// Berlin postcode centroids in data/berlin-postcodes.js.
//
// Skills: workerProfile.excludedServices / excludedExtras – what the cleaner
// does NOT do (empty = everything), using the catalogue service / extra IDs.
//
// The score (0–100) is a weighted mean of distance, skills (profile
// specialties), rating, reliability (strikes + complaints), customer
// preference (plan / preferred / previous cleaner) and workload balance.
// Weights: POLICIES.assignment.weights (admin → Einstellungen).
//
// In the legacy "board" mode skills, location and workload are not checked
// (old behaviour), only the classic eligibility rules.
import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import Review from "../models/review.model.js";
import Complaint from "../models/complaint.model.js";
import BookingSeries from "../models/booking-series.model.js";
import { OPERATIONS, POLICIES, RELIABILITY } from "../config/pricing.js";
import { DAY_MS, slotStartInstant } from "../utils/helpers.js";
import { distanceKm, postcodeFromAddress } from "../data/berlin-postcodes.js";
import { jobMismatch } from "./worker-profile.service.js";
import { eligibilityProblem } from "./work-eligibility.service.js";
import { activeStrikes, isPaused } from "./reliability.service.js";
import { isAutoMode } from "./assignment-mode.js";

/** Statuses that occupy a cleaner (same as job-dispatch BUSY_STATUSES) */
const BUSY = ["payment_pending", "confirmed", "in_progress", "accepted"];

export const WORKER_MATCH_FIELDS =
  "name email phone role preferredLanguage workerStatus isActive emailVerified availability availabilityOverrides holidays workload reliability documents workEligibility nationality workerProfile workerCommission";

export const ACTIVE_WORKER_FILTER = { role: "worker", workerStatus: "approved", isActive: true, emailVerified: true };

/** Human-readable reason codes (admin dispatch page) */
export const PROBLEM_LABELS = {
  inactive: "not active",
  paused: "paused",
  excluded: "removed from this booking",
  customer_blocked: "customer asked for another cleaner",
  holiday: "holiday",
  day_off: "marked the day as unavailable",
  pets: "does not work with pets",
  no_pattern: "no weekly availability set",
  hours: "outside working hours",
  documents: "documents not valid",
  skills: "does not do this service / extra",
  location: "outside travel radius",
  workload: "workload limit reached",
  busy: "has another job at that time",
  cash: "cash rules",
};

export const homePostcodeOf = (worker) =>
  (worker?.workerProfile?.homePostcode || "").trim() || postcodeFromAddress(worker?.workerProfile?.address) || null;

/** The parts of a booking that matter for matching */
export const jobProfile = (b) => ({
  _id: b._id ?? null,
  preferredDate: b.preferredDate,
  slot: b.slot,
  estimate: { durationMinutes: b.estimate?.durationMinutes ?? 120 },
  serviceId: b.serviceId ?? null,
  extras: b.extras ?? [],
  pets: Boolean(b.pets),
  postcode: b.customerDetails?.postcode ?? b.postcode ?? null,
  customer: b.customer ?? null,
  series: b.series ?? null,
  excluded: (b.assignment?.excluded ?? b.excluded ?? []).map(String),
});

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);
const weekKey = (date) => {
  const d = new Date(date);
  const wd = (d.getUTCDay() + 6) % 7; // Monday = 0
  return dayKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - wd * DAY_MS));
};
const overlaps = (a, b, bufferMs) => a.start.getTime() < b.end.getTime() + bufferMs && b.start.getTime() < a.end.getTime() + bufferMs;
const rangeOf = (b) => {
  const start = slotStartInstant(b.preferredDate, b.slot);
  return { start, end: new Date(start.getTime() + (b.estimate?.durationMinutes ?? 120) * 60_000) };
};

/**
 * Schedules of several cleaners around `dates` (whole weeks, for the
 * workload limits) in one query. `excludeId` = the booking being matched.
 */
export const loadSchedules = async (workerIds, dates, { excludeId = null } = {}) => {
  const schedules = new Map(workerIds.map((id) => [String(id), { ranges: [], days: new Map(), weeks: new Map() }]));
  if (!workerIds.length || !dates.length) return schedules;
  const times = dates.map((d) => new Date(d).getTime());
  const from = new Date(new Date(weekKey(new Date(Math.min(...times)))).getTime() - DAY_MS);
  const to = new Date(new Date(weekKey(new Date(Math.max(...times)))).getTime() + 8 * DAY_MS);
  const rows = await Booking.find({
    assignedWorker: { $in: workerIds },
    preferredDate: { $gte: from, $lte: to },
    status: { $in: [...BUSY, "completed"] },
    ...(excludeId && { _id: { $ne: excludeId } }),
  })
    .select("assignedWorker reference preferredDate slot status estimate.durationMinutes")
    .lean();
  for (const row of rows) {
    const s = schedules.get(String(row.assignedWorker));
    if (!s) continue;
    const minutes = row.estimate?.durationMinutes ?? 120;
    if (BUSY.includes(row.status)) s.ranges.push({ ...rangeOf(row), id: String(row._id), reference: row.reference });
    for (const [map, key] of [[s.days, dayKey(row.preferredDate)], [s.weeks, weekKey(row.preferredDate)]]) {
      const cur = map.get(key) ?? { jobs: 0, minutes: 0 };
      map.set(key, { jobs: cur.jobs + 1, minutes: cur.minutes + minutes });
    }
  }
  return schedules;
};

/** Overlapping job of the cleaner for `job` (incl. travel buffer), or null */
export const scheduleConflict = (schedule, job) => {
  if (!schedule) return null;
  const range = rangeOf(job);
  const buffer = (OPERATIONS.travelBufferMinutes ?? 0) * 60_000;
  return schedule.ranges.find((r) => r.id !== String(job._id) && overlaps(range, r, buffer)) ?? null;
};

/** Daily / weekly limit that `job` would exceed, or null */
export const workloadProblem = (worker, schedule, job) => {
  const limits = worker.workload ?? {};
  const minutes = job.estimate?.durationMinutes ?? 120;
  const day = schedule?.days.get(dayKey(job.preferredDate)) ?? { jobs: 0, minutes: 0 };
  const week = schedule?.weeks.get(weekKey(job.preferredDate)) ?? { jobs: 0, minutes: 0 };
  if (limits.maxJobsPerDay && day.jobs + 1 > limits.maxJobsPerDay) return "jobs_per_day";
  if (limits.maxHoursPerDay && day.minutes + minutes > limits.maxHoursPerDay * 60) return "hours_per_day";
  if (limits.maxJobsPerWeek && week.jobs + 1 > limits.maxJobsPerWeek) return "jobs_per_week";
  if (limits.maxHoursPerWeek && week.minutes + minutes > limits.maxHoursPerWeek * 60) return "hours_per_week";
  return null;
};

export const skillProblem = (worker, job) => {
  const noServices = worker.workerProfile?.excludedServices ?? [];
  const noExtras = worker.workerProfile?.excludedExtras ?? [];
  if (job.serviceId && noServices.includes(job.serviceId)) return true;
  return (job.extras ?? []).some((e) => noExtras.includes(e));
};

export const travelKm = (worker, job) => {
  const home = homePostcodeOf(worker);
  if (!home || !job.postcode) return null;
  return distanceKm(home, job.postcode);
};

export const locationProblem = (worker, job) => {
  if (!job.postcode) return false; // anonymous slot browsing without postcode
  const km = travelKm(worker, job);
  if (km === null) return true; // no home postcode → cannot be routed
  return km > (worker.workerProfile?.maxTravelKm ?? 10);
};

/**
 * Why `worker` is not suitable for `job` (null = suitable).
 * ctx: { schedules, excluded:Set, blocked:Set } – all optional.
 * opts.strictHours=false: admin override of the working-hours check.
 */
export const suitabilityProblem = (worker, job, ctx = {}, { strictHours = true, checkBusy = true } = {}) => {
  const id = String(worker._id);
  if (worker.role !== "worker" || worker.workerStatus !== "approved" || worker.isActive === false || !worker.emailVerified) return "inactive";
  if (isPaused(worker)) return "paused";
  if (ctx.excluded?.has(id) || job.excluded?.includes(id)) return "excluded";
  if (ctx.blocked?.has(id)) return "customer_blocked";
  const mismatch = jobMismatch(worker, job, { strictHours });
  if (mismatch) return mismatch;
  if (eligibilityProblem(worker, job.preferredDate)) return "documents";
  if (isAutoMode()) {
    if (skillProblem(worker, job)) return "skills";
    if (locationProblem(worker, job)) return "location";
    if (workloadProblem(worker, ctx.schedules?.get(id), job)) return "workload";
  }
  if (checkBusy && scheduleConflict(ctx.schedules?.get(id), job)) return "busy";
  return null;
};

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------
const SPECIALTY_FOR = {
  "home-cleaning": "home-cleaning",
  "deep-cleaning": "deep-cleaning",
  "end-of-tenancy": "end-of-tenancy",
  "business-cleaning": "office-cleaning",
  "interior-windows": "windows",
  "glass-partitions": "windows",
  ironing: "ironing",
  laundry: "laundry",
  "inside-oven": "oven-fridge",
  "inside-fridge": "oven-fridge",
  balcony: "balcony",
};

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** { total (0–100), parts: { distance, skills, … } (0–1), km } */
export const scoreCandidate = (worker, job, ctx = {}) => {
  const id = String(worker._id);
  const weights = POLICIES.assignment?.weights ?? {};
  const km = travelKm(worker, job);
  const maxKm = worker.workerProfile?.maxTravelKm ?? 10;
  const needed = [...new Set([job.serviceId, ...(job.extras ?? [])].map((k) => SPECIALTY_FOR[k]).filter(Boolean))];
  const specialties = worker.workerProfile?.specialties ?? [];
  const rating = ctx.ratings?.get(id);
  const negatives = activeStrikes(worker).length + (ctx.complaints?.get(id) ?? 0);
  const schedule = ctx.schedules?.get(id);
  const weekMinutes = schedule?.weeks.get(weekKey(job.preferredDate))?.minutes ?? 0;
  const weekCap = (worker.workload?.maxHoursPerWeek ?? 40) * 60;
  const parts = {
    distance: km === null ? 0.5 : clamp01(1 - km / Math.max(1, maxKm)),
    skills: needed.length ? needed.filter((s) => specialties.includes(s)).length / needed.length : 0.5,
    rating: rating ? clamp01(rating / 5) : 0.7,
    reliability: clamp01(1 - negatives / Math.max(1, RELIABILITY.strikeLimit ?? 3)),
    preference: ctx.preferred && ctx.preferred === id ? 1 : ctx.previous?.has(id) ? 0.6 : 0,
    workload: clamp01(1 - weekMinutes / Math.max(60, weekCap)),
  };
  let sum = 0;
  let weightSum = 0;
  for (const [key, value] of Object.entries(parts)) {
    const w = Number(weights[key] ?? 0);
    sum += w * value;
    weightSum += w;
  }
  const total = weightSum > 0 ? Math.round((sum / weightSum) * 1000) / 10 : 0;
  return { total, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v * 100) / 100])), km };
};

// ---------------------------------------------------------------------------
// Customer context: plan / preferred cleaner, previous cleaners, "do not send"
// ---------------------------------------------------------------------------
export const customerContext = async (job) => {
  const preferredFromPlan = job.series ? (await BookingSeries.findById(job.series).select("preferredWorker").lean())?.preferredWorker : null;
  const customer = job.customer ? await User.findById(job.customer).select("recurringCleanerPreference").lean() : null;
  const pref = customer?.recurringCleanerPreference;
  const blocked = new Set(pref?.choice === "different" && pref.worker ? [String(pref.worker)] : []);
  const preferred = preferredFromPlan ? String(preferredFromPlan) : pref?.choice === "same" && pref.worker ? String(pref.worker) : null;
  const previous = job.customer
    ? new Set((await Booking.distinct("assignedWorker", { customer: job.customer, status: "completed", assignedWorker: { $ne: null } })).map(String))
    : new Set();
  return { preferred: preferred && !blocked.has(preferred) ? preferred : null, blocked, previous };
};

const ratingsFor = async (ids) => {
  const rows = await Review.aggregate([{ $match: { worker: { $in: ids }, hidden: false } }, { $group: { _id: "$worker", avg: { $avg: "$rating" } } }]);
  return new Map(rows.map((r) => [String(r._id), r.avg]));
};

const complaintsFor = async (ids) => {
  const since = new Date(Date.now() - 180 * DAY_MS);
  const rows = await Complaint.aggregate([
    { $match: { worker: { $in: ids }, status: { $nin: ["rejected"] }, createdAt: { $gte: since } } },
    { $group: { _id: "$worker", n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
};

/**
 * Every active cleaner, ranked for `booking`:
 *   [{ worker, suitable, problem, score: { total, parts, km } }]
 * Suitable first (best score first; `preferWorker` first if suitable), then
 * the others with their reason. opts.excluded: extra worker ids to skip.
 */
export const rankCandidates = async (booking, { excluded = [], strictHours = true, preferWorker = null } = {}) => {
  const job = jobProfile(booking);
  const workers = await User.find(ACTIVE_WORKER_FILTER).select(WORKER_MATCH_FIELDS);
  const ids = workers.map((w) => w._id);
  const [schedules, customer, ratings, complaints] = await Promise.all([
    loadSchedules(ids, [job.preferredDate], { excludeId: job._id }),
    customerContext(job),
    ratingsFor(ids),
    complaintsFor(ids),
  ]);
  const ctx = {
    schedules,
    ratings,
    complaints,
    ...customer,
    excluded: new Set([...(booking.assignment?.excluded ?? []), ...excluded].map(String)),
  };
  if (preferWorker && !ctx.blocked.has(String(preferWorker))) ctx.preferred = String(preferWorker);
  const rows = workers.map((worker) => {
    const problem = suitabilityProblem(worker, job, ctx, { strictHours });
    return { worker, suitable: !problem, problem, score: scoreCandidate(worker, job, ctx) };
  });
  const first = ctx.preferred;
  rows.sort(
    (a, b) =>
      Number(b.suitable) - Number(a.suitable) ||
      Number(String(b.worker._id) === first) - Number(String(a.worker._id) === first) ||
      b.score.total - a.score.total ||
      String(a.worker._id).localeCompare(String(b.worker._id))
  );
  return rows;
};

/** { code: count } of the reasons why nobody is suitable (dispatch page) */
export const summariseProblems = (rows) => {
  const counts = {};
  for (const r of rows) if (r.problem) counts[r.problem] = (counts[r.problem] ?? 0) + 1;
  return counts;
};

/** Main reason when nobody is suitable: the most frequent "hard" one */
export const mainReason = (rows) => {
  if (!rows.length) return "no_cleaners";
  const counts = summariseProblems(rows);
  const order = ["skills", "location", "busy", "workload", "hours", "no_pattern", "holiday", "day_off", "documents", "pets", "paused", "excluded", "customer_blocked", "inactive"];
  let best = null;
  for (const code of order) if (counts[code] && (!best || counts[code] > counts[best])) best = code;
  return best ?? "no_cleaners";
};
