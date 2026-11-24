import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import { EXTRA_IDS } from "../data/catalogue.js";
import { saveSettings, settingsView } from "../services/settings.service.js";
import { recordAudit } from "../services/audit.service.js";
import { reconcileCommissionTiers } from "../services/commission.service.js";
import { COMMISSION_LIMITS } from "../config/pricing.js";
import { DOCUMENT_KINDS } from "../config/pricing.js"; // [E]
import { recordCashPayment } from "../services/cash.service.js";
import { bumpAvailability } from "../services/availability.service.js";

const rate = z.number().min(0).max(0.5);

const commissionTier = z.object({
  minJobs: z.number().int().min(1).max(100000),
  minReviews: z.number().int().min(0).max(100000),
  minRating: z.number().min(0).max(5),
  commissionPct: z.number().min(COMMISSION_LIMITS.minPct).max(COMMISSION_LIMITS.maxPct),
});

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
        // How strongly the home's condition scales the recommended time.
        // "normal" is the fixed reference (×1); a very clean home may be
        // cheaper (basic < 1), dirtier homes take longer (> 1).
        conditionFactor: z
          .object({
            basic: z.number().min(0.5).max(1),
            moderate: z.number().min(1).max(2),
            heavy: z.number().min(1).max(3),
          })
          .refine((c) => c.moderate <= c.heavy, "Moderate must not exceed heavy.")
          .optional(),
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
    finance: z
      .object({
        incomeTaxRatePct: z.number().min(0).max(60),
        vatBasis: z.enum(["full", "commission"]),
        monthlyFixedCostsCents: z.number().int().min(0).max(100000000),
        fees: z.object({
          paypal: z.object({ pct: z.number().min(0).max(10), fixedCents: z.number().int().min(0).max(500) }),
          stripe: z.object({ pct: z.number().min(0).max(10), fixedCents: z.number().int().min(0).max(500) }),
        }),
      })
      .optional(),
    // [slot-A-settings-schema]
    recurring: z
      .object({
        generateDaysAhead: z.number().int().min(1).max(60),
        priorityHours: z.number().int().min(0).max(168),
        onlineHoldDays: z.number().int().min(1).max(30),
      })
      .optional(),
    // [slot-B-settings-schema]
    invoicing: z
      .object({
        companyName: z.string().trim().min(2).max(120),
        addressLines: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
        taxId: z.string().trim().max(40),
        email: z.union([z.string().trim().email().max(254), z.literal("")]),
        vatNote: z.string().trim().max(300),
        showVat: z.boolean(),
      })
      .optional(),
    // [slot-C-settings-schema]
    // Money policies: cancellation fees, cash limits, payout eligibility
    policies: z
      .object({
        cancellation: z
          .object({
            freeHours: z.number().int().min(0).max(168),
            lateFeePct: z.number().int().min(0).max(100),
            veryLateHours: z.number().int().min(0).max(168),
            veryLateFeePct: z.number().int().min(0).max(100),
            cleanerSharePct: z.number().int().min(0).max(100),
          })
          .refine((c) => c.veryLateHours <= c.freeHours, "The very-late window must lie inside the free-cancellation window.")
          .refine((c) => c.lateFeePct <= c.veryLateFeePct, "The late fee must not exceed the very-late fee."),
        cash: z.object({
          maxTotalCents: z.number().int().min(0).max(1_000_000),
          minTier: z.enum(["new", "bronze", "silver", "gold", "platinum", "diamond"]),
          suspendBelowCents: z.number().int().min(-1_000_000).max(0),
        }),
        payouts: z
          .object({
            eligibilityDays: z.number().int().min(0).max(90),
            fastPayoutDays: z.number().int().min(0).max(90),
            fastPayoutPct: z.number().int().min(0).max(100),
            fastPayoutMinTier: z.enum(["new", "bronze", "silver", "gold", "platinum", "diamond"]),
          })
          .refine((p) => p.fastPayoutDays <= p.eligibilityDays, "The fast payout must come before the regular eligibility."),
      })
      .optional(),
    // [slot-D-settings-schema]
    reliability: z
      .object({
        lateReleaseHours: z.number().int().min(0).max(168),
        strikeLimit: z.number().int().min(1).max(20),
        strikeWindowDays: z.number().int().min(1).max(365),
      })
      .optional(),
    security: z
      .object({
        customerSessionDays: z.number().int().min(1).max(30),
        adminSessionHours: z.number().int().min(1).max(72),
        requireAdmin2fa: z.boolean(),
      })
      .optional(),
    verification: z.object({ requiredDocuments: z.array(z.enum(DOCUMENT_KINDS)).max(DOCUMENT_KINDS.length) }).optional(),
    // [slot-E-settings-schema]
    // [slot-F-settings-schema]
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
        payModel: z.enum(["commission", "hourly"]).optional(),
        commissionTiers: z
          .object({
            new: z.object({ commissionPct: z.number().min(COMMISSION_LIMITS.minPct).max(COMMISSION_LIMITS.maxPct) }),
            bronze: commissionTier,
            silver: commissionTier,
            gold: commissionTier,
            platinum: commissionTier,
            diamond: commissionTier,
          })
          .refine((t) => {
            const order = ["bronze", "silver", "gold", "platinum", "diamond"];
            for (let i = 1; i < order.length; i++) {
              const lo = t[order[i - 1]];
              const hi = t[order[i]];
              if (hi.minJobs <= lo.minJobs || hi.minReviews < lo.minReviews || hi.minRating < lo.minRating) return false;
            }
            return true;
          }, "Higher levels must have equal or stricter requirements.")
          .refine((t) => {
            const chain = ["new", "bronze", "silver", "gold", "platinum", "diamond"];
            for (let i = 1; i < chain.length; i++) if (t[chain[i]].commissionPct >= t[chain[i - 1]].commissionPct) return false;
            return true;
          }, "Every higher level must have a lower commission.")
          .optional(),
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
    // New commission rules → every cleaner's tier/rate is recalculated now
    // (future jobs only; recorded earnings stay untouched)
    if (data.workerPay?.commissionTiers) await reconcileCommissionTiers();
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
