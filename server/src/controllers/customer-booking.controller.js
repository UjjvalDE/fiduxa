import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import { OPERATIONS } from "../config/pricing.js";
import { slotStartInstant } from "../utils/helpers.js";
import {
  sendAdminNotificationEmail,
  trySend,
} from "../services/email.service.js";
import { cancelBooking } from "../services/booking-lifecycle.service.js";
import Review from "../models/review.model.js";
import User from "../models/user.model.js";
import { getWorkerStats, publicWorkerCard, PUBLIC_WORKER_FIELDS } from "../services/worker-profile.service.js";
import { unreadCounts } from "../services/booking-message.service.js";
import { reviewWindowOpen } from "../controllers/review.controller.js";

const CUSTOMER_HIDDEN_FIELDS =
  "-adminNotes -statusHistory.changedBy -quotation.sentBy -quotationHistory -assignedBy -jobOffer -job.issueReported";

const findOwnBooking = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid booking ID." });
    return null;
  }

  const booking = await Booking.findOne({
    _id: req.params.id,
    customer: req.user._id,
  });

  if (!booking) {
    res.status(404).json({ success: false, message: "Booking not found." });
    return null;
  }

  return booking;
};

// GET /api/v1/customer/bookings/:id
export const getMyBooking = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid booking ID." });
    }

    const booking = await Booking.findOne({
      _id: req.params.id,
      customer: req.user._id,
    })
      .select(CUSTOMER_HIDDEN_FIELDS)
      .populate("assignedWorker", "name");

    if (!booking) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }

    const workerId = booking.assignedWorker?._id;
    const [worker, review, unread] = await Promise.all([
      workerId ? User.findById(workerId).select(PUBLIC_WORKER_FIELDS).lean() : null,
      Review.findOne({ booking: booking._id }).select("rating punctuality quality friendliness comment createdAt").lean(),
      unreadCounts([booking._id], req.user._id),
    ]);
    const cleaner = worker ? publicWorkerCard(worker, await getWorkerStats(worker._id)) : null;

    return res.json({
      success: true,
      booking,
      cleaner,
      review,
      canReview: !review && reviewWindowOpen(booking),
      unreadMessages: unread[String(booking._id)] ?? 0,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/customer/bookings/:id/cancel  { reason? }
// Unpaid reservations can always be cancelled; confirmed bookings until the
// cutoff (default 24 h before the slot). Paid bookings are refunded automatically.
export const cancelMyBooking = async (req, res, next) => {
  try {
    const { reason } = z
      .object({ reason: z.string().trim().max(1000).optional().default("") })
      .parse(req.body ?? {});

    const booking = await findOwnBooking(req, res);
    if (!booking) return;

    const freelyCancellable = ["payment_pending", "pending_quotation", "quotation_sent", "accepted"];

    if (booking.status === "confirmed") {
      const cutoff = new Date(
        slotStartInstant(booking.preferredDate, booking.slot).getTime() -
          OPERATIONS.cancellationCutoffHours * 60 * 60 * 1000
      );

      if (new Date() > cutoff) {
        return res.status(409).json({
          success: false,
          message: `Confirmed bookings can be cancelled online up to ${OPERATIONS.cancellationCutoffHours} hours before the appointment. Please contact us.`,
        });
      }
    } else if (!freelyCancellable.includes(booking.status)) {
      return res.status(409).json({
        success: false,
        message: `A booking with status "${booking.status}" cannot be cancelled.`,
      });
    }

    const result = await cancelBooking(booking, {
      actorId: req.user._id,
      reason,
      note: "Cancelled by customer",
      autoRefund: true,
    });

    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Stornierung durch Kunde: ${booking.reference}`,
        lines: [
          `Referenz: ${booking.reference}`,
          `Grund: ${reason || "-"}`,
          result.refunded ? "Zahlung automatisch erstattet." : result.refundPending ? "ERSTATTUNG OFFEN – bitte manuell erstatten." : "",
        ],
      })
    );

    return res.json({
      success: true,
      message: "Booking cancelled.",
      reference: booking.reference,
      status: booking.status,
      payment: booking.payment,
      refunded: result.refunded,
    });
  } catch (error) {
    next(error);
  }
};
