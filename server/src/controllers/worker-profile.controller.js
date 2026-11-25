// Cleaner self-service: overview, public profile, photo, working hours,
// holidays, calendar and earnings.
import { z } from "zod";
import mongoose from "mongoose";

import User from "../models/user.model.js";
import Booking from "../models/booking.model.js";
import Payout from "../models/payout.model.js";
import { PRICING, WORKER_LANGUAGES, WORKER_PAY, WORKER_SPECIALTIES } from "../config/pricing.js";
import { DAY_MS, parseCalendarDate, todayInBerlin } from "../utils/helpers.js";
import { avatarUrl, getWorkerStats, hasWeeklyPattern, weekParity } from "../services/worker-profile.service.js";
import { homePostcodeOf } from "../services/matching.service.js";
import { assignmentMode } from "../services/assignment-mode.js";
import { bumpAvailability } from "../services/availability.service.js";
import { EXTRAS, EXTRA_IDS, SERVICES, SERVICE_IDS } from "../data/catalogue.js";
import { displayPayoutStatus, earningsSummary, previewPayCents, workerPayContext, workerRateCents } from "../services/payout.service.js";
import { requiredDocumentsVerified } from "./worker-document.controller.js"; // [E]
import { isPaused } from "../services/reliability.service.js";
import { keys, removeStoredKeys, storeBytes } from "../services/file-store.service.js";

const LOCKED_STATUSES = ["invited", "rejected", "suspended"];

const assertEditable = (worker, res) => {
  if (!worker.emailVerified) {
    res.status(403).json({ success: false, message: "Please verify your email first." });
    return false;
  }
  if (LOCKED_STATUSES.includes(worker.workerStatus)) {
    res.status(403).json({ success: false, message: "Your worker account cannot be updated at this stage." });
    return false;
  }
  return true;
};

const profileComplete = (worker) =>
  Boolean(worker.workerProfile?.address) && (worker.workerProfile?.serviceAreas?.length ?? 0) > 0;

const holidayOut = (h) => ({
  id: h._id,
  from: h.from.toISOString().slice(0, 10),
  to: h.to.toISOString().slice(0, 10),
  note: h.note,
});

