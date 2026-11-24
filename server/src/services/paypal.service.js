// PayPal Orders v2 (REST, no SDK).
//   PAYPAL_MODE=live → live API with PAYPAL_CLIENT_ID + PAYPAL_SECRET_KEY (real money)
//   otherwise        → sandbox API with PAYPALAPIKEY + PAYPALSECRET_KEY (test money)
// Live keys are never used unless PAYPAL_MODE=live is set explicitly.
import Payment from "../models/payment.model.js";
import { findService } from "../data/catalogue.js";
import { OPERATIONS } from "../config/pricing.js";
import { httpError, slotLabel } from "../utils/helpers.js";

const LOCALES = { de: "de-DE", en: "en-GB", pl: "pl-PL" };
export const ORDER_LIFETIME_MINUTES = 30;

export const isPayPalLive = () => process.env.PAYPAL_MODE === "live";

const credentials = () =>
  isPayPalLive()
    ? { id: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_SECRET_KEY }
    : { id: process.env.PAYPALAPIKEY, secret: process.env.PAYPALSECRET_KEY };

export const isPayPalConfigured = () => {
  const { id, secret } = credentials();
  return Boolean(id && secret);
};

const apiBase = () =>
  (process.env.PAYPAL_API_BASE ||
    (isPayPalLive() ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com")
  ).replace(/\/$/, "");

let cachedToken = null; // { value, expiresAt }

const accessToken = async () => {
  if (!isPayPalConfigured()) throw httpError(503, "PayPal is not configured.");
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials().id}:${credentials().secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw Object.assign(new Error(`PayPal auth failed (${res.status})`), { paypal: true });
  const body = await res.json();
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
};

/** Call the PayPal API. Returns { status, body }. */
export const paypalRequest = async (method, path, body, requestId) => {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(requestId && { "PayPal-Request-Id": requestId }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
};

const paypalError = (label, response) =>
  Object.assign(new Error(`${label}: ${response.status} ${response.body?.name ?? ""} ${response.body?.details?.[0]?.issue ?? ""}`.trim()), {
    paypal: true,
    issue: response.body?.details?.[0]?.issue,
  });

export const centsToValue = (cents) => (cents / 100).toFixed(2);

/**
 * Create a PayPal order. Returns { orderId, url }.
 * Generic: used for bookings and gift card purchases.
 */
export const createPayPalOrder = async ({ referenceId, invoiceId, description, amountCents, locale = "de", returnUrl, cancelUrl, requestKey }) => {
  const response = await paypalRequest(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: referenceId,
          custom_id: referenceId,
          ...(invoiceId && { invoice_id: invoiceId }),
          description: String(description).slice(0, 127),
          amount: { currency_code: "EUR", value: centsToValue(amountCents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Fiduxa",
            locale: LOCALES[locale] ?? "de-DE",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
      },
    },
    requestKey
  );
  if (response.status >= 300) throw paypalError("PayPal order failed", response);
  const order = response.body;
  const url = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!url) throw paypalError("PayPal order without approval link", response);
  return { orderId: order.id, url };
};

/**
 * Create (or reuse) a PayPal order for a booking. Returns { url, reused }.
 * Does NOT save the booking.
 */
export const createPayPalOrderForBooking = async (booking, customerId, { amountCents, siteUrl }) => {
  const open = await Payment.findOne({
    booking: booking._id,
    provider: "paypal",
    status: "created",
    amountCents,
    expiresAt: { $gt: new Date(Date.now() + 2 * 60 * 1000) },
  }).sort({ createdAt: -1 });
  if (open?.checkoutUrl) return { url: open.checkoutUrl, reused: true };

  const locale = booking.locale || "de";
  const service = findService(booking.serviceId);
  const appointment = `${new Date(booking.preferredDate).toLocaleDateString("de-DE", { timeZone: "UTC" })}, ${slotLabel(booking.slot, booking.slotEnd)}`;

  const { orderId, url } = await createPayPalOrder({
    referenceId: String(booking._id),
    // Unique per attempt: PayPal refuses a second capture with the same invoice id
    invoiceId: `${booking.reference}-${Date.now().toString(36)}`,
    description: `${(locale === "de" ? service?.name : service?.nameEn) ?? "Cleaning"} – ${booking.reference} – ${appointment}`,
    amountCents,
    locale,
    returnUrl: `${siteUrl}/zahlung/paypal?booking=${booking._id}`,
    cancelUrl: `${siteUrl}/zahlung/${booking._id}?abgebrochen=1`,
    requestKey: `order-${booking._id}-${amountCents}-${Math.floor(Date.now() / 60000)}`,
  });

  await Payment.updateOne(
    { checkoutSessionId: orderId },
    {
      $setOnInsert: {
        purpose: "booking",
        booking: booking._id,
        customer: customerId,
        provider: "paypal",
        checkoutSessionId: orderId,
        amountCents,
        currency: "EUR",
        status: "created",
        checkoutUrl: url,
        expiresAt: new Date(Date.now() + ORDER_LIFETIME_MINUTES * 60 * 1000),
      },
    },
    { upsert: true }
  );

  booking.set("payment.method", "paypal");
  booking.set("payment.amountCents", amountCents);
  booking.set("payment.checkoutSessionId", orderId);
  if (booking.status === "payment_pending") {
    const minHold = new Date(Date.now() + OPERATIONS.holdMinutes * 60 * 1000);
    if (!booking.holdExpiresAt || booking.holdExpiresAt < minHold) booking.holdExpiresAt = minHold;
  }

  return { url, reused: false };
};

/**
 * Capture an approved order. Returns { status: "COMPLETED"|"PENDING"|..., captureId, amountCents, currency }.
 */
export const capturePayPalOrder = async (orderId) => {
  let response = await paypalRequest("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, `capture-${orderId}`);

  if (response.status === 422 && response.body?.details?.[0]?.issue === "ORDER_ALREADY_CAPTURED") {
    response = await paypalRequest("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }
  if (response.status >= 300) throw paypalError("PayPal capture failed", response);

  const capture = response.body.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) {
    return { status: response.body.status ?? "UNKNOWN", captureId: null, amountCents: null, currency: null };
  }
  return {
    status: capture.status,
    captureId: capture.id,
    amountCents: Math.round(Number(capture.amount?.value) * 100),
    currency: capture.amount?.currency_code,
  };
};

/** Full refund of a capture. Returns the refund id. */
export const refundPayPalCapture = async (captureId, paymentId) => {
  const response = await paypalRequest(
    "POST",
    `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    {},
    `refund-${paymentId}`
  );
  if (response.status >= 300) throw paypalError("PayPal refund failed", response);
  return response.body.id;
};
