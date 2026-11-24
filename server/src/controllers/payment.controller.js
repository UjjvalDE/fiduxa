import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import Payment from "../models/payment.model.js";
import {
  availableMethods,
  bookingMethods,
  createCheckoutForBooking,
  getStripe,
  isOnlinePaymentAvailable,
  isPaymentConfigured,
  payableAmount,
  refundBookingPayment,
  refundPaymentRecord,
} from "../services/payment.service.js";
import { capturePayPalOrder } from "../services/paypal.service.js";
import { PAYMENT_OPTIONS } from "../config/pricing.js";
import { reclaimSlot, releaseSlot } from "../services/availability.service.js";
import { reacquireBookingDiscounts } from "../services/booking-discounts.service.js";
import { activatePaidGiftCard } from "../services/gift-card-purchase.service.js";

// Late payment for an expired hold: slot, promotion and gift card amounts
// must ALL be available again – otherwise the payment is refunded.
const reclaimAll = async (booking) => {
  if (!(await reclaimSlot(booking))) return false;
  if (await reacquireBookingDiscounts(booking)) return true;
  await releaseSlot(booking);
  return false;
};
import { confirmBooking } from "../services/booking-lifecycle.service.js";
import {
  sendAdminNotificationEmail,
  sendBookingStatusEmail,
  trySend,
} from "../services/email.service.js";
import { recordAudit } from "../services/audit.service.js";
import { getPagination, paginationMeta } from "../utils/helpers.js";

const PAYABLE_STATUSES = ["payment_pending", "accepted"]; // accepted = legacy quotation flow

const paymentSummary = (booking) => ({
  bookingId: booking._id,
  reference: booking.reference,
  bookingStatus: booking.status,
  amountCents: payableAmount(booking) ?? null,
  currency: "EUR",
  payment: booking.payment ?? { status: "unpaid" },
  holdExpiresAt: booking.holdExpiresAt ?? null,
  onlinePaymentAvailable: isOnlinePaymentAvailable(),
  methods: availableMethods(),
  bookingMethods: bookingMethods(),
});

// GET /api/v1/payments/config
export const getPaymentConfig = (req, res) => {
  res.json({
    success: true,
    onlinePaymentAvailable: isOnlinePaymentAvailable(),
    // Online methods (redirect) – "stripe" | "paypal"
    methods: availableMethods(),
    // Everything the customer can choose at checkout, incl. "cash"
    bookingMethods: bookingMethods(),
    cashEnabled: PAYMENT_OPTIONS.cashEnabled,
  });
};

const providerError = (error, res) => {
  if (error?.type?.startsWith?.("Stripe") || error?.paypal) {
    console.error("Payment provider error:", error.message);
    res.status(502).json({
      success: false,
      message: "The payment provider is currently unavailable. Please try again later.",
    });
    return true;
  }
  return false;
};