// GET /api/v1/worker/me – everything the cleaner portal needs
export const getWorkerOverview = async (req, res, next) => {
  try {
    const worker = req.user;
    const approved = worker.workerStatus === "approved";

    const checklist = {
      emailVerified: Boolean(worker.emailVerified),
      profileComplete: profileComplete(worker),
      bankDetailsComplete: Boolean(worker.bankAccountLast4 && worker.bankAccountHolder),
      documentsVerified: requiredDocumentsVerified(worker), // package E
    };

    const today = todayInBerlin();
    const [stats, earnings, upcomingCount] = approved
      ? await Promise.all([
          getWorkerStats(worker._id),
          earningsSummary(worker._id),
          Booking.countDocuments({
            assignedWorker: worker._id,
            preferredDate: { $gte: today },
            status: { $in: ["confirmed", "in_progress"] },
          }),
        ])
      : [null, null, 0];

    res.json({
      success: true,
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        workerStatus: worker.workerStatus,
        workerProfile: worker.workerProfile,
        avatarUrl: avatarUrl(worker),
        availability: worker.availability ?? [],
        availabilitySettings: availabilityView(worker),
        matching: matchingView(worker),
        holidays: (worker.holidays ?? []).filter((h) => h.to >= today).map(holidayOut),
        payRateCents: workerRateCents(worker),
        bankDetails: {
          accountHolder: worker.bankAccountHolder || "",
          iban: worker.bankAccountLast4 ? `•••• •••• •••• ${worker.bankAccountLast4}` : "Not provided",
        },
        payoutMethod: {
          type: worker.payoutMethod?.type ?? "bank",
          paypalEmail: worker.payoutMethod?.paypalEmail ?? "",
        },
        reviewNote: worker.workerStatus === "rejected" ? worker.workerReview?.note : "",
        memberSince: worker.createdAt,
      },
      checklist,
      canAccessJobs: approved,
      paused: isPaused(worker), // reliability pause (package E)
      assignmentMode: assignmentMode(),
      // Auto mode: without a weekly pattern (or home postcode) no jobs can be assigned
      availabilityPrompt: assignmentMode() === "auto" && approved
        ? !hasWeeklyPattern(worker) ? "no_pattern" : !homePostcodeOf(worker) ? "no_location" : null
        : null,
      newAssignments: approved
        ? await Booking.countDocuments({ assignedWorker: worker._id, status: "confirmed", preferredDate: { $gte: today }, "assignment.workerSeenAt": null })
        : 0,
      stats,
      earnings,
      upcomingCount,
      options: { specialties: WORKER_SPECIALTIES, languages: WORKER_LANGUAGES },
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/worker/profile
export const saveWorkerProfile = async (req, res, next) => {
  try {
    const data = z
      .object({
        address: z.string().trim().min(5).max(250),
        serviceAreas: z.array(z.string().trim().min(2).max(100)).min(1).max(30),
        experienceYears: z.coerce.number().min(0).max(60),
        bio: z.string().trim().max(600).optional(),
        languages: z.array(z.enum(WORKER_LANGUAGES)).max(12).optional(),
        specialties: z.array(z.enum(WORKER_SPECIALTIES)).max(WORKER_SPECIALTIES.length).optional(),
        petsOk: z.boolean().optional(),
        bringsSupplies: z.boolean().optional(),
        publicVisible: z.boolean().optional(),
      })
      .parse(req.body);

    const worker = await User.findById(req.user._id);
    if (!worker || worker.role !== "worker") {
      return res.status(403).json({ success: false, message: "Worker account required." });
    }
    if (!assertEditable(worker, res)) return;

    const current = worker.workerProfile?.toObject?.() ?? {};
    worker.workerProfile = {
      ...current,
      address: data.address,
      serviceAreas: [...new Set(data.serviceAreas)],
      experienceYears: data.experienceYears,
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(data.languages && { languages: [...new Set(data.languages)] }),
      ...(data.specialties && { specialties: [...new Set(data.specialties)] }),
      ...(data.petsOk !== undefined && { petsOk: data.petsOk }),
      ...(data.bringsSupplies !== undefined && { bringsSupplies: data.bringsSupplies }),
      ...(data.publicVisible !== undefined && { publicVisible: data.publicVisible }),
    };
    await worker.save();

    return res.json({ success: true, message: "Worker profile saved.", workerProfile: worker.workerProfile });
  } catch (error) {
    next(error);
  }
};

// Magic bytes – never trust the declared content type
const detectImageType = (buf) => {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
};

const MAX_AVATAR_BYTES = 400 * 1024;

// PUT /api/v1/worker/avatar  { image: "data:image/jpeg;base64,..." }
export const uploadAvatar = async (req, res, next) => {
  try {
    const { image } = z.object({ image: z.string().max(600_000) }).parse(req.body);
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if (!match) {
      return res.status(422).json({ success: false, message: "Please upload a JPG, PNG or WebP image." });
    }
    const buf = Buffer.from(match[2], "base64");
    const type = detectImageType(buf);
    if (!type) return res.status(422).json({ success: false, message: "Please upload a JPG, PNG or WebP image." });
    if (buf.length > MAX_AVATAR_BYTES) {
      return res.status(413).json({ success: false, message: "The image is too large (max. 400 KB)." });
    }

    const worker = await User.findById(req.user._id);
    if (!assertEditable(worker, res)) return;
    const previousKey = worker.avatarKey;
    const now = new Date();
    const stored = await storeBytes(keys.avatar(worker._id, now.getTime(), type), buf, type);
    if (stored.storageKey) {
      worker.avatarKey = stored.storageKey;
      worker.avatarData = undefined;
    } else {
      worker.avatarKey = "";
      worker.avatarData = buf;
    }
    worker.avatarType = type;
    worker.avatarUpdatedAt = now;
    await worker.save();
    if (previousKey && previousKey !== worker.avatarKey) await removeStoredKeys([previousKey], "avatar.replaced");

    return res.json({ success: true, message: "Photo saved.", avatarUrl: avatarUrl(worker) });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/worker/avatar
export const deleteAvatar = async (req, res, next) => {
  try {
    const before = await User.findById(req.user._id).select("avatarKey").lean();
    await User.updateOne(
      { _id: req.user._id },
      { $unset: { avatarData: 1 }, $set: { avatarKey: "", avatarType: "", avatarUpdatedAt: null } }
    );
    await removeStoredKeys([before?.avatarKey], "avatar.deleted");
    return res.json({ success: true, message: "Photo removed.", avatarUrl: null });
  } catch (error) {
    next(error);
  }
};

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const overrideOut = (o) => ({ date: new Date(o.date).toISOString().slice(0, 10), kind: o.kind, start: o.start || "", end: o.end || "", note: o.note || "" });

/** Everything the availability page needs (also part of GET /worker/me) */
const availabilityView = (worker) => {
  const today = todayInBerlin();
  return {
    weekly: (worker.availability ?? []).map((w) => ({ weekday: w.weekday, start: w.start, end: w.end, weeks: w.weeks ?? "all" })),
    overrides: (worker.availabilityOverrides ?? []).filter((o) => new Date(o.date) >= today).map(overrideOut),
    workload: {
      maxJobsPerDay: worker.workload?.maxJobsPerDay ?? null,
      maxHoursPerDay: worker.workload?.maxHoursPerDay ?? null,
      maxJobsPerWeek: worker.workload?.maxJobsPerWeek ?? null,
      maxHoursPerWeek: worker.workload?.maxHoursPerWeek ?? null,
    },
    hasWeeklyPattern: hasWeeklyPattern(worker),
    currentWeek: weekParity(today), // "A" | "B" (alternating weeks)
    assignmentMode: assignmentMode(),
  };
};

const matchingView = (worker) => ({
  homePostcode: worker.workerProfile?.homePostcode || "",
  effectivePostcode: homePostcodeOf(worker),
  maxTravelKm: worker.workerProfile?.maxTravelKm ?? 10,
  excludedServices: worker.workerProfile?.excludedServices ?? [],
  excludedExtras: worker.workerProfile?.excludedExtras ?? [],
  options: {
    services: SERVICES.map((x) => ({ id: x.id, name: x.name, nameEn: x.nameEn })),
    extras: EXTRAS.map((x) => ({ id: x.id, label: x.label, labelEn: x.labelEn })),
  },
});

const weeklySchema = z
  .array(
    z
      .object({
        weekday: z.number().int().min(1).max(7),
        start: z.string().regex(timeRe),
        end: z.string().regex(timeRe),
        weeks: z.enum(["all", "A", "B"]).optional().default("all"),
      })
      .refine((w) => w.start < w.end, "End must be after start.")
  )
  .max(42);

const overrideSchema = z
  .array(
    z
      .object({
        date: z.string(),
        kind: z.enum(["off", "extra"]),
        start: z.string().regex(timeRe).optional(),
        end: z.string().regex(timeRe).optional(),
        note: z.string().trim().max(200).optional().default(""),
      })
      .refine((o) => o.kind === "off" || (o.start && o.end && o.start < o.end), "Extra hours need a start before the end.")
  )
  .max(120);

const limit = (max) => z.number().int().min(1).max(max).nullable();
const workloadSchema = z.object({
  maxJobsPerDay: limit(10),
  maxHoursPerDay: limit(14),
  maxJobsPerWeek: limit(50),
  maxHoursPerWeek: limit(70),
});

// GET /api/v1/worker/availability
export const getAvailability = async (req, res) => res.json({ success: true, settings: availabilityView(req.user), matching: matchingView(req.user) });

// PUT /api/v1/worker/availability
//   { weekly?: [{ weekday, start, end, weeks? }], overrides?: [{ date, kind, start?, end?, note? }], workload? }
// Changes take effect immediately: the slot cache is cleared on save.
export const setAvailability = async (req, res, next) => {
  try {
    const data = z.object({ weekly: weeklySchema.optional(), overrides: overrideSchema.optional(), workload: workloadSchema.optional() }).parse(req.body);

    const worker = await User.findById(req.user._id);
    if (!assertEditable(worker, res)) return;
    if (data.weekly) worker.availability = [...data.weekly].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
    if (data.overrides) {
      const today = todayInBerlin();
      const byDay = new Map();
      for (const o of data.overrides) {
        const date = parseCalendarDate(o.date);
        if (!date) return res.status(422).json({ success: false, message: `Invalid date: ${o.date}` });
        if (date < today) continue; // past days are dropped
        byDay.set(date.getTime(), { date, kind: o.kind, start: o.kind === "extra" ? o.start : "", end: o.kind === "extra" ? o.end : "", note: o.note });
      }
      worker.availabilityOverrides = [...byDay.values()].sort((a, b) => a.date - b.date);
    }
    if (data.workload) worker.workload = data.workload;
    await worker.save();
    bumpAvailability();
    return res.json({ success: true, message: "Availability saved.", availability: worker.availability, settings: availabilityView(worker) });
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/worker/matching-profile { homePostcode, maxTravelKm, excludedServices, excludedExtras }
// Location (home postcode + travel radius) and skills used by the automatic assignment
export const setMatchingProfile = async (req, res, next) => {
  try {
    const data = z
      .object({
        homePostcode: z.union([z.string().trim().regex(/^1[0-4]\d{3}$/, "Please enter a Berlin postcode."), z.literal("")]),
        maxTravelKm: z.number().int().min(1).max(40),
        excludedServices: z.array(z.enum(SERVICE_IDS)).max(SERVICE_IDS.length).default([]),
        excludedExtras: z.array(z.enum(EXTRA_IDS)).max(EXTRA_IDS.length).default([]),
      })
      .parse(req.body);
    const worker = await User.findById(req.user._id);
    if (!assertEditable(worker, res)) return;
    worker.set("workerProfile.homePostcode", data.homePostcode);
    worker.set("workerProfile.maxTravelKm", data.maxTravelKm);
    worker.set("workerProfile.excludedServices", [...new Set(data.excludedServices)]);
    worker.set("workerProfile.excludedExtras", [...new Set(data.excludedExtras)]);
    await worker.save();
    bumpAvailability();
    return res.json({ success: true, message: "Saved.", matching: matchingView(worker) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/holidays  { from, to, note? }
export const addHoliday = async (req, res, next) => {
  try {
    const data = z
      .object({
        from: z.string(),
        to: z.string(),
        note: z.string().trim().max(200).optional().default(""),
      })
      .parse(req.body);

    const from = parseCalendarDate(data.from);
    const to = parseCalendarDate(data.to);
    if (!from || !to || to < from) {
      return res.status(422).json({ success: false, message: "Please choose a valid period." });
    }
    if (from < todayInBerlin()) {
      return res.status(422).json({ success: false, message: "Holidays cannot start in the past." });
    }
    if (to.getTime() - from.getTime() > 120 * DAY_MS) {
      return res.status(422).json({ success: false, message: "A holiday can be at most 120 days long." });
    }

    // Jobs already accepted in that period must be handed back first
    const clash = await Booking.findOne({
      assignedWorker: req.user._id,
      status: { $in: ["confirmed", "in_progress"] },
      preferredDate: { $gte: from, $lte: to },
    }).select("reference preferredDate");
    if (clash) {
      return res.status(409).json({
        success: false,
        message: `You have job ${clash.reference} in this period. Please hand it back or contact the office first.`,
      });
    }

    const worker = await User.findById(req.user._id);
    if (!assertEditable(worker, res)) return;
    worker.holidays.push({ from, to, note: data.note });
    worker.holidays = worker.holidays.filter((h) => h.to >= todayInBerlin()).sort((a, b) => a.from - b.from);
    await worker.save();
    bumpAvailability();
    return res.status(201).json({ success: true, message: "Holiday saved.", holidays: worker.holidays.map(holidayOut) });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/worker/holidays/:holidayId
export const deleteHoliday = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.holidayId)) {
      return res.status(400).json({ success: false, message: "Invalid ID." });
    }
    const worker = await User.findById(req.user._id);
    const before = worker.holidays.length;
    worker.holidays = worker.holidays.filter((h) => String(h._id) !== req.params.holidayId);
    if (worker.holidays.length === before) {
      return res.status(404).json({ success: false, message: "Holiday not found." });
    }
    await worker.save();
    bumpAvailability();
    return res.json({ success: true, message: "Holiday removed.", holidays: worker.holidays.map(holidayOut) });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/worker/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD (max. 62 days)
export const getCalendar = async (req, res, next) => {
  try {
    const from = parseCalendarDate(req.query.from) ?? todayInBerlin();
    let to = parseCalendarDate(req.query.to) ?? new Date(from.getTime() + 41 * DAY_MS);
    if (to < from) to = from;
    if (to.getTime() - from.getTime() > 62 * DAY_MS) to = new Date(from.getTime() + 62 * DAY_MS);

    const jobs = await Booking.find({
      assignedWorker: req.user._id,
      preferredDate: { $gte: from, $lte: to },
      status: { $in: ["confirmed", "in_progress", "completed"] },
    })
      .select("reference serviceId preferredDate slot slotEnd status estimate.durationMinutes customerDetails.postcode payment.method")
      .sort({ preferredDate: 1, slot: 1 })
      .lean();

    return res.json({
      success: true,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      jobs: jobs.map((j) => ({
        _id: j._id,
        reference: j.reference,
        serviceId: j.serviceId,
        date: j.preferredDate.toISOString().slice(0, 10),
        slot: j.slot,
        slotEnd: j.slotEnd,
        status: j.status,
        durationMinutes: j.estimate?.durationMinutes ?? null,
        postcode: j.customerDetails?.postcode,
        cash: j.payment?.method === "cash",
      })),
      holidays: (req.user.holidays ?? []).filter((h) => h.to >= from && h.from <= to).map(holidayOut),
      availability: req.user.availability ?? [],
      overrides: (req.user.availabilityOverrides ?? []).filter((o) => o.date >= from && o.date <= to).map(overrideOut),
      // Week A/B of each Monday in the range (alternating-week patterns)
      weeks: Object.fromEntries(
        Array.from({ length: Math.ceil((to.getTime() - from.getTime()) / DAY_MS) + 1 }, (_, i) => new Date(from.getTime() + i * DAY_MS))
          .map((d) => [d.toISOString().slice(0, 10), weekParity(d)])
      ),
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/worker/earnings – per-job pay, payout status, payouts
export const getEarnings = async (req, res, next) => {
  try {
    const [summary, jobs, payouts, payCtx] = await Promise.all([
      earningsSummary(req.user._id),
      Booking.find({ assignedWorker: req.user._id, "workerPayout.status": { $exists: true } })
        .select("reference serviceId preferredDate slot slotEnd workerPayout")
        .sort({ "workerPayout.earnedAt": -1 })
        .limit(200)
        .lean(),
      Payout.find({ worker: req.user._id })
        .select("reference amountCents bookings paidAt bankAccountLast4 note status provider failureReason")
        .sort({ paidAt: -1 })
        .limit(50)
        .lean(),
      workerPayContext(req.user),
    ]);

    // What the cleaner actually earns NOW – same formula as recordWorkerEarning
    // (commission model: job price × (100 − commission %)). perHourCents is the
    // pay for one hour at the current customer hourly price.
    const customerHourlyCents = PRICING.hourlyRateCents;
    const payModel = {
      basis: payCtx.basis,
      commissionPct: payCtx.basis === "commission" ? payCtx.commissionPct : null,
      sharePct: payCtx.basis === "commission" ? 100 - payCtx.commissionPct : null,
      customerHourlyCents,
      perHourCents: previewPayCents(payCtx, { grossCents: customerHourlyCents, minutes: 60 }),
    };

    return res.json({
      success: true,
      summary: { ...summary, rateCents: workerRateCents(req.user), defaultRateCents: WORKER_PAY.hourlyRateCents, payModel },
      bank: {
        accountHolder: req.user.bankAccountHolder || "",
        iban: req.user.bankAccountLast4 ? `•••• •••• •••• ${req.user.bankAccountLast4}` : null,
      },
      payoutMethod: {
        type: req.user.payoutMethod?.type ?? "bank",
        paypalEmail: req.user.payoutMethod?.paypalEmail ?? "",
      },
      jobs: jobs.map((j) => ({
        _id: j._id,
        reference: j.reference,
        serviceId: j.serviceId,
        date: j.preferredDate,
        slot: j.slot,
        slotEnd: j.slotEnd ?? "",
        amountCents: j.workerPayout.amountCents,
        cashHeldCents: j.workerPayout.cashHeldCents ?? 0,
        netCents: (j.workerPayout.amountCents ?? 0) - (j.workerPayout.cashHeldCents ?? 0),
        minutes: j.workerPayout.minutes,
        rateCents: j.workerPayout.rateCents,
        basis: j.workerPayout.basis ?? "hourly",
        grossCents: j.workerPayout.grossCents ?? null,
        commissionPct: j.workerPayout.commissionPct ?? null,
        commissionCents: j.workerPayout.commissionCents ?? null,
        earnedAt: j.workerPayout.earnedAt,
        dueAt: j.workerPayout.dueAt,
        paidAt: j.workerPayout.paidAt ?? null,
        status: displayPayoutStatus(j.workerPayout), // pending | due | on_hold | paid
      })),
      payouts: payouts.map((p) => ({
        ...p,
        status: p.status ?? "paid", // records from before the status field
        jobCount: p.bookings.length,
        bookings: undefined,
      })),
    });
  } catch (error) {
    next(error);
  }
};
