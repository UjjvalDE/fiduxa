// Gift cards = prepaid money. Every balance change is one atomic MongoDB
// update guarded by a condition (no double spending), recorded in the
// GiftCardTransaction ledger with an idempotency key.
import { randomInt } from "node:crypto";

import GiftCard from "../models/gift-card.model.js";
import GiftCardTransaction from "../models/gift-card-transaction.model.js";
import { GIFT_CARDS } from "../config/pricing.js";
import { httpError } from "../utils/helpers.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export const generateGiftCardCode = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    const code = `FIDX-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
    if (!(await GiftCard.exists({ code }))) return code;
  }
  throw new Error("Could not generate a unique gift card code.");
};

/** "fidx 7kq2m9tp4wxc" → "FIDX-7KQ2-M9TP-4WXC" */
export const normalizeGiftCardCode = (input) => {
  const raw = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = raw.startsWith("FIDX") ? raw.slice(4) : raw;
  if (body.length !== 12) return null;
  return `FIDX-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}`;
};

export const maskCode = (code) => `FIDX-••••-••••-${String(code).slice(-4)}`;

/** End of the year N years after purchase (§ 195/199 BGB style validity) */
export const expiryFor = (date = new Date(), years = GIFT_CARDS.validityYears) =>
  new Date(Date.UTC(date.getUTCFullYear() + years, 11, 31, 22, 59, 59));

/**
 * Usable card for a code, or { reason }.
 * reasons: invalid, not_found, not_active, disabled, expired, empty
 */
export const findUsableGiftCard = async (input) => {
  const code = normalizeGiftCardCode(input);
  if (!code) return { reason: "invalid" };
  const card = await GiftCard.findOne({ code }).lean();
  if (!card) return { reason: "not_found", code };
  if (card.status === "disabled") return { reason: "disabled", code };
  if (card.status === "expired" || (card.expiresAt && card.expiresAt <= new Date())) return { reason: "expired", code };
  if (!["active", "redeemed"].includes(card.status)) return { reason: "not_active", code };
  if (card.balanceCents <= 0) return { reason: "empty", code };
  return { card, code };
};

const ledger = async (entry) => {
  try {
    await GiftCardTransaction.create(entry);
    return true;
  } catch (error) {
    if (error.code === 11000) return false; // already recorded (idempotent retry)
    throw error;
  }
};

/** Take `amountCents` from a card for a booking. Throws 409 if not possible. */
export const reserveGiftCardAmount = async ({ cardId, bookingId, amountCents, actor, attempt = 0 }) => {
  const updated = await GiftCard.findOneAndUpdate(
    {
      _id: cardId,
      status: "active",
      balanceCents: { $gte: amountCents },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    },
    { $inc: { balanceCents: -amountCents } },
    { returnDocument: "after" }
  );
  if (!updated) throw httpError(409, "The gift card balance has changed. Please check the price again.");

  const recorded = await ledger({
    giftCard: cardId,
    type: "reserve",
    amountCents: -amountCents,
    balanceAfterCents: updated.balanceCents,
    booking: bookingId,
    actor,
    idempotencyKey: `reserve:${cardId}:${bookingId}:${attempt}`,
  });
  if (!recorded) {
    // Same booking reserved twice (retry) → give the second deduction back
    await GiftCard.updateOne({ _id: cardId }, { $inc: { balanceCents: amountCents } });
  }
  return updated;
};