// GET /api/v1/payments/booking/:bookingId (customer: own booking)
export const getBookingPayment = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.bookingId)) {
      return res.status(400).json({ success: false, message: "Invalid booking ID." });
    }

    const booking = await Booking.findOne({
      _id: req.params.bookingId,
      customer: req.user._id,
    }).select("reference status estimate.totalCents quotation.amountCents payment holdExpiresAt");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found." });
    }

    return res.json({ success: true, ...paymentSummary(booking) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/payments/checkout  { bookingId }
// Retry/continue payment for a reserved (payment_pending) booking.
export const createCheckoutSession = async (req, res, next) => {
  try {
    const { bookingId, method } = z
      .object({
        bookingId: z.string().refine((id) => mongoose.isValidObjectId(id), "Invalid booking ID."),
        earlyStartConsent: z.boolean().optional(),
        method: z.enum(["stripe", "paypal"]).optional(),
      })
      .parse(req.body);

    const booking = await Booking.findOne({ _id: bookingId, customer: req.user._id });

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found." });
    }

    if (booking.payment?.status === "paid") {
      return res.status(409).json({ success: false, message: "This booking has already been paid." });
    }

    if (booking.payment?.status === "pending") {
      return res.status(409).json({
        success: false,
        message: "A payment for this booking is already being processed.",
      });
    }

    if (booking.status === "expired") {
      return res.status(409).json({
        success: false,
        message: "Your reservation has expired. Please book a new slot.",
      });
    }

    if (!PAYABLE_STATUSES.includes(booking.status)) {
      return res.status(409).json({
        success: false,
        message: "This booking cannot be paid online.",
      });
    }

    if (booking.holdExpiresAt && booking.holdExpiresAt <= new Date()) {
      return res.status(409).json({
        success: false,
        message: "Your reservation has expired. Please book a new slot.",
      });
    }

    const { url, reused } = await createCheckoutForBooking(booking, req.user._id, { method });
    if (!booking.consents?.earlyStartRequestedAt) {
      booking.set("consents.earlyStartRequestedAt", new Date());
    }
    await booking.save();

    return res.status(reused ? 200 : 201).json({ success: true, url });
  } catch (error) {
    if (providerError(error, res)) return;
    next(error);
  }
};

// ---------- Webhook helpers ----------

const markPaid = async (session) => {
  const payment = await Payment.findOne({ checkoutSessionId: session.id });
  if (!payment) {
    console.warn(`Webhook: unknown checkout session ${session.id}`);
    return;
  }
  if (payment.status === "paid" || payment.status === "refunded") return; // idempotent

  // Never trust amounts from anywhere but our own record
  if (session.amount_total !== payment.amountCents || session.currency !== "eur") {
    payment.status = "failed";
    payment.failureReason = `Amount mismatch: got ${session.amount_total} ${session.currency}`;
    await payment.save();
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: "Zahlung mit abweichendem Betrag",
        lines: [`Session: ${session.id}`, payment.failureReason],
      })
    );
    return;
  }

  payment.status = "paid";
  payment.paidAt = new Date();
  payment.paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  await payment.save();
  await applyPaidPayment(payment);
};

/**
 * A Payment record has just become "paid": update and confirm its booking.
 * Late payments for expired/cancelled bookings take the slot back or are refunded.
 */
const applyPaidPayment = async (payment) => {
  if (payment.purpose === "gift_card") {
    await activatePaidGiftCard(payment);
    return null;
  }
  const booking = await Booking.findById(payment.booking);
  if (!booking) return null;

  booking.set("payment.status", "paid");
  booking.set("payment.method", payment.provider);
  booking.set("payment.amountCents", payment.amountCents);
  booking.set("payment.paidAt", payment.paidAt);
  booking.set("payment.checkoutSessionId", payment.checkoutSessionId);

  // Late payment after the hold expired or the booking was cancelled:
  // try to take the slot back, otherwise refund automatically.
  if (["expired", "cancelled"].includes(booking.status)) {
    const slotBack = booking.status === "expired" && (await reclaimAll(booking));

    if (!slotBack) {
      const refunded = await refundBookingPayment(booking);
      if (!refunded) booking.set("payment.status", "refund_pending");
      await booking.save();
      await trySend("Booking status", () =>
        sendBookingStatusEmail({ booking, status: booking.status, refund: true })
      );
      await trySend("Admin notification", () =>
        sendAdminNotificationEmail({
          subject: `Zahlung nach Ablauf: ${booking.reference}`,
          lines: [
            `Referenz: ${booking.reference}`,
            refunded ? "Automatisch erstattet." : "ERSTATTUNG OFFEN – bitte manuell erstatten.",
          ],
        })
      );
      return booking;
    }
  }

  if (["payment_pending", "accepted", "expired"].includes(booking.status)) {
    await confirmBooking(booking, { note: `Payment received (${payment.provider})`, paid: true });
  } else {
    await booking.save();
  }
  return booking;
};

const markProcessing = async (session) => {
  const payment = await Payment.findOne({ checkoutSessionId: session.id });
  if (!payment || payment.status === "paid") return;
  payment.status = "processing";
  await payment.save();
  // Asynchronous payment (e.g. SEPA): keep the slot until the result arrives
  await Booking.updateOne(
    { _id: payment.booking, "payment.status": { $ne: "paid" } },
    {
      $set: {
        "payment.status": "pending",
        "payment.checkoutSessionId": session.id,
        holdExpiresAt: null,
      },
    }
  );
};

