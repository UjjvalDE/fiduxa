import mongoose from "mongoose";

import AvailabilitySlot from "../models/availability-slot.model.js";
import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import { ACTIVE_WORKER_FILTER, WORKER_MATCH_FIELDS, jobProfile, loadSchedules, suitabilityProblem } from "./matching.service.js";
import { userEvents } from "../utils/events.js";
import { withLock } from "../utils/lock.js";
import { releaseBookingDiscounts } from "./booking-discounts.service.js";
import { ACTIVE_BOOKING_STATUSES, OPERATIONS, PRICING } from "../config/pricing.js";
import {
  DAY_MS,
  httpError,
  parseCalendarDate,
  slotStartTime,
  todayInBerlin,
} from "../utils/helpers.js";

// Throws 400 if the date is not bookable (past, today, or too far ahead)
export const assertBookableDate = (value) => {
  const date = parseCalendarDate(value);

  if (!date) {
    throw httpError(400, "Please provide a valid date (YYYY-MM-DD).");
  }

  const today = todayInBerlin();
  const earliest = new Date(today.getTime() + DAY_MS); // from tomorrow
  const latest = new Date(
    today.getTime() + OPERATIONS.maxBookingDaysAhead * DAY_MS
  );

  if (date < earliest) {
    throw httpError(400, "Bookings are possible from tomorrow onwards.");
  }

  if (date > latest) {
    throw httpError(
      400,
      `Bookings are possible up to ${OPERATIONS.maxBookingDaysAhead} days in advance.`
    );
  }

  return date;
};

export const bookableRange = () => {
  const today = todayInBerlin();
  return {
    from: new Date(today.getTime() + DAY_MS),
    to: new Date(today.getTime() + OPERATIONS.maxBookingDaysAhead * DAY_MS),
  };
};

// ---------------------------------------------------------------------------
// Availability windows
//
// An AvailabilitySlot is a WINDOW published by the admin, e.g. 08:00–18:00
// ("full day") with capacity = number of teams that can work in parallel.
// Customers get every start time (every OPERATIONS.startStepMinutes) at
// which a job of their total duration fits into the window and fewer than
// `capacity` other jobs overlap (incl. OPERATIONS.teamBufferMinutes).
// Legacy slots without endTime offer exactly one start time.
// `booked` counts the active bookings in a window (statistics only).
// ---------------------------------------------------------------------------

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const DAY_END = 24 * 60;

const windowBounds = (slot) => {
  const start = toMinutes(slot.startTime);
  return slot.endTime ? { start, end: toMinutes(slot.endTime), fixed: false } : { start, end: DAY_END, fixed: true };
};

const bookingInterval = (b) => {
  const start = toMinutes(slotStartTime(b.slot));
  return { start, end: start + (b.estimate?.durationMinutes ?? 120) };
};

// Active bookings of the given days. Capacity is shared by all windows of a
// day, so bookings in replaced/deactivated windows still count.
const activeBookingsOn = async (dates, excludeId) =>
  (
    await Booking.find({
      preferredDate: { $in: dates },
      status: { $in: ACTIVE_BOOKING_STATUSES },
      ...(excludeId && { _id: { $ne: excludeId } }),
    })
      .select("preferredDate slot estimate.durationMinutes")
      .lean()
  ).map((b) => ({ day: b.preferredDate.toISOString().slice(0, 10), ...bookingInterval(b) }));

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

const overlapping = (intervals, start, end) => {
  const buffer = OPERATIONS.teamBufferMinutes ?? 0;
  return intervals.filter((b) => b.start < end + buffer && start < b.end + buffer).length;
};

