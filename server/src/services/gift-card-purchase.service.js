// Buying a gift card: create (pending) → pay (PayPal / Stripe) → activate → email.
import GiftCard from "../models/gift-card.model.js";
import Payment from "../models/payment.model.js";
import User from "../models/user.model.js";
import { GIFT_CARDS } from "../config/pricing.js";
import { getSiteUrl } from "../utils/site-url.js";
import { httpError } from "../utils/helpers.js";
import GiftCardTransaction from "../models/gift-card-transaction.model.js";
import { activateGiftCard, expiryFor, generateGiftCardCode } from "./gift-card.service.js";
import { recordAudit } from "./audit.service.js";
import { assertMethodEnabled, availableMethods, createStripeSession } from "./payment.service.js";
import { createPayPalOrder, ORDER_LIFETIME_MINUTES } from "./paypal.service.js";
import {
  sendAdminNotificationEmail,
  sendGiftCardEmail,
  sendGiftCardPurchaseEmail,
  trySend,
} from "./email.service.js";

const PENDING_MINUTES = 60;

export const allowedAmount = (cents) =>
  GIFT_CARDS.presetAmountsCents.includes(cents) ||
  (Number.isInteger(cents) && cents >= GIFT_CARDS.minCustomCents && cents <= GIFT_CARDS.maxCustomCents && cents % 100 === 0);

/** Create a pending gift card for the logged-in buyer */
export const createGiftCardPurchase = async (user, data) => {
  if (!GIFT_CARDS.enabled) throw httpError(503, "Gift cards are not available at the moment.");
  if (!allowedAmount(data.amountCents)) throw httpError(422, "Please choose a valid gift card amount.");
  assertMethodEnabled(data.method); // payment-method policy (currently PayPal only)
  if (availableMethods().length === 0) {
    throw httpError(503, "Online payment is not configured yet. Please contact us to pay by invoice.");
  }
  return GiftCard.create({
    code: await generateGiftCardCode(),
    status: "pending_payment",
    initialCents: data.amountCents,
    balanceCents: 0,
    purchaser: user._id,
    senderName: data.senderName,
    senderEmail: user.email,
    recipientName: data.recipientName,
    recipientEmail: data.recipientEmail.toLowerCase(),
    message: data.message,
    design: data.design,
    locale: data.locale,
    deliverAt: data.deliverAt,
    pendingExpiresAt: new Date(Date.now() + PENDING_MINUTES * 60 * 1000),
  });
};

/** Start the payment for a pending card. Returns { url }. */
export const startGiftCardPayment = async (card, user, method) => {
  assertMethodEnabled(method);
  const methods = availableMethods();
  const chosen = methods.includes(method) ? method : methods[0];
  if (!chosen) throw httpError(503, "Online payment is not configured yet. Please contact us to pay by invoice.");

  const site = getSiteUrl();
  const label = `Fiduxa Gutschein ${(card.initialCents / 100).toFixed(2)} €`;
  let sessionId;
  let url;
  let expiresAt;

  if (chosen === "paypal") {
    ({ orderId: sessionId, url } = await createPayPalOrder({
      referenceId: String(card._id),
      invoiceId: `GC-${card._id}-${Date.now().toString(36)}`,
      description: `${label} für ${card.recipientName}`,
      amountCents: card.initialCents,
      locale: card.locale,
      returnUrl: `${site}/gutscheine/bezahlt?card=${card._id}&provider=paypal`,
      cancelUrl: `${site}/gutscheine?abgebrochen=1`,
      requestKey: `gc-${card._id}-${Math.floor(Date.now() / 60000)}`,
    }));
    expiresAt = new Date(Date.now() + ORDER_LIFETIME_MINUTES * 60 * 1000);
  } else {
    ({ sessionId, url, expiresAt } = await createStripeSession({
      amountCents: card.initialCents,
      name: label,
      description: `Für ${card.recipientName}`,
      email: user.email,
      locale: card.locale,
      metadata: { giftCardId: String(card._id), purpose: "gift_card" },
      successUrl: `${site}/gutscheine/bezahlt?card=${card._id}&provider=stripe`,
      cancelUrl: `${site}/gutscheine?abgebrochen=1`,
      idempotencyKey: `gc-${card._id}-${Math.floor(Date.now() / 60000)}`,
    }));
  }

  // Upsert: a retry within the same minute gets the same provider order back
  // (idempotency key) – reuse it instead of failing on the unique session id.
  await Payment.updateOne(
    { checkoutSessionId: sessionId },
    {
      $setOnInsert: {
        purpose: "gift_card",
        giftCard: card._id,
        customer: user._id,
        provider: chosen,
        checkoutSessionId: sessionId,
        amountCents: card.initialCents,
        currency: "EUR",
        status: "created",
        checkoutUrl: url,
        expiresAt,
      },
    },
    { upsert: true }
  );
  card.set("payment.method", chosen);
  card.set("payment.checkoutSessionId", sessionId);
  card.pendingExpiresAt = new Date(Date.now() + PENDING_MINUTES * 60 * 1000);
  await card.save();
  return { url, method: chosen };
};