const markFailed = async (session, reason) => {
  const payment = await Payment.findOne({ checkoutSessionId: session.id });
  if (!payment || payment.status === "paid") return;
  payment.status = reason === "expired" ? "expired" : "failed";
  payment.failureReason = reason;
  await payment.save();

  const booking = await Booking.findOne({
    _id: payment.booking,
    "payment.checkoutSessionId": session.id,
    "payment.status": { $in: ["unpaid", "pending"] },
  });
  if (!booking) return;

  booking.set("payment.status", reason === "expired" ? "unpaid" : "failed");
  // Async payment failed: give the customer a fresh hold window to retry
  if (reason !== "expired" && booking.status === "payment_pending") {
    booking.holdExpiresAt = new Date(Date.now() + 35 * 60 * 1000);
  }
  await booking.save();
};

// POST /api/v1/payments/webhook  (raw body, Stripe signature required)
export const handleStripeWebhook = async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !isPaymentConfigured()) {
    return res.status(503).json({ success: false, message: "Webhook not configured." });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, req.headers["stripe-signature"], secret);
  } catch (error) {
    console.warn("Stripe webhook signature check failed:", error.message);
    return res.status(400).json({ success: false, message: "Invalid signature." });
  }

  try {
    const session = event.data.object;

    switch (event.type) {
      case "checkout.session.completed":
        if (session.payment_status === "paid") await markPaid(session);
        else await markProcessing(session);
        break;
      case "checkout.session.async_payment_succeeded":
        await markPaid(session);
        break;
      case "checkout.session.async_payment_failed":
        await markFailed(session, "async_payment_failed");
        break;
      case "checkout.session.expired":
        await markFailed(session, "expired");
        break;
      default:
        break;
    }

    return res.json({ received: true });
  } catch (error) {
    console.error(`Stripe webhook ${event.type} failed:`, error);
    return res.status(500).json({ success: false }); // Stripe retries
  }
};

