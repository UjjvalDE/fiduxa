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

/** Confirm a booking (after payment or in invoice mode) and email the customer. */
export const confirmBooking = async (booking, { actorId, note, paid }) => {
  booking.setStatus("confirmed", actorId, note);
  booking.holdExpiresAt = null;
  // Promotion becomes final, gift card amounts are captured
  await finalizeBookingDiscounts(booking);
  await booking.save();

  await trySend("Booking confirmation", () => sendBookingConfirmedEmail({ booking, paid }));
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
 */
export const cancelBooking = async (booking, { actorId, reason = "", note, autoRefund }) => {
  await releaseSlot(booking);
  await expireOpenCheckouts(booking._id);

  let refunded = false;
  if (booking.payment?.status === "paid") {
    refunded = autoRefund ? await refundBookingPayment(booking) : false;
    if (!refunded) booking.set("payment.status", "refund_pending");
  }

  // Promotion can be used again, gift card amounts go back onto the cards
  await releaseBookingDiscounts(booking, { actor: actorId, note: `Booking ${booking.reference} cancelled` });

  booking.setStatus("cancelled", actorId, note ?? reason);
  booking.holdExpiresAt = null;
  booking.cancellation = { cancelledAt: new Date(), cancelledBy: actorId, reason };
  await booking.save();

  await trySend("Booking status", () =>
    sendBookingStatusEmail({ booking, status: "cancelled", refund: booking.payment?.status === "refunded" || booking.payment?.status === "refund_pending" })
  );

  return { refunded, refundPending: booking.payment?.status === "refund_pending" };
};
