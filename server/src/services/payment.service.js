import Stripe from "stripe";

import Payment from "../models/payment.model.js";
import { findService } from "../data/catalogue.js";
import { OPERATIONS, PAYMENT_OPTIONS } from "../config/pricing.js";
import { httpError, slotLabel } from "../utils/helpers.js";
import {
  createPayPalOrderForBooking,
  isPayPalConfigured,
  refundPayPalCapture,
} from "./paypal.service.js";

let stripeClient = null;

const CHECKOUT_LIFETIME_MINUTES = 30; // Stripe minimum is 30 minutes
const STRIPE_LOCALES = { de: "de", en: "en", pl: "pl" };

// Stripe is optional until configured.
export const isPaymentConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** Online methods the customer can choose ("stripe" = card etc. via Stripe Checkout) */
export const availableMethods = () => [
  ...(isPaymentConfigured() && PAYMENT_OPTIONS.stripeEnabled ? ["stripe"] : []),
  ...(isPayPalConfigured() && PAYMENT_OPTIONS.paypalEnabled ? ["paypal"] : []),
];

/** All methods a customer can choose when booking (online + cash) */
export const bookingMethods = () => [...availableMethods(), ...(PAYMENT_OPTIONS.cashEnabled ? ["cash"] : [])];

// No online method at all → bookings use "invoice" mode.
export const isOnlinePaymentAvailable = () => availableMethods().length > 0;

/** Requested method if available, otherwise the first available one */
export const pickMethod = (requested) => {
  const methods = availableMethods();
  return methods.includes(requested) ? requested : methods[0] ?? null;
};

export const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw httpError(
      503,
      "Online payment is not configured yet. Please contact us to pay by invoice."
    );
  }

  if (!stripeClient) {
    // Optional: point the SDK at stripe-mock / a test double (development only)
    const apiBase = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      appInfo: { name: "Fiduxa" },
      ...(apiBase && {
        host: apiBase.hostname,
        port: Number(apiBase.port) || (apiBase.protocol === "https:" ? 443 : 80),
        protocol: apiBase.protocol.replace(":", ""),
        maxNetworkRetries: 0,
      }),
    });
  }

  return stripeClient;
};

// Public website origin used for Stripe success/cancel redirects
export { getSiteUrl } from "../utils/site-url.js";
import { getSiteUrl } from "../utils/site-url.js";

/** Amount the customer has to pay for a booking (price snapshot) */
export const payableAmount = (booking) =>
  booking.status === "accepted" && booking.quotation?.amountCents != null
    ? booking.quotation.amountCents // legacy quotation flow
    : booking.pricing?.payableCents ?? booking.estimate?.totalCents;

/**
 * Start an online payment (Stripe Checkout or PayPal order) and return the
 * URL the customer is redirected to. Extends the slot hold.
 * Does NOT save the booking – the caller saves it.
 */
export const createCheckoutForBooking = async (booking, customerId, { method } = {}) => {
  const chosen = pickMethod(method);
  if (!chosen) throw httpError(503, "Online payment is not configured yet. Please contact us to pay by invoice.");

  const amountCents = payableAmount(booking);
  if (!Number.isInteger(amountCents) || amountCents < 50) {
    throw httpError(409, "There is no payable amount for this booking. Please contact us.");
  }

  if (chosen === "paypal") {
    return createPayPalOrderForBooking(booking, customerId, { amountCents, siteUrl: getSiteUrl() });
  }
  return createStripeCheckout(booking, customerId, amountCents);
};

