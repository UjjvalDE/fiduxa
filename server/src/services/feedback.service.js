// Post-cleaning follow-up helpers: customer + cleaner report the actual
// duration independently; a clear difference flags the booking for office
// review. There is NEVER an automatic extra charge.
import { sendAdminNotificationEmail, trySend } from "./email.service.js";

const MISMATCH_MINUTES = 30;

/**
 * Compare the two reports (when both exist) and flag the booking.
 * Mutates the booking; does not save. Sends one admin alert per booking.
 */
export const flagDurationMismatch = async (booking) => {
  const byWorker = booking.job?.actualDurationMinutes;
  const byCustomer = booking.feedback?.customer?.actualDurationMinutes;
  if (byWorker == null || byCustomer == null) return false;
  const mismatch = Math.abs(byWorker - byCustomer) > MISMATCH_MINUTES;
  const alreadyFlagged = booking.feedback?.durationMismatch === true;
  booking.set("feedback.durationMismatch", mismatch);
  if (mismatch && !alreadyFlagged) {
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Dauer-Abweichung bei ${booking.reference}`,
        lines: [
          `Reinigungskraft: ${byWorker} Min · Kunde: ${byCustomer} Min (geplant: ${booking.estimate?.durationMinutes ?? "-"} Min).`,
          "Bitte prüfen. Es wird nichts automatisch nachberechnet.",
        ],
      })
    );
  }
  return mismatch;
};
