// Recurring cleaning plans ("Mein Putzplan"): customer self-service and admin management.
import mongoose from "mongoose";
import { z } from "zod";

import BookingSeries from "../models/booking-series.model.js";
import User from "../models/user.model.js";
import { recordAudit } from "../services/audit.service.js";
import { sendAdminNotificationEmail, trySend } from "../services/email.service.js";
import {
  endSeries,
  pauseSeries,
  resumeSeries,
  seriesView,
  skipOccurrence,
} from "../services/recurring-series.service.js";

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please provide a valid date (YYYY-MM-DD).");

const actionSchema = z.object({
  action: z.enum(["pause", "resume", "end"]),
  pausedUntil: calendarDay.optional(),
});

const findOwnSeries = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid cleaning plan ID." });
    return null;
  }
  const series = await BookingSeries.findOne({ _id: req.params.id, customer: req.user._id }).populate("preferredWorker", "name");
  if (!series) {
    res.status(404).json({ success: false, message: "Cleaning plan not found." });
    return null;
  }
  return series;
};

const ACTION_MESSAGES = {
  pause: "Your cleaning plan is paused.",
  resume: "Your cleaning plan continues.",
  end: "Your cleaning plan has ended.",
};

/** Apply pause / resume / end to a series (shared by customer and admin) */
const applyAction = async (series, { action, pausedUntil }, { actorId, byAdmin }) => {
  if (action === "pause") return pauseSeries(series, { pausedUntil, actorId, byAdmin });
  if (action === "resume") {
    await resumeSeries(series);
    return { cancelled: [], kept: [] };
  }
  return endSeries(series, { actorId, byAdmin });
};

// GET /api/v1/customer/series
export const listMySeries = async (req, res, next) => {
  try {
    const list = await BookingSeries.find({ customer: req.user._id }).populate("preferredWorker", "name").sort({ status: 1, nextDate: 1 });
    const series = await Promise.all(list.map((s) => seriesView(s)));
    return res.json({ success: true, count: series.length, series });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/customer/series/:id
export const getMySeries = async (req, res, next) => {
  try {
    const series = await findOwnSeries(req, res);
    if (!series) return;
    return res.json({ success: true, series: await seriesView(series) });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/customer/series/:id  { action: pause | resume | end, pausedUntil? }
export const updateMySeries = async (req, res, next) => {
  try {
    const data = actionSchema.parse(req.body ?? {});
    const series = await findOwnSeries(req, res);
    if (!series) return;

    const { cancelled, kept } = await applyAction(series, data, { actorId: req.user._id, byAdmin: false });

    if (data.action !== "resume") {
      await trySend("Admin notification", () =>
        sendAdminNotificationEmail({
          subject: `Putzplan ${data.action === "end" ? "beendet" : "pausiert"}: ${series.template.customerDetails.name}`,
          lines: [
            `Kunde: ${series.template.customerDetails.name} (${series.template.customerDetails.email})`,
            `Plan: ${series.template.frequency}, ${series.template.startTime} Uhr`,
            data.pausedUntil ? `Pausiert bis: ${data.pausedUntil}` : "",
            cancelled.length ? `Storniert: ${cancelled.join(", ")}` : "",
            kept.length ? `Bleiben bestehen (Stornofrist vorbei): ${kept.join(", ")}` : "",
          ].filter(Boolean),
        })
      );
    }

    return res.json({
      success: true,
      message: ACTION_MESSAGES[data.action],
      cancelled,
      kept,
      series: await seriesView(series),
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/customer/series/:id/skip  { date? }
export const skipMyOccurrence = async (req, res, next) => {
  try {
    const { date } = z.object({ date: calendarDay.optional() }).parse(req.body ?? {});
    const series = await findOwnSeries(req, res);
    if (!series) return;

    const result = await skipOccurrence(series, { date, actorId: req.user._id });

    return res.json({
      success: true,
      message: "This cleaning is skipped.",
      skippedDate: result.skippedDate,
      cancelledReference: result.cancelledReference,
      nextDate: result.nextDate,
      series: await seriesView(series),
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

// GET /api/v1/admin/series?status=active|paused|ended
export const adminListSeries = async (req, res, next) => {
  try {
    const filter = {};
    if (["active", "paused", "ended"].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.customer && mongoose.isValidObjectId(req.query.customer)) filter.customer = req.query.customer;
    const list = await BookingSeries.find(filter)
      .populate("customer", "name email")
      .populate("preferredWorker", "name")
      .sort({ status: 1, nextDate: 1 })
      .limit(300);
    const series = await Promise.all(list.map((s) => seriesView(s, { admin: true })));
    return res.json({ success: true, count: series.length, series });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/series/:id  { action?: pause|resume|end, pausedUntil?, preferredWorker?: id | null }
export const adminUpdateSeries = async (req, res, next) => {
  try {
    const data = z
      .object({
        action: z.enum(["pause", "resume", "end"]).optional(),
        pausedUntil: calendarDay.optional(),
        preferredWorker: z.string().nullable().optional(),
      })
      .refine((d) => d.action !== undefined || d.preferredWorker !== undefined, "Nothing to change.")
      .parse(req.body ?? {});
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid cleaning plan ID." });
    }
    const series = await BookingSeries.findById(req.params.id).populate("customer", "name email");
    if (!series) return res.status(404).json({ success: false, message: "Cleaning plan not found." });

    const before = { status: series.status, pausedUntil: series.pausedUntil, preferredWorker: series.preferredWorker };
    let cancelled = [];
    let kept = [];

    if (data.preferredWorker !== undefined) {
      if (data.preferredWorker === null) {
        series.preferredWorker = null;
      } else {
        if (!mongoose.isValidObjectId(data.preferredWorker)) {
          return res.status(400).json({ success: false, message: "Invalid worker ID." });
        }
        const worker = await User.findOne({ _id: data.preferredWorker, role: "worker" }).select("_id");
        if (!worker) return res.status(404).json({ success: false, message: "Worker not found." });
        series.preferredWorker = worker._id;
      }
      await series.save();
    }
    if (data.action) {
      ({ cancelled, kept } = await applyAction(series, data, { actorId: req.user._id, byAdmin: true }));
    }

    await recordAudit({
      actor: req.user._id,
      action: data.action ? `series.${data.action}` : "series.preferred_worker",
      entityType: "BookingSeries",
      entityId: series._id,
      before,
      after: { ...data, cancelled, kept },
    });

    await series.populate("preferredWorker", "name");
    return res.json({
      success: true,
      message: data.action ? `Cleaning plan ${data.action === "pause" ? "paused" : data.action === "resume" ? "resumed" : "ended"}.` : "Preferred cleaner updated.",
      cancelled,
      kept,
      series: await seriesView(series, { admin: true }),
    });
  } catch (error) {
    next(error);
  }
};
