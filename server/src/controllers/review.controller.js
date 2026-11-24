import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import Review from "../models/review.model.js";
import { DAY_MS } from "../utils/helpers.js";
import { sendAdminNotificationEmail, trySend } from "../services/email.service.js";
import { recordAudit } from "../services/audit.service.js";

const REVIEW_WINDOW_DAYS = 60;

export const reviewWindowOpen = (booking) =>
  booking.status === "completed" &&
  Boolean(booking.assignedWorker) &&
  Date.now() - new Date(booking.job?.completedAt ?? booking.updatedAt).getTime() <= REVIEW_WINDOW_DAYS * DAY_MS;

const score = z.number().int().min(1).max(5);

// POST /api/v1/customer/bookings/:id/review
export const createReview = async (req, res, next) => {
  try {
    const data = z
      .object({
        rating: score,
        punctuality: score.optional(),
        quality: score.optional(),
        friendliness: score.optional(),
        comment: z.string().trim().max(1000).optional().default(""),
      })
      .parse(req.body);

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid booking ID." });
    }
    const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id });
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });

    if (!reviewWindowOpen(booking)) {
      return res.status(409).json({
        success: false,
        message: `Completed cleanings can be rated within ${REVIEW_WINDOW_DAYS} days.`,
      });
    }

    const review = await Review.create({
      booking: booking._id,
      customer: req.user._id,
      worker: booking.assignedWorker,
      ...data,
    }).catch((error) => {
      if (error.code === 11000) {
        throw Object.assign(new Error("You have already rated this cleaning."), { statusCode: 409 });
      }
      throw error;
    });

    if (data.rating <= 2) {
      await trySend("Admin notification", () =>
        sendAdminNotificationEmail({
          subject: `Schlechte Bewertung (${data.rating}/5): ${booking.reference}`,
          lines: [`Referenz: ${booking.reference}`, `Kommentar: ${data.comment || "-"}`, "Bitte Kontakt mit dem Kunden aufnehmen."],
        })
      );
    }

    return res.status(201).json({ success: true, message: "Thank you for your rating.", review });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/reviews?worker=&page=
export const listReviews = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.worker && mongoose.isValidObjectId(req.query.worker)) filter.worker = req.query.worker;
    const reviews = await Review.find(filter)
      .populate("customer", "name email")
      .populate("worker", "name")
      .populate("booking", "reference preferredDate")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return res.json({ success: true, reviews });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/reviews/:id  { hidden }
export const setReviewHidden = async (req, res, next) => {
  try {
    const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid review ID." });
    }
    const review = await Review.findByIdAndUpdate(req.params.id, { hidden }, { returnDocument: "after" });
    if (!review) return res.status(404).json({ success: false, message: "Review not found." });
    await recordAudit({
      actor: req.user._id,
      action: hidden ? "review.hidden" : "review.shown",
      entityType: "Review",
      entityId: review._id,
    });
    return res.json({ success: true, review });
  } catch (error) {
    next(error);
  }
};