/** Credit an amount back (booking cancelled/expired). Idempotent per card+booking. */
export const releaseGiftCardAmount = async ({ cardId, bookingId, amountCents, actor, type = "release", note = "", attempt = 0 }) => {
  const key = `release:${cardId}:${bookingId}:${attempt}`;
  const first = await ledger({
    giftCard: cardId,
    type,
    amountCents,
    balanceAfterCents: -1, // fixed below
    booking: bookingId,
    actor,
    note,
    idempotencyKey: key,
  });
  if (!first) return false;
  const card = await GiftCard.findOneAndUpdate(
    { _id: cardId },
    [
      {
        $set: {
          balanceCents: { $add: ["$balanceCents", amountCents] },
          status: { $cond: [{ $eq: ["$status", "redeemed"] }, "active", "$status"] },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true }
  );
  await GiftCardTransaction.updateOne(
    { idempotencyKey: key },
    { $set: { balanceAfterCents: card?.balanceCents ?? 0 } }
  );
  return true;
};

/** Booking paid/confirmed → reservation is final; empty cards become "redeemed" */
export const captureGiftCardAmount = async ({ cardId, bookingId, amountCents, attempt = 0 }) => {
  const card = await GiftCard.findById(cardId).lean();
  await ledger({
    giftCard: cardId,
    type: "capture",
    amountCents: 0,
    balanceAfterCents: card?.balanceCents ?? 0,
    booking: bookingId,
    note: `Redeemed ${(amountCents / 100).toFixed(2)} €`,
    idempotencyKey: `capture:${cardId}:${bookingId}:${attempt}`,
  });
  await GiftCard.updateOne({ _id: cardId, status: "active", balanceCents: 0 }, { $set: { status: "redeemed" } });
};

/** Admin correction with reason (support cases). Returns the updated card. */
export const adjustGiftCardBalance = async ({ cardId, amountCents, actor, note }) => {
  const filter = { _id: cardId, ...(amountCents < 0 && { balanceCents: { $gte: -amountCents } }) };
  const card = await GiftCard.findOneAndUpdate(
    filter,
    [
      {
        $set: {
          balanceCents: { $add: ["$balanceCents", amountCents] },
          status: {
            $cond: [
              { $and: [{ $eq: ["$status", "redeemed"] }, { $gt: [{ $add: ["$balanceCents", amountCents] }, 0] }] },
              "active",
              "$status",
            ],
          },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true }
  );
  if (!card) throw httpError(409, "The balance cannot go below zero.");
  await ledger({ giftCard: cardId, type: "adjust", amountCents, balanceAfterCents: card.balanceCents, actor, note });
  return card;
};

/** Purchase paid → activate. Idempotent. Returns the card if newly activated. */
export const activateGiftCard = async (cardId, { method, sessionId }) => {
  const now = new Date();
  const card = await GiftCard.findOneAndUpdate(
    { _id: cardId, status: { $in: ["pending_payment", "cancelled"] } },
    [
      {
        $set: {
          status: "active",
          balanceCents: "$initialCents",
          "payment.method": method,
          "payment.paidAt": now,
          "payment.checkoutSessionId": sessionId,
          pendingExpiresAt: null,
          expiresAt: expiryFor(now),
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true }
  );
  if (!card) return null;
  await ledger({
    giftCard: card._id,
    type: "purchase",
    amountCents: card.initialCents,
    balanceAfterCents: card.balanceCents,
    actor: card.purchaser,
    idempotencyKey: `purchase:${card._id}`,
  });
  return card;
};

/** Housekeeping (every minute): drop unpaid purchases, expire old cards */
export const expireGiftCards = async () => {
  const now = new Date();
  await GiftCard.updateMany(
    { status: "pending_payment", pendingExpiresAt: { $ne: null, $lte: now } },
    { $set: { status: "cancelled" } }
  );
  const expired = await GiftCard.find({ status: { $in: ["active", "redeemed"] }, expiresAt: { $ne: null, $lte: now } }).limit(200);
  for (const card of expired) {
    const remaining = card.balanceCents;
    card.status = "expired";
    card.balanceCents = 0;
    await card.save();
    await ledger({
      giftCard: card._id,
      type: "expire",
      amountCents: -remaining,
      balanceAfterCents: 0,
      idempotencyKey: `expire:${card._id}`,
    });
  }
  return expired.length;
};
