// Personal welcome codes: one unique code per verified customer, sent by
// email after signup and shown in the account. Only the owner can use it,
// once (state changes are atomic conditional updates).
import { randomInt } from "node:crypto";

import PersonalCode from "../models/personal-code.model.js";
import Promotion from "../models/promotion.model.js";
import { DAY_MS } from "../utils/helpers.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const PERSONAL_CODE_RE = /^FX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/** "fx 7kq2m9tp" → "FX-7KQ2-M9TP" (null if it is not a personal code) */
export const normalizePersonalCode = (input) => {
  const raw = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!raw.startsWith("FX") || raw.length !== 10) return null;
  const code = `FX-${raw.slice(2, 6)}-${raw.slice(6)}`;
  return PERSONAL_CODE_RE.test(code) ? code : null;
};

const randomCode = () => {
  const c = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `FX-${c.slice(0, 4)}-${c.slice(4)}`;
};

const isLive = (p, now = new Date()) =>
  p.active && (!p.startsAt || p.startsAt <= now) && (!p.endsAt || p.endsAt > now);

/** The live welcome promotion, or null */
export const liveWelcomePromotion = async () => {
  const promo = await Promotion.findOne({ kind: "welcome", active: true }).lean();
  return promo && isLive(promo) ? promo : null;
};

/**
 * The customer's personal code for a promotion – created on first call
 * (idempotent: a customer never gets a second code for the same promotion).
 */
export const issuePersonalCode = async (promotion, user) => {
  const existing = await PersonalCode.findOne({ promotion: promotion._id, customer: user._id });
  if (existing) return { code: existing, created: false };

  const validDays = promotion.codeValidityDays ?? 90;
  let expiresAt = new Date(Date.now() + validDays * DAY_MS);
  if (promotion.endsAt && promotion.endsAt < expiresAt) expiresAt = promotion.endsAt;

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const code = await PersonalCode.create({ promotion: promotion._id, customer: user._id, code: randomCode(), expiresAt });
      return { code, created: true };
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Same customer issued in parallel → return that one; otherwise code collision → retry
      const raced = await PersonalCode.findOne({ promotion: promotion._id, customer: user._id });
      if (raced) return { code: raced, created: false };
    }
  }
  throw new Error("Could not generate a unique personal code.");
};

/** Welcome code of a verified customer (issued lazily for older accounts) */
export const welcomeCodeFor = async (user) => {
  if (user?.role !== "consumer" || !user.emailVerified) return null;
  const promo = await liveWelcomePromotion();
  if (!promo) return null;
  const { code } = await issuePersonalCode(promo, user);
  return { promo, code };
};

/** Every minute: mark unused codes whose validity is over */
export const expirePersonalCodes = () =>
  PersonalCode.updateMany({ status: "issued", expiresAt: { $ne: null, $lte: new Date() } }, { $set: { status: "expired" } });

// ---- state changes (atomic) ----

export const reservePersonalCode = (codeId, customerId, bookingId) =>
  PersonalCode.findOneAndUpdate(
    {
      _id: codeId,
      customer: customerId,
      status: "issued",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    },
    { $set: { status: "reserved", booking: bookingId } },
    { returnDocument: "after" }
  );

export const usePersonalCodeForBooking = (bookingId) =>
  PersonalCode.updateOne({ booking: bookingId, status: "reserved" }, { $set: { status: "used", usedAt: new Date() } });

/** Booking cancelled/expired before the cleaning → code can be used again (unless expired meanwhile) */
export const releasePersonalCodeForBooking = (bookingId) =>
  PersonalCode.updateOne({ booking: bookingId, status: { $in: ["reserved", "used"] } }, [
    {
      $set: {
        status: { $cond: [{ $and: [{ $ne: ["$expiresAt", null] }, { $lte: ["$expiresAt", "$$NOW"] }] }, "expired", "issued"] },
        booking: null,
        usedAt: null,
      },
    },
  ], { updatePipeline: true });

/** Late payment after a hold expired → take the code back */
export const reacquirePersonalCodeForBooking = async (bookingId, codeValue) => {
  if (!codeValue) return true;
  const res = await PersonalCode.updateOne(
    { code: codeValue, status: "issued", $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
    { $set: { status: "reserved", booking: bookingId } }
  );
  return res.modifiedCount === 1;
};
