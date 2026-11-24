import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import Review from "../models/review.model.js";
import { DAY_MS } from "../utils/helpers.js";
import { sendAdminNotificationEmail, trySend } from "../services/email.service.js";
import { recordAudit } from "../services/audit.service.js";
import { refreshWorkerTier } from "../services/commission.service.js";
import { flagDurationMismatch } from "../services/feedback.service.js";
import User from "../models/user.model.js";
import BookingSeries from "../models/booking-series.model.js";

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
        // Follow-up questions ("How was your cleaning?")
        recommend: z.boolean().optional(),
        actualDurationMinutes: z.number().int().min(15).max(1440).optional(),
        // Recurring bookings: who should clean next time?
        keepCleaner: z.enum(["same", "different", "auto"]).optional(),
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

    const { actualDurationMinutes, keepCleaner, ...reviewData } = data;
    const review = await Review.create({
      booking: booking._id,
      customer: req.user._id,
      worker: booking.assignedWorker,
      ...reviewData,
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

    // Customer-reported actual duration + duration-mismatch review flag
    if (actualDurationMinutes !== undefined) {
      booking.set("feedback.customer.actualDurationMinutes", actualDurationMinutes);
      booking.set("feedback.customer.submittedAt", new Date());
      await flagDurationMismatch(booking);
    }
    if (data.recommend !== undefined) {
      booking.set("feedback.customer.recommend", data.recommend);
      booking.set("feedback.customer.submittedAt", new Date());
    }
    // Recurring customers: remember who should clean next time
    if (keepCleaner && booking.frequency !== "one-time") {
      booking.set("feedback.customer.keepCleaner", keepCleaner);
      await User.updateOne(
        { _id: req.user._id },
        {
          $set: {
            recurringCleanerPreference: {
              choice: keepCleaner,
              worker: keepCleaner === "same" ? booking.assignedWorker : null,
              at: new Date(),
            },
          },
        }
      );
      // Recurring plan: the preferred cleaner gets every new occurrence first
      if (booking.series) {
        await BookingSeries.updateOne(
          { _id: booking.series, customer: req.user._id },
          { $set: { preferredWorker: keepCleaner === "same" ? booking.assignedWorker : null } }
        );
      }
    }
    if (booking.isModified()) await booking.save();

    // A new verified review can change the cleaner's commission tier
    await refreshWorkerTier(booking.assignedWorker, { reason: "review_created" });

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
    if (req.query.disputed === "1" || req.query.disputed === "true") filter["dispute.status"] = "open";
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
    // Hiding/unhiding changes the verified-review set → commission eligibility
    await refreshWorkerTier(review.worker, { reason: hidden ? "review_hidden" : "review_unhidden" });
    return res.json({ success: true, review });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/reviews/:id/dispute  { message } – cleaner contests a review
export const disputeReview = async (req, res, next) => {
  try {
    const { message } = z.object({ message: z.string().trim().min(10).max(1000) }).parse(req.body);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid review ID." });
    }
    const review = await Review.findOne({ _id: req.params.id, worker: req.user._id });
    if (!review) return res.status(404).json({ success: false, message: "Review not found." });
    if (review.dispute?.status) {
      return res.status(409).json({ success: false, message: "This review has already been disputed." });
    }
    review.dispute = { status: "open", message, openedAt: new Date() };
    await review.save();
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Bewertung angefochten (${review.rating}/5)`,
        lines: [`Reinigungskraft: ${req.user.name}`, `Begründung: ${message}`, "Bitte im Adminbereich prüfen."],
      })
    );
    return res.status(201).json({ success: true, message: "The review has been sent to the office for checking.", review });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/worker/reviews – the cleaner's own reviews (incl. hidden ones, marked)
export const listMyReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ worker: req.user._id })
      .populate("booking", "reference preferredDate")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return res.json({
      success: true,
      reviews: reviews.map((r) => ({
        _id: r._id,
        rating: r.rating,
        comment: r.comment,
        hidden: r.hidden,
        dispute: r.dispute?.status ? { status: r.dispute.status, message: r.dispute.message, adminNote: r.dispute.adminNote ?? "" } : null,
        booking: r.booking ? { reference: r.booking.reference, preferredDate: r.booking.preferredDate } : null,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/reviews/:id/dispute  { resolution: "approved"|"rejected", note? }
// approved = complaint upheld → the review is hidden and stops counting.
export const resolveReviewDispute = async (req, res, next) => {
  try {
    const { resolution, note } = z
      .object({ resolution: z.enum(["approved", "rejected"]), note: z.string().trim().max(500).optional().default("") })
      .parse(req.body);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid review ID." });
    }
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: "Review not found." });
    if (review.dispute?.status !== "open") {
      return res.status(409).json({ success: false, message: "There is no open dispute for this review." });
    }
    review.set("dispute.status", resolution);
    review.set("dispute.resolvedAt", new Date());
    review.set("dispute.adminNote", note);
    if (resolution === "approved") review.hidden = true;
    await review.save();
    await recordAudit({
      actor: req.user._id,
      action: `review.dispute_${resolution}`,
      entityType: "Review",
      entityId: review._id,
      after: { note },
    });
    await refreshWorkerTier(review.worker, { reason: `dispute_${resolution}` });
    return res.json({ success: true, review });
  } catch (error) {
    next(error);
  }
};