// ---------------------------------------------------------------------------
// Cleaner-aware capacity (OPERATIONS.slotCapacity.mode = "cleaners", default)
//
// A start time is only offered when, for the WHOLE job [start, start+duration]
// (incl. OPERATIONS.travelBufferMinutes before/after), there is at least one
// eligible cleaner free: approved, active, verified e-mail, not paused, not on
// holiday, inside their weekly hours, documents valid on the day, and no
// overlapping job of their own. Active bookings without a cleaner (holds that
// are being paid, confirmed jobs nobody accepted yet) each consume one free
// cleaner (slotCapacity.unassignedConsumesCleaner). The result is capped by
// the admin window capacity. "window" mode = admin capacity only (legacy).
// The same calculation runs inside the day lock when a booking is created,
// moved or re-claimed, so the list, the reservation and the final booking
// agree – two customers can never both take the last free cleaner.
// ---------------------------------------------------------------------------
export const cleanerAwareSlots = () => (OPERATIONS.slotCapacity?.mode ?? "cleaners") === "cleaners";

const UNASSIGNED_FIELDS = "preferredDate slot estimate.durationMinutes serviceId extras pets customer customerDetails.postcode assignment.excluded";

const loadCleanerPool = async (dates, excludeId) => {
  if (!cleanerAwareSlots()) return null;
  const workers = await User.find(ACTIVE_WORKER_FILTER).select(WORKER_MATCH_FIELDS).lean();
  const schedules = workers.length ? await loadSchedules(workers.map((w) => w._id), dates, { excludeId }) : new Map();
  const unassigned =
    OPERATIONS.slotCapacity?.unassignedConsumesCleaner === false
      ? []
      : (
          await Booking.find({
            preferredDate: { $in: dates },
            status: { $in: ACTIVE_BOOKING_STATUSES },
            assignedWorker: null,
            ...(excludeId && { _id: { $ne: excludeId } }),
          })
            .select(UNASSIGNED_FIELDS)
            .lean()
        ).map((b) => ({ day: dayKey(b.preferredDate), ...bookingInterval(b), job: jobProfile(b) }));
  return { workers, schedules, unassigned };
};

/**
 * Free SUITABLE cleaners for a job at [start, start+duration) on `date`.
 * Bookings without a cleaner that overlap (incl. travel buffer) each need a
 * suitable cleaner of their own: a small bipartite matching (augmenting
 * paths) assigns them first, then counts how many more jobs like the probe
 * still fit. `job` = { serviceId, extras, postcode, pets } (optional).
 */
const freeCleanerCapacity = (pool, date, start, duration, excludeId, job = null) => {
  const probe = { ...(job ?? {}), _id: excludeId ?? "probe", preferredDate: date, slot: toHHMM(start), estimate: { durationMinutes: duration } };
  const strictHours = OPERATIONS.slotCapacity?.respectWorkingHours !== false;
  const ctx = { schedules: pool.schedules };
  const suitableFor = (j) => pool.workers.filter((w) => !suitabilityProblem(w, j, ctx, { strictHours })).map((w) => String(w._id));
  const probeCands = suitableFor(probe);
  if (probeCands.length === 0) return 0;
  const buffer = OPERATIONS.travelBufferMinutes ?? 0;
  const day = dayKey(date);
  const others = pool.unassigned
    .filter((b) => b.day === day && b.start < start + duration + buffer && start < b.end + buffer)
    .map((b) => suitableFor({ ...b.job, preferredDate: date }));
  // Augmenting-path matching: owner = workerId → index of the job holding it
  const owner = new Map();
  const tryAssign = (jobIdx, cands, seen) => {
    for (const w of cands(jobIdx)) {
      if (seen.has(w)) continue;
      seen.add(w);
      const holder = owner.get(w);
      if (holder === undefined || tryAssign(holder, cands, seen)) {
        owner.set(w, jobIdx);
        return true;
      }
    }
    return false;
  };
  const jobs = [...others];
  const cands = (i) => jobs[i];
  for (let i = 0; i < others.length; i++) tryAssign(i, cands, new Set());
  let free = 0;
  for (let k = 0; k < probeCands.length; k++) {
    jobs.push(probeCands);
    if (!tryAssign(jobs.length - 1, cands, new Set())) break;
    free += 1;
  }
  return free;
};

