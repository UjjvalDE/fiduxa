// No-show watch: a confirmed job whose start time passed 15 minutes ago
// without the cleaner reporting "on the way" or "started" is flagged once,
// the office and the customer are informed. Nothing is unassigned
// automatically – the admin decides.
import Booking from "../models/booking.model.js";
import {
  sendAdminNotificationEmail,
  sendCleanerDelayedEmail,
  trySend,
} from "./email.service.js";
import { DAY_MS, formatGermanDate, slotLabel, slotStartInstant, todayInBerlin } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";

export const NO_SHOW_GRACE_MINUTES = 15;

export const detectNoShows = async ({ now = new Date() } = {}) => {
  const today = todayInBerlin();
  const candidates = await Booking.find({
    status: "confirmed",
    preferredDate: { $gte: today, $lt: new Date(today.getTime() + DAY_MS) },
    assignedWorker: { $ne: null },
    "job.onTheWayAt": { $exists: false },
    "job.startedAt": { $exists: false },
    "job.noShowAlertAt": { $exists: false },
  })
    .populate("assignedWorker", "name phone email")
    .limit(200);

  const threshold = now.getTime() - NO_SHOW_GRACE_MINUTES * 60_000;
  let flagged = 0;

  for (const booking of candidates) {
    if (slotStartInstant(booking.preferredDate, booking.slot).getTime() > threshold) continue;

    // Flag atomically – another process may have handled it meanwhile
    const claimed = await Booking.findOneAndUpdate(
      { _id: booking._id, "job.noShowAlertAt": { $exists: false } },
      { $set: { "job.noShowAlertAt": now } },
      { returnDocument: "after" }
    );
    if (!claimed) continue;
    flagged += 1;

    const worker = booking.assignedWorker;
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Reinigungskraft verspätet: ${booking.reference}`,
        lines: [
          `Referenz: ${booking.reference}`,
          `Termin: ${formatGermanDate(booking.preferredDate)}, ${slotLabel(booking.slot, booking.slotEnd)}`,
          `Reinigungskraft: ${worker?.name ?? "–"}`,
          `Telefon: ${worker?.phone || "–"}`,
          `Kunde: ${booking.customerDetails?.name ?? "–"} (${booking.customerDetails?.phone || booking.customerDetails?.email || "–"})`,
          `Adresse: ${booking.customerDetails?.address ?? ""}, ${booking.customerDetails?.postcode ?? ""}`,
          `Noch kein "Unterwegs"/"Gestartet" ${NO_SHOW_GRACE_MINUTES} Minuten nach Beginn. Bitte Reinigungskraft kontaktieren – ggf. neu zuweisen.`,
        ],
      })
    );
    await trySend("Cleaner delayed", () => sendCleanerDelayedEmail({ booking }));
    logger.warn({ bookingRef: booking.reference, worker: worker?.name }, "No-show alert raised");
  }

  return flagged;
};

/** Dashboard tile: how many of today's jobs were flagged as late */
export const countLateToday = () => {
  const today = todayInBerlin();
  return Booking.countDocuments({
    preferredDate: { $gte: today, $lt: new Date(today.getTime() + DAY_MS) },
    "job.noShowAlertAt": { $exists: true },
  });
};
