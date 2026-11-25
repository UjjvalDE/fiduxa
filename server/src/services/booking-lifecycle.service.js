// Shared state changes for bookings so customer, admin and webhook paths
// behave identically (slot release, refunds, emails).
import { releaseSlot } from "./availability.service.js";
import {
  expireOpenCheckouts,
  refundBookingPayment,
} from "./payment.service.js";
import {
  sendAdminNotificationEmail,
  sendBookingConfirmedEmail,
  sendBookingStatusEmail,
  trySend,
} from "./email.service.js";
import { formatGermanDate, slotLabel } from "../utils/helpers.js";
import { assignAfterConfirmation } from "./auto-assign.service.js";
import { finalizeBookingDiscounts, releaseBookingDiscounts } from "./booking-discounts.service.js";
import { ensureSeriesForBooking } from "./recurring-series.service.js";
import { invoiceAttachment, issueInvoiceForBooking } from "./invoice.service.js";
import { applyCancellationFee, notifyCancellationFee } from "./money-policies.service.js";

/** Confirm a booking (after payment or in invoice mode) and email the customer. */
export const confirmBooking = async (booking, { actorId, note, paid }) => {
  booking.setStatus("confirmed", actorId, note);
  booking.holdExpiresAt = null;
  // Promotion becomes final, gift card amounts are captured
  await finalizeBookingDiscounts(booking);
  await booking.save();

  // Weekly / biweekly / monthly: the booking starts a recurring plan (once per booking)
  try {
    await ensureSeriesForBooking(booking);
  } catch (error) {
    console.error(`Recurring plan creation failed for ${booking.reference}:`, error.message);
  }

  // Paid → the invoice is issued now and attached to the confirmation mail
  let attachments;
  if (paid) {
    try {
      const { invoice, pdf, storageKey } = await issueInvoiceForBooking(booking);
      if (pdf) attachments = [invoiceAttachment(invoice.number, pdf, storageKey)];
    } catch (error) {
      console.error(`Invoice creation failed for ${booking.reference}:`, error.message);
    }
  }
  await trySend("Booking confirmation", () => sendBookingConfirmedEmail({ booking, paid, attachments }));
  await trySend("Admin notification", () =>
    sendAdminNotificationEmail({
      subject: `Neue Buchung ${booking.reference}${paid ? " (bezahlt)" : " (Rechnung)"}`,
      lines: [
        `Referenz: ${booking.reference}`,
        `Leistung: ${booking.serviceId}`,
        `Termin: ${formatGermanDate(booking.preferredDate)}, ${slotLabel(booking.slot, booking.slotEnd)}`,
        `PLZ: ${booking.customerDetails.postcode}`,
      ],
    })
  );

  // Auto mode: assign the best suitable cleaner now (no accept step);
  // board mode: offer the job to free cleaners (legacy open-job marketplace)
  if (!booking.assignedWorker) {
    const result = await assignAfterConfirmation(booking, { by: actorId ?? null, byRole: actorId ? "user" : "system", reason: note || "booking confirmed" });
    // Keep the caller's document in step (it may be returned / saved again)
    if (result?.booking) {
      booking.assignedWorker = result.booking.assignedWorker;
      booking.assignedAt = result.booking.assignedAt;
      booking.set("assignment", result.booking.assignment?.toObject?.() ?? result.booking.assignment);
    }
    return { assignment: result };
  }
  return { assignment: { state: "already_assigned" } };
};

/**
 * Cancel a booking: release the slot, close open checkouts and – if it was
 * paid – refund automatically (or mark refund_pending if that fails / is not wanted).
 *
 * `fee` (from cancellationPreview, policies.cancellation) makes it a
 * fee-bearing cancellation: the online payment is refunded minus the fee
 * (partial refund), an unpaid fee is recorded on the customer, and the
 * assigned cleaner gets their share as an earning.
 */
const giftCardOnly = (booking) => booking.payment?.method === "gift_card";

export const cancelBooking = async (booking, { actorId, reason = "", note, autoRefund, fee = null }) => {
  await releaseSlot(booking);
  await expireOpenCheckouts(booking._id);

  let refunded = false;
  let refundPending = false;
  const withFee = Boolean(fee && fee.feeCents > 0);
  if (withFee) {
    ({ refunded, refundPending } = await applyCancellationFee(booking, fee, { actorId, reason }));
  } else if (booking.payment?.status === "paid" && !giftCardOnly(booking)) {
    refunded = autoRefund ? await refundBookingPayment(booking) : false;
    if (!refunded) booking.set("payment.status", "refund_pending");
  }

  // Promotion can be used again, gift card amounts go back onto the cards
  await releaseBookingDiscounts(booking, { actor: actorId, note: `Booking ${booking.reference} cancelled` });

  // Paid entirely by gift card (no online payment): the balance is back on the
  // card(s) right now, so the booking is refunded – never "refund pending"
  // (QA open issue 3). A late fee is then recorded as outstanding.
  if (giftCardOnly(booking) && ["paid", "refund_pending"].includes(booking.payment?.status)) {
    booking.set("payment.status", "refunded");
    booking.set("payment.refundedAt", new Date());
    refunded = true;
  }

  booking.setStatus("cancelled", actorId, note ?? reason);
  booking.holdExpiresAt = null;
  booking.set("cancellation.cancelledAt", new Date());
  booking.set("cancellation.cancelledBy", actorId);
  booking.set("cancellation.reason", reason);
  await booking.save();

  await trySend("Booking status", () =>
    sendBookingStatusEmail({ booking, status: "cancelled", refund: ["refunded", "partially_refunded", "refund_pending"].includes(booking.payment?.status) })
  );
  if (withFee) await notifyCancellationFee(booking, fee);

  return { refunded, refundPending: refundPending || booking.payment?.status === "refund_pending", fee: withFee ? fee : null };
};