/** Remaining places at `t` (window capacity, capped by free cleaners) */
const remainingAt = (slot, intervals, pool, t, duration, excludeId, job = null) => {
  const windowLeft = slot.capacity - overlapping(intervals, t, t + duration);
  if (windowLeft <= 0 || !pool) return windowLeft;
  return Math.min(windowLeft, freeCleanerCapacity(pool, slot.date, t, duration, excludeId, job));
};

/** Start options of one window for a job of `duration` minutes */
const startOptions = (slot, intervals, duration, pool = null, job = null) => {
  const { start, end, fixed } = windowBounds(slot);
  const step = OPERATIONS.startStepMinutes || 30;
  const options = [];
  for (let t = start; t + duration <= end; t += step) {
    const remaining = remainingAt(slot, intervals, pool, t, duration, null, job);
    if (remaining > 0) {
      options.push({
        id: String(slot._id),
        windowId: String(slot._id),
        startTime: toHHMM(t),
        endTime: toHHMM(t + duration),
        available: true,
        remaining,
      });
    }
    if (fixed) break;
  }
  return options;
};

const normaliseDuration = (durationMinutes) =>
  Math.min(PRICING.maximumMinutes, Math.max(PRICING.minimumMinutes, Number(durationMinutes) || PRICING.minimumMinutes));

// ---------------------------------------------------------------------------
// Short cache for the public availability lookups. Cleared whenever capacity
// changes (booking, cancellation, expiry, admin window edits). Bookings are
// always re-checked inside the lock, so a stale entry can never overbook.
// ---------------------------------------------------------------------------
const CACHE_MS = 15_000;
const cache = new Map();
export const bumpAvailability = () => cache.clear();
// Cleaner hours, holidays, pause, documents, skills … changed → recompute now
userEvents.on("changed", bumpAvailability);

/** Job filter from query/body: { serviceId, extras, postcode, pets } (all optional) */
export const slotJobFilter = ({ serviceId, extras, postcode, pets } = {}) => {
  const list = Array.isArray(extras) ? extras : String(extras ?? "").split(",");
  const job = {
    serviceId: serviceId ? String(serviceId).slice(0, 40) : null,
    extras: list.map((e) => String(e).trim()).filter(Boolean).slice(0, 30).sort(),
    postcode: /^\d{5}$/.test(String(postcode ?? "").trim()) ? String(postcode).trim() : null,
    pets: pets === true || pets === "true" || pets === "1",
  };
  return job.serviceId || job.extras.length || job.postcode || job.pets ? job : null;
};
const jobKey = (job) => (job ? `${job.serviceId}|${job.extras.join(",")}|${job.postcode}|${job.pets}` : "-");
const cached = async (key, fn) => {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await fn();
  if (cache.size > 500) cache.clear();
  cache.set(key, { value, until: Date.now() + CACHE_MS });
  return value;
};

/** Start times for one day that fit a job of `durationMinutes` */
export const getSlotsForDate = (date, durationMinutes, job = null) =>
  cached(`slots|${date.getTime()}|${normaliseDuration(durationMinutes)}|${jobKey(job)}`, () => computeSlotsForDate(date, durationMinutes, job));