/** Send the card to the recipient (now or at deliverAt). Idempotent. */
export const deliverGiftCard = async (cardId) => {
  const card = await GiftCard.findOneAndUpdate(
    { _id: cardId, status: { $in: ["active", "redeemed"] }, deliveryStatus: "pending" },
    { $set: { deliveryStatus: "sent", deliveredAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!card) return false;
  const status = await trySend("Gift card", () => sendGiftCardEmail(card));
  if (status !== "sent") await GiftCard.updateOne({ _id: card._id }, { $set: { deliveryStatus: "failed" } });
  return status === "sent";
};

/** Payment record for a gift card is paid → activate, email buyer + recipient */
export const activatePaidGiftCard = async (payment) => {
  const card = await activateGiftCard(payment.giftCard, { method: payment.provider, sessionId: payment.checkoutSessionId });
  if (!card) return null; // already active (webhook retry)

  const now = new Date();
  const dueNow = !card.deliverAt || card.deliverAt <= now;
  if (dueNow) await deliverGiftCard(card._id);

  const buyer = await User.findById(card.purchaser).select("name email");
  if (buyer) {
    await trySend("Gift card purchase", () =>
      sendGiftCardPurchaseEmail({ card, to: buyer.email, name: buyer.name, delivered: dueNow })
    );
  }
  await trySend("Admin notification", () =>
    sendAdminNotificationEmail({
      subject: `Gutschein verkauft: ${(card.initialCents / 100).toFixed(2)} €`,
      lines: [`Code: ${card.code}`, `Käufer: ${buyer?.email ?? "-"}`, `Empfänger: ${card.recipientEmail}`],
    })
  );
  return card;
};

/** Every minute: send scheduled gift cards whose delivery date has come */
export const deliverDueGiftCards = async () => {
  const due = await GiftCard.find({
    status: { $in: ["active", "redeemed"] },
    deliveryStatus: "pending",
    deliverAt: { $ne: null, $lte: new Date() },
  })
    .select("_id")
    .limit(100)
    .lean();
  let sent = 0;
  for (const { _id } of due) if (await deliverGiftCard(_id)) sent += 1;
  return sent;
};

/**
 * Gift card issued by the office free of charge (goodwill, complaint remedy).
 * Creates the card + "issue" transaction, emails it (optional) and audits it.
 */
export const issueAdminGiftCard = async ({ amountCents, recipientName, recipientEmail, message = "", reason, locale = "de", sendEmail = true, actorId, audit = {} }) => {
  const now = new Date();
  const card = await GiftCard.create({
    code: await generateGiftCardCode(),
    status: "active",
    initialCents: amountCents,
    balanceCents: amountCents,
    senderName: "Fiduxa",
    recipientName,
    recipientEmail: recipientEmail.toLowerCase(),
    message,
    locale,
    payment: { method: "admin", paidAt: now, payable: false },
    expiresAt: expiryFor(now),
    issuedBy: actorId,
    deliveryStatus: sendEmail ? "pending" : "sent",
  });
  await GiftCardTransaction.create({
    giftCard: card._id,
    type: "issue",
    amountCents,
    balanceAfterCents: amountCents,
    actor: actorId,
    note: reason,
    idempotencyKey: `issue:${card._id}`,
  });
  if (sendEmail) await deliverGiftCard(card._id);
  await recordAudit({ actor: actorId, action: "giftcard.issued", entityType: "GiftCard", entityId: card._id, after: { amountCents, reason, ...audit } });
  return GiftCard.findById(card._id);
};