const createStripeCheckout = async (booking, customerId, amountCents) => {
  const stripe = getStripe();

  // Reuse a still-open session (double clicks / reloads)
  const openPayment = await Payment.findOne({
    booking: booking._id,
    provider: "stripe",
    status: "created",
    amountCents,
    expiresAt: { $gt: new Date(Date.now() + 2 * 60 * 1000) },
  }).sort({ createdAt: -1 });

  if (openPayment?.checkoutUrl) {
    return { url: openPayment.checkoutUrl, reused: true };
  }

  const siteUrl = getSiteUrl();
  const service = findService(booking.serviceId);
  const locale = booking.locale || "de";
  const expiresAt = new Date(Date.now() + CHECKOUT_LIFETIME_MINUTES * 60 * 1000 + 30 * 1000);
  const appointment = `${new Date(booking.preferredDate).toLocaleDateString("de-DE", {
    timeZone: "UTC",
  })}, ${slotLabel(booking.slot, booking.slotEnd)}`;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      locale: STRIPE_LOCALES[locale] ?? "auto",
      customer_email: booking.customerDetails.email,
      client_reference_id: String(booking._id),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amountCents,
            product_data: {
              name: `${(locale === "de" ? service?.name : service?.nameEn) ?? "Cleaning"} – ${booking.reference}`,
              description: `${appointment} · ${booking.customerDetails.postcode} Berlin`,
            },
          },
        },
      ],
      metadata: { bookingId: String(booking._id), reference: booking.reference },
      payment_intent_data: {
        metadata: { bookingId: String(booking._id), reference: booking.reference },
      },
      success_url: `${siteUrl}/zahlung/erfolg?booking=${booking._id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/zahlung/${booking._id}?abgebrochen=1`,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    },
    { idempotencyKey: `checkout-${booking._id}-${amountCents}-${Math.floor(Date.now() / 60000)}` }
  );

  await Payment.updateOne(
    { checkoutSessionId: session.id },
    {
      $setOnInsert: {
        booking: booking._id,
        customer: customerId,
        checkoutSessionId: session.id,
        amountCents,
        currency: "EUR",
        status: "created",
        checkoutUrl: session.url,
        expiresAt,
      },
    },
    { upsert: true }
  );

  booking.set("payment.method", "stripe");
  booking.set("payment.amountCents", amountCents);
  booking.set("payment.checkoutSessionId", session.id);
  if (!booking.payment?.status) booking.set("payment.status", "unpaid");

  // Keep the slot at least until the checkout can no longer be completed
  if (booking.status === "payment_pending") {
    const minHold = new Date(Date.now() + OPERATIONS.holdMinutes * 60 * 1000);
    if (!booking.holdExpiresAt || booking.holdExpiresAt < minHold) {
      booking.holdExpiresAt = minHold;
    }
  }

  return { url: session.url, reused: false };
};

/**
 * Generic Stripe Checkout session (used for gift card purchases).
 * Returns { sessionId, url, expiresAt }.
 */
export const createStripeSession = async ({ amountCents, name, description, email, locale = "de", metadata, successUrl, cancelUrl, idempotencyKey }) => {
  const stripe = getStripe();
  const expiresAt = new Date(Date.now() + CHECKOUT_LIFETIME_MINUTES * 60 * 1000 + 30 * 1000);
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      locale: STRIPE_LOCALES[locale] ?? "auto",
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: { currency: "eur", unit_amount: amountCents, product_data: { name, description } },
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    },
    { idempotencyKey }
  );
  return { sessionId: session.id, url: session.url, expiresAt };
};

/** Best-effort: close open checkout sessions of a booking (e.g. on cancel) */
export const expireOpenCheckouts = async (bookingId) => {
  const open = await Payment.find({ booking: bookingId, status: "created" });
  for (const payment of open) {
    // PayPal orders cannot be voided before approval; our capture endpoint
    // refuses expired payments, so marking them is enough.
    if (payment.provider !== "paypal" && isPaymentConfigured()) {
      try {
        await getStripe().checkout.sessions.expire(payment.checkoutSessionId);
      } catch {
        /* already completed/expired – ignore */
      }
    }
    payment.status = "expired";
    await payment.save();
  }
};

/** Refund one paid Payment at its provider and record it. Throws on provider errors. */
export const refundPaymentRecord = async (payment) => {
  let refundId;
  if (payment.provider === "paypal") {
    refundId = await refundPayPalCapture(payment.paymentIntentId, payment._id);
  } else {
    const refund = await getStripe().refunds.create(
      { payment_intent: payment.paymentIntentId },
      { idempotencyKey: `refund-${payment._id}` }
    );
    refundId = refund.id;
  }
  payment.status = "refunded";
  payment.refundedAt = new Date();
  payment.refundId = refundId;
  await payment.save();
  return refundId;
};

/**
 * Refund the paid payment of a booking (Stripe or PayPal).
 * Returns true on success, false if nothing to refund or the provider failed.
 */
export const refundBookingPayment = async (booking) => {
  const payment = await Payment.findOne({ booking: booking._id, status: "paid" }).sort({ paidAt: -1 });
  if (!payment?.paymentIntentId) return false;
  if (payment.provider === "paypal" ? !isPayPalConfigured() : !isPaymentConfigured()) return false;

  try {
    await refundPaymentRecord(payment);

    booking.set("payment.status", "refunded");
    booking.set("payment.refundedAt", payment.refundedAt);
    return true;
  } catch (error) {
    console.error(`Automatic refund failed for ${booking.reference}:`, error.message);
    return false;
  }
};