const computeSlotsForDate = async (date, durationMinutes, job = null, excludeId = null) => {
  const duration = normaliseDuration(durationMinutes);
  const windows = await AvailabilitySlot.find({ date, active: true, capacity: { $gt: 0 } }).sort({ startTime: 1 }).lean();
  if (windows.length === 0) return [];
  const [intervals, pool] = await Promise.all([activeBookingsOn([date], excludeId), loadCleanerPool([date], excludeId)]);

  const byTime = new Map();
  for (const w of windows) {
    for (const option of startOptions(w, intervals, duration, pool, job)) {
      const existing = byTime.get(option.startTime);
      if (!existing || existing.remaining < option.remaining) byTime.set(option.startTime, option);
    }
  }
  return [...byTime.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
};

/** Days (YYYY-MM-DD) in [from, to] with at least one start time for the duration */
export const getAvailableDays = (from, to, durationMinutes, job = null) =>
  cached(`days|${from.getTime()}|${to.getTime()}|${normaliseDuration(durationMinutes)}|${jobKey(job)}`, () => computeAvailableDays(from, to, durationMinutes, job));

/** Start times of one day for an EXISTING booking (ignores its own place) – alternatives */
export const slotsForBooking = (booking, date) => computeSlotsForDate(date, booking.estimate?.durationMinutes ?? 120, jobProfile(booking), booking._id);

const computeAvailableDays = async (from, to, durationMinutes, job = null) => {
  const duration = normaliseDuration(durationMinutes);
  const windows = await AvailabilitySlot.find({
    date: { $gte: from, $lte: to },
    active: true,
    capacity: { $gt: 0 },
  }).lean();
  if (windows.length === 0) return [];
  const dates = [...new Set(windows.map((w) => w.date.getTime()))].map((t) => new Date(t));
  const [intervals, pool] = await Promise.all([activeBookingsOn(dates), loadCleanerPool(dates)]);

  const perDay = new Map();
  for (const w of windows) {
    const options = startOptions(w, intervals.filter((i) => i.day === dayKey(w.date)), duration, pool, job);
    if (options.length === 0) continue;
    const key = w.date.toISOString().slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + options.length);
  }
  return [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, freeSlots]) => ({ date, freeSlots }));
};

/** Highest number of jobs running at the same time in a window (for admin edits) */
export const peakConcurrency = async (slot) => {
  const intervals = (
    await Booking.find({ availabilitySlot: slot._id, status: { $in: ACTIVE_BOOKING_STATUSES } })
      .select("slot estimate.durationMinutes")
      .lean()
  ).map(bookingInterval);
  let peak = 0;
  for (const i of intervals) {
    peak = Math.max(peak, intervals.filter((j) => j.start < i.end && i.start < j.end).length);
  }
  return { peak, latestEnd: intervals.reduce((m, i) => Math.max(m, i.end), 0), count: intervals.length };
};

const withDayLock = (date, fn) => withLock(`day:${dayKey(date)}`, fn);

const fitsWindow = (slot, start, duration, intervals, pool = null, excludeId = null, job = null) => {
  if (!slot || !slot.active) return false;
  const { start: ws, end: we, fixed } = windowBounds(slot);
  if (start < ws || start + duration > we) return false;
  if (fixed && start !== ws) return false;
  const step = OPERATIONS.startStepMinutes || 30;
  if (!fixed && (start - ws) % step !== 0) return false;
  return remainingAt(slot, intervals, pool, start, duration, excludeId, job) > 0;
};

/**
 * Reserve a start time and create the booking inside the lock.
 * `createBooking(slot, { startTime, endTime })` must create and save the booking.
 * Returns the booking, or null if the time is no longer free.
 */
export const reserveAndCreate = async ({ slotId, date, startTime, durationMinutes, job = null }, createBooking) => {
  if (!mongoose.isValidObjectId(slotId)) return null;
  const window = await AvailabilitySlot.findById(slotId).lean();
  if (!window || (date && window.date.getTime() !== date.getTime())) return null;
  return withDayLock(window.date, async () => {
    const slot = await AvailabilitySlot.findById(slotId).lean();
    if (!slot) return null;
    const start = toMinutes(startTime || slot.startTime);
    // Final re-check inside the day lock: window capacity AND a free cleaner
    const [intervals, pool] = await Promise.all([activeBookingsOn([slot.date]), loadCleanerPool([slot.date])]);
    if (!fitsWindow(slot, start, durationMinutes, intervals, pool, null, job)) return null;
    const booking = await createBooking(slot, { startTime: toHHMM(start), endTime: toHHMM(start + durationMinutes) });
    await AvailabilitySlot.updateOne({ _id: slot._id }, { $inc: { booked: 1 } });
    bumpAvailability();
    return booking;
  });
};

