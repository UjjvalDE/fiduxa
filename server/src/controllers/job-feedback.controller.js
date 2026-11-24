// Post-service feedback pop-ups (customer + cleaner) and the admin evaluation.
import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import { WORKER_CONDITION_TAGS, WORKER_DIFFICULTY_TAGS } from "../models/job-feedback.model.js";
import {
  dismissFeedback,
  feedbackCsv,
  feedbackSummary,
  pendingCustomerFeedback,
  pendingWorkerFeedback,
  saveWorkerFeedback,
} from "../services/job-feedback.service.js";
import { parseCalendarDate, DAY_MS } from "../utils/helpers.js";
import { sendAdminNotificationEmail, trySend } from "../services/email.service.js";

const score = z.number().int().min(1).max(5);

const loadBooking = async (req, res, owner) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ success: false, message: "Booking not found." });
    return null;
  }
  const booking = await Booking.findOne({ _id: req.params.id, [owner]: req.user._id });
  if (!booking) res.status(404).json({ success: false, message: "Booking not found." });
  return booking;
};

// GET /api/v1/customer/bookings/feedback/pending
export const getMyPendingFeedback = async (req, res, next) => {
  try {
    return res.json({ success: true, pending: await pendingCustomerFeedback(req.user._id) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/customer/bookings/:id/feedback/dismiss
export const dismissMyFeedback = async (req, res, next) => {
  try {
    const booking = await loadBooking(req, res, "customer");
    if (!booking) return;
    await dismissFeedback(booking, "customer");
    return res.json({ success: true, message: "Feedback reminder dismissed." });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/worker/jobs/feedback/pending
export const getWorkerPendingFeedback = async (req, res, next) => {
  try {
    return res.json({ success: true, pending: await pendingWorkerFeedback(req.user._id) });
  } catch (error) {
    next(error);
  }
};

const workerFeedbackSchema = z
  .object({
    experience: score,
    customerRating: score,
    homeCondition: score,
    cooperative: score,
    hadDifficulties: z.boolean(),
    difficultyTags: z.array(z.enum(WORKER_DIFFICULTY_TAGS)).max(WORKER_DIFFICULTY_TAGS.length).optional().default([]),
    difficultyText: z.string().trim().max(1000).optional().default(""),
    conditionTags: z.array(z.enum(WORKER_CONDITION_TAGS)).max(WORKER_CONDITION_TAGS.length).optional().default([]),
    conditionText: z.string().trim().max(1000).optional().default(""),
    jobDifficulty: score,
  })
  .strict();

// POST /api/v1/worker/jobs/:id/feedback  – INTERNAL, never shown to the customer
export const submitWorkerFeedback = async (req, res, next) => {
  try {
    const data = workerFeedbackSchema.parse(req.body ?? {});
    const booking = await loadBooking(req, res, "assignedWorker");
    if (!booking) return;
    const answers = {
      ...data,
      difficultyTags: data.hadDifficulties && data.difficultyTags.length ? [...new Set(data.difficultyTags)] : undefined,
      difficultyText: data.hadDifficulties ? data.difficultyText || undefined : undefined,
      conditionTags: data.conditionTags.length ? [...new Set(data.conditionTags)] : undefined,
      conditionText: data.conditionText || undefined,
    };
    const feedback = await saveWorkerFeedback(booking, answers);
    if (data.customerRating <= 2 || data.cooperative <= 2 || answers.conditionTags?.includes("safety") || answers.difficultyTags?.includes("safety")) {
      await trySend("Admin notification", () =>
        sendAdminNotificationEmail({
          subject: `Kritisches Feedback der Reinigungskraft: ${booking.reference}`,
          lines: [
            `Kundenbewertung: ${data.customerRating}/5 · Kooperation: ${data.cooperative}/5`,
            `Schwierigkeiten: ${(answers.difficultyTags ?? []).join(", ") || "-"}`,
            "Interne Information – nicht an den Kunden weitergeben.",
          ],
        })
      );
    }
    return res.status(201).json({ success: true, message: "Thank you for your feedback.", feedbackId: feedback._id });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/jobs/:id/feedback/dismiss
export const dismissWorkerFeedback = async (req, res, next) => {
  try {
    const booking = await loadBooking(req, res, "assignedWorker");
    if (!booking) return;
    await dismissFeedback(booking, "worker");
    return res.json({ success: true, message: "Feedback reminder dismissed." });
  } catch (error) {
    next(error);
  }
};

const parseRange = (query) => {
  const from = query.from ? parseCalendarDate(String(query.from)) : null;
  const toDay = query.to ? parseCalendarDate(String(query.to)) : null;
  return { from: from ?? undefined, to: toDay ? new Date(toDay.getTime() + DAY_MS) : undefined };
};

// GET /api/v1/admin/feedback?from=YYYY-MM-DD&to=YYYY-MM-DD
export const adminFeedbackSummary = async (req, res, next) => {
  try {
    return res.json({ success: true, ...(await feedbackSummary(parseRange(req.query))) });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/feedback/export.csv
export const adminFeedbackCsv = async (req, res, next) => {
  try {
    const csv = await feedbackCsv(parseRange(req.query));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="fiduxa-feedback-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(csv);
  } catch (error) {
    next(error);
  }
};
