import mongoose from "mongoose";
import { z } from "zod";

import AvailabilitySlot from "../models/availability-slot.model.js";
import Booking from "../models/booking.model.js";
import { ACTIVE_BOOKING_STATUSES } from "../config/pricing.js";
import { DAY_MS, parseCalendarDate, todayInBerlin } from "../utils/helpers.js";
import { bumpAvailability, peakConcurrency } from "../services/availability.service.js";

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_RANGE_DAYS = 120;
const MAX_SLOTS_PER_REQUEST = 1000;

const dateString = z
  .string()
  .trim()
  .refine((value) => parseCalendarDate(value) !== null, "Invalid date (YYYY-MM-DD).");

const timeRange = z
  .object({
    startTime: z.string().regex(TIME, "Use HH:MM."),
    endTime: z.string().regex(TIME, "Use HH:MM.").optional().or(z.literal("")).default(""),
  })
  .refine((t) => !t.endTime || t.endTime > t.startTime, {
    message: "End time must be after start time.",
  });

// GET /api/v1/admin/slots?from=YYYY-MM-DD&to=YYYY-MM-DD
// Defaults to the next 14 days. Includes the bookings occupying each slot.
export const listSlots = async (req, res, next) => {
  try {
    const today = todayInBerlin();
    const from = parseCalendarDate(req.query.from) ?? today;
    let to = parseCalendarDate(req.query.to) ?? new Date(today.getTime() + 13 * DAY_MS);
    if (to < from) to = from;
    if ((to - from) / DAY_MS > MAX_RANGE_DAYS) {
      to = new Date(from.getTime() + MAX_RANGE_DAYS * DAY_MS);
    }

    const slots = await AvailabilitySlot.find({ date: { $gte: from, $lte: to } })
      .sort({ date: 1, startTime: 1 })
      .lean();

    const bookings = await Booking.find({
      availabilitySlot: { $in: slots.map((s) => s._id) },
      status: { $in: ACTIVE_BOOKING_STATUSES },
      slotReleased: { $ne: true },
    })
      .select("reference status availabilitySlot customerDetails.name assignedWorker slot slotEnd estimate.durationMinutes")
      .populate("assignedWorker", "name")
      .lean();

    const bySlot = new Map();
    for (const booking of bookings) {
      const key = String(booking.availabilitySlot);
      if (!bySlot.has(key)) bySlot.set(key, []);
      bySlot.get(key).push({
        id: booking._id,
        reference: booking.reference,
        status: booking.status,
        customerName: booking.customerDetails?.name ?? "",
        workerName: booking.assignedWorker?.name ?? null,
        startTime: booking.slot,
        endTime: booking.slotEnd,
        durationMinutes: booking.estimate?.durationMinutes ?? null,
      });
    }

    return res.json({
      success: true,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      slots: slots.map((slot) => {
        let list = bySlot.get(String(slot._id)) ?? [];
        // Bookings of deactivated (replaced) windows also show in the active
        // window of that day that covers their time – they still use capacity.
        if (slot.active && slot.endTime) {
          const sameDayInactive = slots.filter(
            (other) => !other.active && other.date.getTime() === slot.date.getTime()
          );
          for (const other of sameDayInactive) {
            for (const b of bySlot.get(String(other._id)) ?? []) {
              if (b.startTime && b.startTime >= slot.startTime && b.startTime < slot.endTime) {
                list = [...list, { ...b, fromReplacedWindow: true }];
              }
            }
          }
        }
        // Window length × parallel teams = bookable team-minutes
        const windowMinutes = slot.endTime ? toMinutes(slot.endTime) - toMinutes(slot.startTime) : null;
        const bookedMinutes = list.reduce((sum, b) => sum + (b.durationMinutes ?? 0), 0);
        const capacityMinutes = windowMinutes != null ? windowMinutes * slot.capacity : null;
        return {
          id: slot._id,
          date: slot.date.toISOString().slice(0, 10),
          startTime: slot.startTime,
          endTime: slot.endTime,
          capacity: slot.capacity,
          booked: list.length,
          remaining: capacityMinutes != null ? Math.max(0, capacityMinutes - bookedMinutes) : Math.max(0, slot.capacity - list.length),
          windowMinutes,
          capacityMinutes,
          bookedMinutes,
          utilisationPct: capacityMinutes ? Math.round((bookedMinutes / capacityMinutes) * 100) : null,
          active: slot.active,
          note: slot.note,
          bookings: list,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/slots
// Bulk-create slots: every selected weekday between `from` and `to`, at each time.
// { from, to, weekdays: [1..7] (1 = Monday), times: [{ startTime, endTime? }], capacity, note? }
// Existing slots (same date + start time) are skipped unless `updateExisting` is true.
export const createSlots = async (req, res, next) => {
  try {
    const data = z
      .object({
        from: dateString,
        to: dateString,
        weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
        times: z.array(timeRange).min(1).max(24),
        capacity: z.number().int().min(1).max(100),
        note: z.string().trim().max(200).optional().default(""),
        updateExisting: z.boolean().optional().default(false),
        // Replace all other windows of those days (e.g. 2-hour slots → one full-day window).
        // Windows with bookings are deactivated (their bookings stay valid and still count).
        replaceExisting: z.boolean().optional().default(false),
      })
      .parse(req.body);

    const from = parseCalendarDate(data.from);
    const to = parseCalendarDate(data.to);
    const today = todayInBerlin();

    if (to < from) {
      return res.status(422).json({ success: false, message: "'to' must be on or after 'from'." });
    }
    if (from < today) {
      return res.status(422).json({ success: false, message: "Slots cannot be created in the past." });
    }
    if ((to - from) / DAY_MS > MAX_RANGE_DAYS) {
      return res.status(422).json({
        success: false,
        message: `The range can be at most ${MAX_RANGE_DAYS} days.`,
      });
    }

    const weekdays = new Set(data.weekdays);
    const dates = [];
    for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
      const day = new Date(t);
      const isoWeekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
      if (weekdays.has(isoWeekday)) dates.push(day);
    }

    const total = dates.length * data.times.length;
    if (total === 0) {
      return res.status(422).json({ success: false, message: "No dates match the selected weekdays." });
    }
    if (total > MAX_SLOTS_PER_REQUEST) {
      return res.status(422).json({
        success: false,
        message: `Too many slots at once (${total}). Maximum is ${MAX_SLOTS_PER_REQUEST}.`,
      });
    }

    let replaced = 0;
    if (data.replaceExisting) {
      const keepStarts = new Set(data.times.map((t) => t.startTime));
      const existing = await AvailabilitySlot.find({ date: { $in: dates } }).select("_id startTime").lean();
      for (const w of existing) {
        if (keepStarts.has(w.startTime)) continue; // overwritten below
        const hasBookings = await Booking.exists({ availabilitySlot: w._id, status: { $in: ACTIVE_BOOKING_STATUSES } });
        if (hasBookings) await AvailabilitySlot.updateOne({ _id: w._id }, { $set: { active: false } });
        else await AvailabilitySlot.deleteOne({ _id: w._id });
        replaced += 1;
      }
    }
    const overwrite = data.updateExisting || data.replaceExisting;

    const operations = dates.flatMap((date) =>
      data.times.map(({ startTime, endTime }) => ({
        updateOne: {
          filter: { date, startTime },
          update: overwrite
            ? {
                $set: { endTime, capacity: data.capacity, note: data.note, active: true },
                $setOnInsert: { booked: 0, createdBy: req.user._id },
              }
            : {
                $setOnInsert: {
                  endTime,
                  capacity: data.capacity,
                  note: data.note,
                  active: true,
                  booked: 0,
                  createdBy: req.user._id,
                },
              },
          upsert: true,
        },
      }))
    );

    const result = await AvailabilitySlot.bulkWrite(operations, { ordered: false });

    bumpAvailability();
    return res.status(201).json({
      success: true,
      message: "Slots saved.",
      created: result.upsertedCount,
      updated: overwrite ? result.modifiedCount : 0,
      skipped: overwrite ? 0 : total - result.upsertedCount,
      replaced,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/slots/:id  { capacity?, active?, endTime?, note? }
export const updateSlot = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid slot ID." });
    }

    const data = z
      .object({
        capacity: z.number().int().min(0).max(100).optional(),
        active: z.boolean().optional(),
        endTime: z.string().regex(TIME).optional().or(z.literal("")),
        note: z.string().trim().max(200).optional(),
      })
      .parse(req.body);

    const slot = await AvailabilitySlot.findById(req.params.id);

    if (!slot) {
      return res.status(404).json({ success: false, message: "Slot not found." });
    }

    if (data.endTime && data.endTime <= slot.startTime) {
      return res.status(422).json({ success: false, message: "End time must be after start time." });
    }

    // Never cut existing bookings: capacity ≥ jobs running in parallel, end ≥ latest job end
    const { peak, latestEnd } = await peakConcurrency(slot);
    if (data.capacity !== undefined && data.capacity < peak) {
      return res.status(409).json({
        success: false,
        message: `Capacity cannot be lower than the ${peak} place(s) already booked.`,
      });
    }
    if (data.endTime && toMinutes(data.endTime) < latestEnd) {
      return res.status(409).json({
        success: false,
        message: "The window cannot end before a booked job ends.",
      });
    }

    Object.assign(slot, data);
    await slot.save();

    bumpAvailability();
    return res.json({ success: true, message: "Slot updated.", slot });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/admin/slots/:id – only slots without bookings
export const deleteSlot = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid slot ID." });
    }

    const slot = await AvailabilitySlot.findById(req.params.id);

    if (!slot) {
      return res.status(404).json({ success: false, message: "Slot not found." });
    }

    if ((await peakConcurrency(slot)).count > 0) {
      return res.status(409).json({
        success: false,
        message: "This slot has bookings. Deactivate it instead of deleting it.",
      });
    }

    await slot.deleteOne();

    bumpAvailability();
    return res.json({ success: true, message: "Slot deleted." });
  } catch (error) {
    next(error);
  }
};