/**
 * Move an existing booking to a new window/start time (same or another day).
 * Validates capacity excluding the booking itself, updates both windows'
 * counters and sets the new time fields on the booking. Does NOT save.
 * Returns true on success, false when the new time is not free.
 */
export const moveBooking = async (booking, { slotId, date, startTime, durationMinutes }) => {
  if (!mongoose.isValidObjectId(slotId)) return false;
  const window = await AvailabilitySlot.findById(slotId).lean();
  if (!window || (date && window.date.getTime() !== date.getTime())) return false;
  return withDayLock(window.date, async () => {
    const slot = await AvailabilitySlot.findById(slotId).lean();
    if (!slot) return false;
    const start = toMinutes(startTime || slot.startTime);
    const [intervals, pool] = await Promise.all([activeBookingsOn([slot.date], booking._id), loadCleanerPool([slot.date], booking._id)]);
    // A booking that already has its cleaner only needs that cleaner (checked
    // separately by the schedule lock), not another free one
    if (!fitsWindow(slot, start, durationMinutes, intervals, booking.assignedWorker ? null : pool, booking._id, jobProfile(booking))) return false;
    const previousSlot = booking.availabilitySlot;
    const hadPlace = previousSlot && !booking.slotReleased;
    if (hadPlace && String(previousSlot) !== String(slot._id)) {
      await AvailabilitySlot.updateOne({ _id: previousSlot, booked: { $gt: 0 } }, { $inc: { booked: -1 } });
    }
    if (!hadPlace || String(previousSlot) !== String(slot._id)) {
      await AvailabilitySlot.updateOne({ _id: slot._id }, { $inc: { booked: 1 } });
    }
    booking.availabilitySlot = slot._id;
    booking.preferredDate = slot.date;
    booking.slot = toHHMM(start);
    booking.slotEnd = toHHMM(start + durationMinutes);
    booking.slotReleased = false;
    bumpAvailability();
    return true;
  });
};

// Give a booking's place back (idempotent). Does NOT save the booking.
export const releaseSlot = async (booking) => {
  if (!booking.availabilitySlot || booking.slotReleased) return;
  await AvailabilitySlot.updateOne(
    { _id: booking.availabilitySlot, booked: { $gt: 0 } },
    { $inc: { booked: -1 } }
  );
  booking.slotReleased = true;
  bumpAvailability();
};

// Re-take a released place (e.g. a late payment for an expired hold)
export const reclaimSlot = async (booking) => {
  if (!booking.availabilitySlot) return false;
  if (!booking.slotReleased) return true;
  const slot = await AvailabilitySlot.findById(booking.availabilitySlot).lean();
  if (!slot) return false;
  return withDayLock(slot.date, async () => {
    const [intervals, pool] = await Promise.all([activeBookingsOn([slot.date], booking._id), loadCleanerPool([slot.date], booking._id)]);
    const { start, end } = bookingInterval(booking);
    if (remainingAt(slot, intervals, booking.assignedWorker ? null : pool, start, end - start, booking._id, jobProfile(booking)) <= 0) return false;
    await AvailabilitySlot.updateOne({ _id: slot._id }, { $inc: { booked: 1 } });
    booking.slotReleased = false;
    bumpAvailability();
    return true;
  });
};

// Expire unpaid reservations whose hold time has passed (runs every minute)
export const expireStaleHolds = async () => {
  const stale = await Booking.find({
    status: "payment_pending",
    holdExpiresAt: { $ne: null, $lte: new Date() },
  }).limit(200);

  for (const booking of stale) {
    await releaseSlot(booking);
    await releaseBookingDiscounts(booking, { note: `Booking ${booking.reference} expired (not paid)` });
    booking.setStatus("expired", undefined, "Payment not completed in time");
    booking.holdExpiresAt = null;
    await booking.save();
  }

  return stale.length;
};
