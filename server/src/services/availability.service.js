import mongoose from "mongoose";

import AvailabilitySlot from "../models/availability-slot.model.js";
import Booking from "../models/booking.model.js";
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

/** Start options of one window for a job of `duration` minutes */
const startOptions = (slot, intervals, duration) => {
  const { start, end, fixed } = windowBounds(slot);
  const step = OPERATIONS.startStepMinutes || 30;
  const options = [];
  for (let t = start; t + duration <= end; t += step) {
    const used = overlapping(intervals, t, t + duration);
    if (used < slot.capacity) {
      options.push({
        id: String(slot._id),
        windowId: String(slot._id),
        startTime: toHHMM(t),
        endTime: toHHMM(t + duration),
        available: true,
        remaining: slot.capacity - used,
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
const cached = async (key, fn) => {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await fn();
  if (cache.size > 500) cache.clear();
  cache.set(key, { value, until: Date.now() + CACHE_MS });
  return value;
};

/** Start times for one day that fit a job of `durationMinutes` */
export const getSlotsForDate = (date, durationMinutes) =>
  cached(`slots|${date.getTime()}|${normaliseDuration(durationMinutes)}`, () => computeSlotsForDate(date, durationMinutes));

const computeSlotsForDate = async (date, durationMinutes) => {
  const duration = normaliseDuration(durationMinutes);
  const windows = await AvailabilitySlot.find({ date, active: true, capacity: { $gt: 0 } }).sort({ startTime: 1 }).lean();
  if (windows.length === 0) return [];
  const intervals = await activeBookingsOn([date]);

  const byTime = new Map();
  for (const w of windows) {
    for (const option of startOptions(w, intervals, duration)) {
      const existing = byTime.get(option.startTime);
      if (!existing || existing.remaining < option.remaining) byTime.set(option.startTime, option);
    }
  }
  return [...byTime.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
};

/** Days (YYYY-MM-DD) in [from, to] with at least one start time for the duration */
export const getAvailableDays = (from, to, durationMinutes) =>
  cached(`days|${from.getTime()}|${to.getTime()}|${normaliseDuration(durationMinutes)}`, () => computeAvailableDays(from, to, durationMinutes));

const computeAvailableDays = async (from, to, durationMinutes) => {
  const duration = normaliseDuration(durationMinutes);
  const windows = await AvailabilitySlot.find({
    date: { $gte: from, $lte: to },
    active: true,
    capacity: { $gt: 0 },
  }).lean();
  if (windows.length === 0) return [];
  const intervals = await activeBookingsOn([...new Set(windows.map((w) => w.date.getTime()))].map((t) => new Date(t)));

  const perDay = new Map();
  for (const w of windows) {
    const options = startOptions(w, intervals.filter((i) => i.day === dayKey(w.date)), duration);
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

const fitsWindow = (slot, start, duration, intervals) => {
  if (!slot || !slot.active) return false;
  const { start: ws, end: we, fixed } = windowBounds(slot);
  if (start < ws || start + duration > we) return false;
  if (fixed && start !== ws) return false;
  const step = OPERATIONS.startStepMinutes || 30;
  if (!fixed && (start - ws) % step !== 0) return false;
  return overlapping(intervals, start, start + duration) < slot.capacity;
};

/**
 * Reserve a start time and create the booking inside the lock.
 * `createBooking(slot, { startTime, endTime })` must create and save the booking.
 * Returns the booking, or null if the time is no longer free.
 */
export const reserveAndCreate = async ({ slotId, date, startTime, durationMinutes }, createBooking) => {
  if (!mongoose.isValidObjectId(slotId)) return null;
  const window = await AvailabilitySlot.findById(slotId).lean();
  if (!window || (date && window.date.getTime() !== date.getTime())) return null;
  return withDayLock(window.date, async () => {
    const slot = await AvailabilitySlot.findById(slotId).lean();
    if (!slot) return null;
    const start = toMinutes(startTime || slot.startTime);
    const intervals = await activeBookingsOn([slot.date]);
    if (!fitsWindow(slot, start, durationMinutes, intervals)) return null;
    const booking = await createBooking(slot, { startTime: toHHMM(start), endTime: toHHMM(start + durationMinutes) });
    await AvailabilitySlot.updateOne({ _id: slot._id }, { $inc: { booked: 1 } });
    bumpAvailability();
    return booking;
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
    const intervals = await activeBookingsOn([slot.date], booking._id);
    const { start, end } = bookingInterval(booking);
    if (overlapping(intervals, start, end) >= slot.capacity) return false;
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