// POST /api/v1/payments/paypal/capture  { bookingId, orderId }
// Called by the return page after the customer approved the order at PayPal.
// The amount is verified with PayPal – nothing from the browser is trusted.
export const capturePayPalPayment = async (req, res, next) => {
  try {
    const { bookingId, orderId } = z
      .object({
        bookingId: z.string().refine((id) => mongoose.isValidObjectId(id), "Invalid booking ID."),
        orderId: z.string().trim().min(5).max(64).regex(/^[A-Z0-9-]+$/i),
      })
      .parse(req.body);

    const booking = await Booking.findOne({ _id: bookingId, customer: req.user._id });
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });

    const payment = await Payment.findOne({ booking: booking._id, provider: "paypal", checkoutSessionId: orderId });
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found." });

    const summary = () => res.json({ success: true, ...paymentSummary(booking) });

    if (payment.status === "paid" || booking.payment?.status === "paid") return summary();

    if (booking.status === "cancelled" || payment.status === "expired") {
      return res.status(409).json({
        success: false,
        message: "This reservation is no longer valid. You have not been charged.",
      });
    }

    // Still reserved (even if the hold time just passed and the expiry job has
    // not run yet): extend the hold atomically while we talk to PayPal.
    const extended = await Booking.findOneAndUpdate(
      { _id: booking._id, status: { $in: ["payment_pending", "accepted"] } },
      { $set: { holdExpiresAt: new Date(Date.now() + 5 * 60 * 1000) } },
      { returnDocument: "after" }
    );

    if (!extended) {
      // Hold expired: take the slot back first – never charge without a slot
      const slotBack = booking.status === "expired" && (await reclaimAll(booking));
      if (!slotBack) {
        payment.status = "expired";
        await payment.save();
        return res.status(409).json({
          success: false,
          message: "Your reservation has expired. Please book a new slot. You have not been charged.",
        });
      }
      booking.setStatus("payment_pending", req.user._id, "Slot re-reserved for PayPal payment");
      booking.holdExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await booking.save();
    }

    const capture = await capturePayPalOrder(orderId);
    const current = await Booking.findById(booking._id);

    if (capture.status === "COMPLETED") {
      if (capture.amountCents !== payment.amountCents || capture.currency !== "EUR") {
        payment.status = "failed";
        payment.paymentIntentId = capture.captureId;
        payment.failureReason = `Amount mismatch: got ${capture.amountCents} ${capture.currency}`;
        await payment.save();
        await trySend("Admin notification", () =>
          sendAdminNotificationEmail({
            subject: "PayPal-Zahlung mit abweichendem Betrag",
            lines: [`Buchung: ${booking.reference}`, `Order: ${orderId}`, payment.failureReason],
          })
        );
        return res.status(409).json({ success: false, message: "The payment could not be verified. Please contact us." });
      }

      payment.status = "paid";
      payment.paidAt = new Date();
      payment.paymentIntentId = capture.captureId;
      await payment.save();
      const updated = await applyPaidPayment(payment);
      return res.json({ success: true, ...paymentSummary(updated ?? booking) });
    }

    if (capture.status === "PENDING") {
      payment.status = "processing";
      payment.paymentIntentId = capture.captureId;
      await payment.save();
      current.set("payment.status", "pending");
      current.holdExpiresAt = null;
      await current.save();
      await trySend("Admin notification", () =>
        sendAdminNotificationEmail({
          subject: `PayPal-Zahlung in Prüfung: ${booking.reference}`,
          lines: [`Order: ${orderId}`, "Bitte im PayPal-Konto prüfen und die Buchung manuell bestätigen."],
        })
      );
      return res.json({ success: true, ...paymentSummary(current) });
    }

    // Declined / not approved yet
    payment.status = "failed";
    payment.failureReason = `PayPal status ${capture.status}`;
    await payment.save();
    current.set("payment.status", "failed");
    if (current.status === "payment_pending") current.holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await current.save();
    return res.status(402).json({
      success: false,
      message: "PayPal did not complete the payment. Please try again or choose another payment method.",
    });
  } catch (error) {
    if (error?.paypal && ["INSTRUMENT_DECLINED", "PAYER_ACTION_REQUIRED", "ORDER_NOT_APPROVED"].includes(error.issue)) {
      return res.status(402).json({
        success: false,
        message: "PayPal did not complete the payment. Please try again or choose another payment method.",
      });
    }
    if (providerError(error, res)) return;
    next(error);
  }
};

// ---------- Admin ----------

// GET /api/v1/admin/payments?status=&bookingId=&page=&limit=
export const listPayments = async (req, res, next) => {
  try {
    const pagination = getPagination(req.query, { defaultLimit: 20 });
    const filter = {};

    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.bookingId && mongoose.isValidObjectId(req.query.bookingId)) {
      filter.booking = req.query.bookingId;
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .select("-checkoutUrl")
        .populate("booking", "reference status preferredDate payment.status")
        .populate("customer", "name email")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      Payment.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      onlinePaymentAvailable: isOnlinePaymentAvailable(),
      methods: availableMethods(),
      pagination: paginationMeta(pagination, total),
      payments,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/payments/:id/refund – full refund of a paid payment
export const refundPayment = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid payment ID." });
    }

    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found." });
    }

    if (payment.status !== "paid" || !payment.paymentIntentId) {
      return res.status(409).json({ success: false, message: "Only paid payments can be refunded." });
    }

    const refund = { id: await refundPaymentRecord(payment) };

    await Booking.updateOne(
      { _id: payment.booking },
      { $set: { "payment.status": "refunded", "payment.refundedAt": payment.refundedAt } }
    );

    await recordAudit({
      actor: req.user._id,
      action: "payment.refunded",
      entityType: "Payment",
      entityId: payment._id,
      after: { refundId: refund.id, amountCents: payment.amountCents },
    });

    return res.json({ success: true, message: "Refund issued.", refundId: refund.id });
  } catch (error) {
    if (error?.type?.startsWith?.("Stripe") || error?.paypal) {
      console.error("Refund error:", error.message);
      return res.status(502).json({ success: false, message: `Refund failed: ${error.message}` });
    }
    next(error);
  }
};
