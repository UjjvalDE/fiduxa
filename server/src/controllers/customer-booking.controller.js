import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import { OPERATIONS } from "../config/pricing.js";
import {
  adjustmentPayLink,
  assertCashWithinLimit,
  cancellationPreview,
  decideAdjustment,
} from "../services/money-policies.service.js";
import {
  sendAdminNotificationEmail,
  trySend,
} from "../services/email.service.js";
import { cancelBooking } from "../services/booking-lifecycle.service.js";
import {
  EDITABLE_STATUSES,
  editCutoffPassed,
  logBookingChange,
  paidOnline,
  repriceBooking,
  rescheduleBooking,
} from "../services/booking-edit.service.js";
import { assertBookableDate, moveBooking } from "../services/availability.service.js";
import { findService } from "../data/catalogue.js";
import { sendBookingUpdatedEmail, sendWorkerScheduleChangedEmail } from "../services/email.service.js";
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

// Statuses the customer may cancel online (a fee may apply to confirmed ones)
const CANCELLABLE = ["payment_pending", "confirmed", "pending_quotation", "quotation_sent", "accepted"];

// GET /api/v1/customer/bookings/:id/cancel-preview
// Fee / refund the customer would face right now (policies.cancellation).
export const getCancelPreview = async (req, res, next) => {
  try {
    const booking = await findOwnBooking(req, res);
    if (!booking) return;
    const cancellable = CANCELLABLE.includes(booking.status);
    return res.json({ success: true, cancellable, ...cancellationPreview(booking) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/customer/bookings/:id/cancel  { reason?, confirmFeeCents? }
// Cancellation is always possible online. Free until policies.cancellation.
// freeHours before the start; later a fee applies which the customer must
// confirm (confirmFeeCents = the fee shown; 409 FEE_CHANGED otherwise).
// Online payments are refunded automatically (minus the fee).
export const cancelMyBooking = async (req, res, next) => {
  try {
    const { reason, confirmFeeCents } = z
      .object({
        reason: z.string().trim().max(1000).optional().default(""),
        confirmFeeCents: z.number().int().min(0).optional(),
      })
      .parse(req.body ?? {});

    const booking = await findOwnBooking(req, res);
    if (!booking) return;

    if (!CANCELLABLE.includes(booking.status)) {
      return res.status(409).json({
        success: false,
        message: `A booking with status "${booking.status}" cannot be cancelled.`,
      });
    }

    const fee = cancellationPreview(booking);
    if (fee.feeCents > 0 && confirmFeeCents !== fee.feeCents) {
      return res.status(409).json({
        success: false,
        code: "FEE_CHANGED",
        message: `A cancellation fee of ${(fee.feeCents / 100).toFixed(2)} € applies. Please confirm it.`,
        ...fee,
      });
    }

    const result = await cancelBooking(booking, {
      actorId: req.user._id,
      reason,
      note: fee.feeCents > 0 ? `Cancelled by customer (fee ${(fee.feeCents / 100).toFixed(2)} €)` : "Cancelled by customer",
      autoRefund: true,
      fee,
    });

    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Stornierung durch Kunde: ${booking.reference}`,
        lines: [
          `Referenz: ${booking.reference}`,
          `Grund: ${reason || "-"}`,
          fee.feeCents > 0 ? `Stornogebühr: ${(fee.feeCents / 100).toFixed(2)} € (${fee.feePct} %)${fee.outstandingCents > 0 ? ` – davon offen: ${(fee.outstandingCents / 100).toFixed(2)} €` : ""}` : "",
          fee.cleanerCents > 0 && booking.assignedWorker ? `Anteil Reinigungskraft: ${(fee.cleanerCents / 100).toFixed(2)} €` : "",
          result.refunded ? "Zahlung automatisch erstattet." : result.refundPending ? "ERSTATTUNG OFFEN – bitte manuell erstatten." : "",
        ].filter(Boolean),
      })
    );

    return res.json({
      success: true,
      message: "Booking cancelled.",
      reference: booking.reference,
      status: booking.status,
      payment: booking.payment,
      refunded: result.refunded,
      fee: { feeCents: fee.feeCents, feePct: fee.feePct, refundCents: result.refunded ? fee.refundCents : 0, outstandingCents: fee.outstandingCents },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Price adjustments (duration review / edits of paid bookings)
// ---------------------------------------------------------------------------

const findAdjustment = (booking, res, adjId) => {
  const adjustment = mongoose.isValidObjectId(adjId) ? booking.priceAdjustments.id(adjId) : null;
  if (!adjustment) res.status(404).json({ success: false, message: "Adjustment not found." });
  return adjustment;
};

// POST /api/v1/customer/bookings/:id/adjustments/:adjId  { decision: "approve" | "decline" }
export const decideMyAdjustment = async (req, res, next) => {
  try {
    const { decision } = z.object({ decision: z.enum(["approve", "decline"]) }).parse(req.body ?? {});
    const booking = await findOwnBooking(req, res);
    if (!booking) return;
    const adjustment = findAdjustment(booking, res, req.params.adjId);
    if (!adjustment) return;

    await decideAdjustment(booking, adjustment, decision, { actorId: req.user._id });
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Preisanpassung ${decision === "approve" ? "angenommen" : "abgelehnt"}: ${booking.reference}`,
        lines: [`Differenz: ${(adjustment.deltaCents / 100).toFixed(2)} €`, `Grund: ${adjustment.reason || "-"}`, `Status: ${adjustment.status}`],
      })
    );
    return res.json({ success: true, message: decision === "approve" ? "Adjustment approved." : "Adjustment declined.", adjustment, payment: booking.payment });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/customer/bookings/:id/adjustments/:adjId/pay – (new) pay link for an open amount
export const payMyAdjustment = async (req, res, next) => {
  try {
    const booking = await findOwnBooking(req, res);
    if (!booking) return;
    const adjustment = findAdjustment(booking, res, req.params.adjId);
    if (!adjustment) return;
    const url = await adjustmentPayLink(booking, adjustment);
    return res.json({ success: true, url });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/v1/customer/bookings/:id – edit an upcoming booking.
// Reschedule (preferredDate+slotId+startTime), duration, extras, service and
// notes. Price-affecting fields are blocked for online-paid bookings (the
// office handles those – no partial refunds online) and for gift-card
// bookings. Everything is re-validated and re-priced on the server.
// ---------------------------------------------------------------------------
export const editOwnBooking = async (req, res, next) => {
  try {
    const data = z
      .object({
        preferredDate: z.string().trim().optional(),
        slotId: z.string().trim().optional(),
        startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        durationMinutes: z.number().int().min(30).max(720).optional(),
        extras: z.array(z.string()).max(20).optional(),
        serviceId: z.string().trim().optional(),
        notes: z.string().trim().max(1000).optional(),
        /** UX guard: the total the customer confirmed (409 on drift) */
        expectedTotalCents: z.number().int().min(0).optional(),
      })
      .refine(
        (d) => {
          const parts = [d.preferredDate, d.slotId, d.startTime].filter((x) => x !== undefined);
          return parts.length === 0 || parts.length === 3;
        },
        { message: "A reschedule needs preferredDate, slotId and startTime together.", path: ["preferredDate"] }
      )
      .parse(req.body);

    const booking = await findOwnBooking(req, res);
    if (!booking) return;

    if (!EDITABLE_STATUSES.includes(booking.status)) {
      return res.status(409).json({ success: false, message: "This booking can no longer be changed online." });
    }
    if (editCutoffPassed(booking)) {
      return res.status(409).json({
        success: false,
        message: `Bookings can be changed online up to ${OPERATIONS.cancellationCutoffHours} hours before the appointment. Please contact us.`,
      });
    }
    if (data.serviceId) {
      const service = findService(data.serviceId);
      if (!service || service.bookingMode !== "request") {
        return res.status(422).json({ success: false, message: "Unknown service." });
      }
      if (!service.frequencies.includes(booking.frequency)) {
        return res.status(409).json({ success: false, message: "This service is not available for your booking frequency." });
      }
    }

    const priceFields = ["durationMinutes", "extras", "serviceId"].filter((f) => data[f] !== undefined);
    if (priceFields.length > 0 && paidOnline(booking)) {
      return res.status(409).json({
        success: false,
        message: "This booking is already paid. For changes to duration or extras please contact us.",
      });
    }

    const before = {
      preferredDate: booking.preferredDate,
      slot: booking.slot,
      durationMinutes: booking.estimate?.durationMinutes,
      extras: [...(booking.extras ?? [])],
      serviceId: booking.serviceId,
      notes: booking.notes,
      totalCents: booking.pricing?.totalCents,
    };

    let priceDeltaCents = 0;
    if (priceFields.length > 0) {
      ({ priceDeltaCents } = await repriceBooking(booking, data));
      // Cash bookings stay inside the cash limit (policies.cash)
      if (booking.payment?.method === "cash" && booking.payment?.status !== "paid") assertCashWithinLimit(booking.pricing.totalCents);
      if (data.expectedTotalCents !== undefined && booking.pricing.totalCents !== data.expectedTotalCents) {
        return res.status(409).json({
          success: false,
          code: "PRICE_CHANGED",
          message: "The price has changed. Please check the new price.",
          totalCents: booking.pricing.totalCents,
        });
      }
    }

    let unassignedWorker = null;
    if (data.preferredDate) {
      const preferredDate = assertBookableDate(data.preferredDate);
      ({ unassignedWorker } = await rescheduleBooking(booking, {
        slotId: data.slotId,
        startTime: data.startTime,
        preferredDate,
      }));
    } else if (priceFields.length > 0 && booking.estimate?.durationMinutes) {
      // A changed duration (explicit or re-recommended) must still fit the window
      const moved = await moveBooking(booking, {
        slotId: String(booking.availabilitySlot),
        startTime: booking.slot,
        durationMinutes: booking.estimate.durationMinutes,
      });
      if (!moved) {
        return res.status(409).json({ success: false, message: "The new duration does not fit the booked time window. Please pick a new time." });
      }
    }

    if (data.notes !== undefined) booking.notes = data.notes;

    const changes = logBookingChange(booking, { by: req.user._id, role: "consumer" }, [
      { field: "preferredDate", from: before.preferredDate, to: booking.preferredDate },
      { field: "slot", from: before.slot, to: booking.slot },
      { field: "durationMinutes", from: before.durationMinutes, to: booking.estimate?.durationMinutes },
      { field: "extras", from: before.extras, to: booking.extras },
      { field: "serviceId", from: before.serviceId, to: booking.serviceId },
      { field: "notes", from: before.notes, to: booking.notes },
      { field: "totalCents", from: before.totalCents, to: booking.pricing?.totalCents },
    ]);
    if (changes.length === 0) {
      return res.json({ success: true, message: "Nothing changed." });
    }
    await booking.save();

    await trySend("Booking updated", () => sendBookingUpdatedEmail({ booking, changes, priceDeltaCents }));
    if (booking.assignedWorker && changes.some((c) => ["preferredDate", "slot", "durationMinutes"].includes(c.field))) {
      const worker = await User.findById(booking.assignedWorker).select("name email preferredLanguage");
      if (worker) await trySend("Worker schedule change", () => sendWorkerScheduleChangedEmail({ worker, booking }));
    }
    if (unassignedWorker) {
      await trySend("Admin notification", () =>
        sendAdminNotificationEmail({
          subject: `Buchung ${booking.reference}: Reinigungskraft nach Terminänderung entfernt`,
          lines: [`Der neue Termin kollidierte mit einem anderen Einsatz.`, `Bitte neu zuweisen oder die Jobbörse abwarten.`],
        })
      );
    }

    return res.json({
      success: true,
      message: "Your booking has been updated.",
      priceDeltaCents,
      changes,
      booking: {
        id: booking._id,
        reference: booking.reference,
        preferredDate: booking.preferredDate,
        slot: booking.slot,
        slotEnd: booking.slotEnd,
        serviceId: booking.serviceId,
        extras: booking.extras,
        durationMinutes: booking.estimate?.durationMinutes,
        pricing: booking.pricing,
        payment: booking.payment,
        status: booking.status,
      },
    });
  } catch (error) {
    next(error);
  }
};
