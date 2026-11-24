// Cash at the end of the job: the cleaner collects the price from the
// customer. The amount is recorded on the booking, as a Payment record, and
// deducted from the cleaner's payout (cashHeldCents).
import Payment from "../models/payment.model.js";
import { sendAdminNotificationEmail, trySend } from "./email.service.js";
import { issueInvoiceForBooking } from "./invoice.service.js";
import { sendInvoiceEmail } from "./invoice-email.service.js";

/** Record collected cash. byWorker = the assigned cleaner kept the money. Does NOT save the booking. */
export const recordCashPayment = async (booking, { amountCents, actorId, byWorker }) => {
  const now = new Date();
  booking.set("payment.cashCollectedCents", amountCents);
  booking.set("payment.cashCollectedAt", now);
  booking.set("payment.cashCollectedBy", actorId);
  booking.set("payment.status", "paid");
  booking.set("payment.paidAt", now);

  if (byWorker && booking.workerPayout?.status && booking.workerPayout.status !== "paid") {
    booking.set("workerPayout.cashHeldCents", amountCents);
  }

  await Payment.updateOne(
    { checkoutSessionId: `cash-${booking._id}` },
    {
      $set: { amountCents, status: "paid", paidAt: now },
      $setOnInsert: {
        booking: booking._id,
        customer: booking.customer,
        provider: "cash",
        checkoutSessionId: `cash-${booking._id}`,
        currency: "EUR",
      },
    },
    { upsert: true }
  );

  // Paid → invoice (once) and "your invoice" mail with the PDF
  try {
    const { invoice, pdf, created } = await issueInvoiceForBooking(booking);
    if (created) await trySend("Invoice", () => sendInvoiceEmail({ booking, invoice, pdf }));
  } catch (error) {
    console.error(`Invoice creation failed for ${booking.reference}:`, error.message);
  }

  const expected = booking.payment?.amountCents ?? booking.estimate?.totalCents ?? 0;
  if (amountCents !== expected) {
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Barzahlung abweichend: ${booking.reference}`,
        lines: [
          `Referenz: ${booking.reference}`,
          `Erwartet: ${(expected / 100).toFixed(2)} €`,
          `Kassiert: ${(amountCents / 100).toFixed(2)} €`,
        ],
      })
    );
  }
};

/** Net payout of one job (pay minus cash the cleaner kept; can be negative) */
export const netPayout = (p) => (p?.amountCents ?? 0) - (p?.cashHeldCents ?? 0);
