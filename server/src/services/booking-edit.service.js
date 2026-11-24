// Booking editing (customer + admin): reschedule, duration/extras/service
// changes with server-side repricing, cleaner-conflict validation, a change
// log on the booking and notifications. Historical payment records are never
// rewritten – price changes only adjust what is still open.
import Booking from "../models/booking.model.js";
import Promotion from "../models/promotion.model.js";
import PromotionRedemption from "../models/promotion-redemption.model.js";
import { createEstimate } from "./estimate.service.js";
import { computeDiscount } from "./promotion.service.js";
import { moveBooking } from "./availability.service.js";
import { findWorkerConflict } from "./job-dispatch.service.js";
import { eligibilityProblem } from "./work-eligibility.service.js";
import User from "../models/user.model.js";
import { OPERATIONS, PRICING } from "../config/pricing.js";
import { httpError, slotStartInstant } from "../utils/helpers.js";

export const EDITABLE_STATUSES = ["payment_pending", "confirmed"];

/** Confirmed bookings can be edited online until the cancellation cutoff. */
export const editCutoffPassed = (booking) => {
  if (booking.status !== "confirmed") return false;
  const start = slotStartInstant(booking.preferredDate, booking.slot).getTime();
  return Date.now() > start - OPERATIONS.cancellationCutoffHours * 60 * 60 * 1000;
};

/** True when the booking was paid through an online provider (refund-only money path). */
export const paidOnline = (booking) =>
  booking.payment?.status === "paid" && ["stripe", "paypal"].includes(booking.payment?.method);

const asString = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
};

/** Append a change-log entry (field → from/to as strings). Does not save. */
export const logBookingChange = (booking, { by, role }, changes) => {
  const entries = changes
    .filter((c) => asString(c.from) !== asString(c.to))
    .map((c) => ({ field: c.field, from: asString(c.from), to: asString(c.to) }));
  if (entries.length === 0) return [];
  booking.changeLog = booking.changeLog ?? [];
  booking.changeLog.push({ at: new Date(), by, role, changes: entries });
  return entries;
};

/**
 * Recalculate the booking price for new service/size/condition/extras/duration.
 * Uses the same estimate engine as booking creation, re-derives an applied
 * promotion on the new price and keeps VAT contained. Gift-card bookings are
 * rejected (their redeemed amount cannot be resized online).
 * Mutates the booking (estimate, extras, pricing, open payment amount).
 * Returns { estimate, priceDeltaCents }.
 */
export const repriceBooking = async (booking, fields = {}) => {
  if ((booking.pricing?.giftCardCents ?? 0) > 0) {
    throw httpError(409, "Bookings paid with a gift card cannot be resized online. Please contact us.");
  }

  const merged = {
    serviceId: fields.serviceId ?? booking.serviceId,
    areaM2: fields.areaM2 ?? booking.areaM2,
    bathrooms: booking.bathrooms ?? 1,
    condition: fields.condition ?? booking.condition,
    frequency: booking.frequency,
    extras: fields.extras ?? booking.extras ?? [],
    // undefined → fresh recommendation for the new inputs
    durationMinutes: fields.durationMinutes,
  };
  const estimate = createEstimate(merged);

  // Re-derive an applied promotion on the new order value
  const redemption = await PromotionRedemption.findOne({
    booking: booking._id,
    status: { $in: ["reserved", "applied"] },
  });
  let promotionDiscountCents = 0;
  if (redemption) {
    const promo = await Promotion.findById(redemption.promotion).lean();
    promotionDiscountCents = promo
      ? Math.min(computeDiscount(promo, estimate.totalCents), estimate.totalCents)
      : Math.min(redemption.discountCents, estimate.totalCents);
    redemption.discountCents = promotionDiscountCents;
    redemption.orderCents = estimate.totalCents;
    await redemption.save();
  }

  const oldTotal = booking.pricing?.totalCents ?? booking.estimate?.totalCents ?? 0;
  const totalCents = Math.max(0, estimate.totalCents - promotionDiscountCents);
  const vatRate = booking.pricing?.vatRate ?? PRICING.vatRate ?? 0.19;
  const vatCents = Math.round(totalCents - totalCents / (1 + vatRate));

  booking.serviceId = merged.serviceId;
  booking.areaM2 = merged.areaM2;
  booking.condition = merged.condition;
  booking.extras = estimate.extras.map((e) => e.id);
  booking.estimate = estimate;
  booking.set("pricing.subtotalCents", estimate.subtotalCents);
  booking.set("pricing.recurringDiscountCents", estimate.discountCents);
  booking.set("pricing.priceCents", estimate.totalCents);
  booking.set("pricing.promotionDiscountCents", promotionDiscountCents);
  booking.set("pricing.totalCents", totalCents);
  booking.set("pricing.vatRate", vatRate);
  booking.set("pricing.vatCents", vatCents);
  booking.set("pricing.payableCents", totalCents);

  // Only money that is still open follows the new price. A payment that was
  // already made keeps its historical record (delta via refund/cash/invoice).
  if (booking.payment && booking.payment.status !== "paid") {
    booking.set("payment.amountCents", totalCents);
  }

  return { estimate, priceDeltaCents: totalCents - oldTotal };
};

/**
 * Move a booking to a new window/time. Validates the assigned cleaner first
 * (conflict → 409 unless forceUnassign) and the slot capacity inside the day
 * lock. Mutates the booking; returns { unassignedWorker: ObjectId|null }.
 */
export const rescheduleBooking = async (booking, { slotId, startTime, preferredDate, forceUnassign = false }) => {
  const durationMinutes = booking.estimate?.durationMinutes ?? 120;

  let unassignedWorker = null;
  if (booking.assignedWorker) {
    const probe = {
      _id: booking._id,
      preferredDate,
      slot: startTime,
      estimate: { durationMinutes },
    };
    const worker = await User.findById(booking.assignedWorker).select("role documents workEligibility");
    // Cleaner busy at the new time, or their ID / permit expires before the new date
    const conflict = (await findWorkerConflict(booking.assignedWorker, probe)) || (worker && eligibilityProblem(worker, preferredDate));
    if (conflict) {
      if (!forceUnassign) {
        throw Object.assign(
          httpError(409, "Your cleaner is not available at the new time. Please pick another time or contact us."),
          { code: "WORKER_CONFLICT" }
        );
      }
      unassignedWorker = booking.assignedWorker;
      booking.assignedWorker = null;
      // Fresh offer cycle: cleaners are notified again, admin alert re-armed
      booking.set("jobOffer.notifiedAt", undefined);
      booking.set("jobOffer.unassignedAlertSentAt", undefined);
    }
  }

  const moved = await moveBooking(booking, { slotId, date: preferredDate, startTime, durationMinutes });
  if (!moved) {
    throw httpError(409, "This time is no longer available. Please choose another slot.");
  }
  return { unassignedWorker };
};
