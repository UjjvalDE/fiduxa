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
import { offerJob } from "./job-dispatch.service.js";
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
      const { invoice, pdf } = await issueInvoiceForBooking(booking);
      if (pdf) attachments = [invoiceAttachment(invoice.number, pdf)];
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

  // Offer the job to free cleaners (open-job marketplace)
  if (!booking.assignedWorker) {
    await offerJob(booking);
    await booking.save();
  }
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
export const cancelBooking = async (booking, { actorId, reason = "", note, autoRefund, fee = null }) => {
  await releaseSlot(booking);
  await expireOpenCheckouts(booking._id);

  let refunded = false;
  let refundPending = false;
  const withFee = Boolean(fee && fee.feeCents > 0);
  if (withFee) {
    ({ refunded, refundPending } = await applyCancellationFee(booking, fee, { actorId, reason }));
  } else if (booking.payment?.status === "paid") {
    refunded = autoRefund ? await refundBookingPayment(booking) : false;
    if (!refunded) booking.set("payment.status", "refund_pending");
  }

  // Promotion can be used again, gift card amounts go back onto the cards
  await releaseBookingDiscounts(booking, { actor: actorId, note: `Booking ${booking.reference} cancelled` });

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
