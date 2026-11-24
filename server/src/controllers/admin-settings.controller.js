import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import { EXTRA_IDS } from "../data/catalogue.js";
import { saveSettings, settingsView } from "../services/settings.service.js";
import { recordAudit } from "../services/audit.service.js";
import { recordCashPayment } from "../services/cash.service.js";
import { bumpAvailability } from "../services/availability.service.js";

const rate = z.number().min(0).max(0.5);

const settingsSchema = z
  .object({
    pricing: z
      .object({
        hourlyRateCents: z.number().int().min(500).max(20000),
        minimumMinutes: z.number().int().min(30).max(720),
        maximumMinutes: z.number().int().min(60).max(720),
        roundingMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
        areaM2PerHour: z.number().min(5).max(200),
        vatRate: z.number().min(0).max(0.3).optional(),
        frequencyDiscount: z.object({ weekly: rate, biweekly: rate, monthly: rate }),
      })
      .refine((p) => p.minimumMinutes < p.maximumMinutes, "Minimum must be below maximum.")
      .refine((p) => p.minimumMinutes % p.roundingMinutes === 0 && p.maximumMinutes % p.roundingMinutes === 0, "Minimum and maximum must fit the time steps.")
      .optional(),
    extras: z
      .array(
        z.object({
          id: z.enum(EXTRA_IDS),
          minutes: z.number().int().min(0).max(480),
          priceCents: z.number().int().min(0).max(100000),
          active: z.boolean(),
        })
      )
      .max(EXTRA_IDS.length)
      .optional(),
    booking: z
      .object({
        startStepMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
        maxBookingDaysAhead: z.number().int().min(7).max(365),
        cancellationCutoffHours: z.number().int().min(0).max(168),
        teamBufferMinutes: z.number().int().min(0).max(120),
      })
      .optional(),
    payments: z
      .object({ cashEnabled: z.boolean(), paypalEnabled: z.boolean(), stripeEnabled: z.boolean() })
      .optional(),
    giftCards: z
      .object({
        enabled: z.boolean(),
        presetAmountsCents: z.array(z.number().int().min(500).max(200000)).min(1).max(8),
        minCustomCents: z.number().int().min(500).max(200000),
        maxCustomCents: z.number().int().min(500).max(200000),
        validityYears: z.number().int().min(1).max(10),
        maxPerBooking: z.number().int().min(1).max(5),
      })
      .refine((g) => g.minCustomCents <= g.maxCustomCents, "Minimum must be below maximum.")
      .optional(),
    workerPay: z
      .object({
        hourlyRateCents: z.number().int().min(0).max(10000),
        payoutDelayDays: z.number().int().min(0).max(90),
      })
      .optional(),
  })
  .strict();

// GET /api/v1/admin/settings
export const getSettings = (req, res) => res.json({ success: true, settings: settingsView() });

// PUT /api/v1/admin/settings  (any subset of sections)
export const updateSettings = async (req, res, next) => {
  try {
    const data = settingsSchema.parse(req.body);
    const before = settingsView();
    const settings = await saveSettings(data, req.user._id);
    bumpAvailability(); // start interval / buffer / max hours change the offered times
    await recordAudit({
      actor: req.user._id,
      action: "settings.updated",
      entityType: "Settings",
      entityId: req.user._id,
      before: Object.fromEntries(Object.keys(data).map((k) => [k, before[k]])),
      after: data,
    });
    return res.json({ success: true, message: "Settings saved.", settings });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/bookings/:id/cash  { amountCents, collectedBy: "worker" | "office" }
// Record cash for a cash booking (e.g. the cleaner forgot to enter it).
export const recordBookingCash = async (req, res, next) => {
  try {
    const data = z
      .object({
        amountCents: z.number().int().min(0).max(1_000_000),
        collectedBy: z.enum(["worker", "office"]).default("worker"),
      })
      .parse(req.body);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid booking ID." });
    }
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });
    if (booking.payment?.method !== "cash") {
      return res.status(409).json({ success: false, message: "This booking is not paid in cash." });
    }
    await recordCashPayment(booking, {
      amountCents: data.amountCents,
      actorId: req.user._id,
      byWorker: data.collectedBy === "worker" && Boolean(booking.assignedWorker),
    });
    await booking.save();
    await recordAudit({
      actor: req.user._id,
      action: "booking.cash.recorded",
      entityType: "Booking",
      entityId: booking._id,
      after: data,
    });
    return res.json({ success: true, message: "Cash payment recorded.", payment: booking.payment, workerPayout: booking.workerPayout });
  } catch (error) {
    next(error);
  }
};
