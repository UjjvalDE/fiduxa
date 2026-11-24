// Promotions: automatic welcome offer, seasonal campaigns and coupon codes.
// All discount maths happens here (server side). One promotional discount
// per booking – the best eligible one wins. Gift cards are NOT discounts.
import Promotion from "../models/promotion.model.js";
import PromotionRedemption from "../models/promotion-redemption.model.js";
import Booking from "../models/booking.model.js";
import Settings from "../models/settings.model.js";
import { fingerprintOf } from "../utils/identity.js";
import PersonalCode from "../models/personal-code.model.js";
import {
  normalizePersonalCode,
  reacquirePersonalCodeForBooking,
  releasePersonalCodeForBooking,
  reservePersonalCode,
  usePersonalCodeForBooking,
} from "./personal-code.service.js";
import { httpError } from "../utils/helpers.js";

const ACTIVE_REDEMPTION = ["reserved", "applied"];
const PRIOR_BOOKING_STATUSES = ["confirmed", "in_progress", "completed"];

export const normalizeCode = (code) =>
  String(code || "").trim().toUpperCase().replace(/\s+/g, "");

export const isLive = (promo, now = new Date()) =>
  promo.active &&
  (!promo.startsAt || promo.startsAt <= now) &&
  (!promo.endsAt || promo.endsAt > now);

/** Discount in cents for an order amount (never more than the order) */
export const computeDiscount = (promo, orderCents) => {
  if (orderCents <= 0) return 0;
  let cents =
    promo.discountType === "percent"
      ? Math.round((orderCents * Math.min(100, promo.discountValue)) / 100)
      : Math.round(promo.discountValue);
  if (promo.maxDiscountCents != null) cents = Math.min(cents, promo.maxDiscountCents);
  return Math.max(0, Math.min(cents, orderCents));
};

/** Has the customer had a real (confirmed/started/completed) booking before? */
const hasPriorBooking = async (userId, excludeBookingId) =>
  Boolean(
    await Booking.exists({
      customer: userId,
      status: { $in: PRIOR_BOOKING_STATUSES },
      ...(excludeBookingId && { _id: { $ne: excludeBookingId } }),
    })
  );

/** Another account already used the welcome offer with the same phone/email/address? */
const welcomeUsedElsewhere = async (userId, contact) => {
  const fp = fingerprintOf(contact);
  const or = [
    fp.email && { "fingerprint.email": fp.email },
    fp.phone && { "fingerprint.phone": fp.phone },
    fp.address && { "fingerprint.address": fp.address },
  ].filter(Boolean);
  if (or.length === 0) return false;
  return Boolean(
    await PromotionRedemption.exists({
      kind: "welcome",
      status: { $in: ACTIVE_REDEMPTION },
      customer: { $ne: userId },
      $or: or,
    })
  );
};

/**
 * Check one promotion for a customer/order. Returns { ok, reason, discountCents }.
 * reasons: inactive, not_started, expired, service, min_order, limit_reached,
 *          login_required, verify_email, first_booking_only, already_used
 */
export const checkPromotion = async (promo, { user, serviceId, orderCents, contact, excludeBookingId, now = new Date() }) => {
  const fail = (reason) => ({ ok: false, reason, discountCents: 0 });
  if (!promo.active) return fail("inactive");
  if (promo.startsAt && promo.startsAt > now) return fail("not_started");
  if (promo.endsAt && promo.endsAt <= now) return fail("expired");
  if (promo.services?.length && !promo.services.includes(serviceId)) return fail("service");
  if (orderCents < (promo.minOrderCents || 0)) return fail("min_order");
  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) return fail("limit_reached");

  const needsUser = promo.kind === "welcome" || promo.firstBookingOnly || promo.requiresVerifiedEmail || promo.perCustomerLimit;
  if (needsUser && !user) return fail("login_required");
  if (user) {
    if ((promo.requiresVerifiedEmail || promo.kind === "welcome") && !user.emailVerified) return fail("verify_email");
    if ((promo.kind === "welcome" || promo.firstBookingOnly) && (await hasPriorBooking(user._id, excludeBookingId))) {
      return fail("first_booking_only");
    }
    const used = await PromotionRedemption.countDocuments({
      promotion: promo._id,
      customer: user._id,
      status: { $in: ACTIVE_REDEMPTION },
      ...(excludeBookingId && { booking: { $ne: excludeBookingId } }),
    });
    if (used >= (promo.perCustomerLimit || 1)) return fail("already_used");
    if (promo.kind === "welcome" && contact && (await welcomeUsedElsewhere(user._id, contact))) {
      return fail("already_used");
    }
  }

  const discountCents = computeDiscount(promo, orderCents);
  if (discountCents <= 0) return fail("min_order");
  return { ok: true, reason: null, discountCents };
};

const promoSummary = (promo, discountCents) => ({
  id: promo._id,
  kind: promo.kind,
  name: promo.name,
  code: promo.code,
  discountType: promo.discountType,
  discountValue: promo.discountValue,
  discountCents,
  title: promo.display?.title,
});

/**
 * Check a personal code (e.g. the welcome code FX-XXXX-XXXX).
 * Extra reasons: not_yours (someone else's code), expired, already_used.
 */
const checkPersonalCode = async (code, ctx) => {
  const fail = (reason) => ({ ok: false, reason, discountCents: 0 });
  const personal = await PersonalCode.findOne({ code }).lean();
  if (!personal) return { ...fail("not_found") };
  if (!ctx.user) return fail("login_required");
  if (String(personal.customer) !== String(ctx.user._id)) return fail("not_yours");
  const reservedForThis = personal.status === "reserved" && ctx.excludeBookingId && String(personal.booking) === String(ctx.excludeBookingId);
  if (personal.status === "expired" || (personal.expiresAt && personal.expiresAt <= ctx.now)) return fail("expired");
  if (personal.status === "revoked") return fail("inactive");
  if (personal.status !== "issued" && !reservedForThis) return fail("already_used");
  const promo = await Promotion.findById(personal.promotion).lean();
  if (!promo) return fail("not_found");
  const result = await checkPromotion(promo, ctx);
  return { ...result, promo, personal };
};

/**
 * Pick the best promotion for an order: automatic campaigns and the entered
 * code (coupon, campaign code or the customer's personal welcome code) compete
 * – the highest discount wins (no stacking).
 */
export const findBestPromotion = async ({ user, serviceId, orderCents, code, contact, excludeBookingId }) => {
  const now = new Date();
  const ctx = { user, serviceId, orderCents, contact, excludeBookingId, now };
  const normalized = normalizeCode(code);

  const automatic = await Promotion.find({ active: true, kind: "campaign", code: null }).lean();
  const candidates = [];
  for (const promo of automatic) {
    if (!isLive(promo, now)) continue;
    const result = await checkPromotion(promo, ctx);
    if (result.ok) candidates.push({ promo, discountCents: result.discountCents });
  }

  // Welcome offer: needs the customer's personal code (sent by email after signup)
  let welcome = null;
  const welcomePromo = await Promotion.findOne({ kind: "welcome", active: true }).lean();
  if (welcomePromo && isLive(welcomePromo, now)) {
    const result = await checkPromotion(welcomePromo, ctx);
    const own = user ? await PersonalCode.findOne({ promotion: welcomePromo._id, customer: user._id }).lean() : null;
    const ownUsable = own && (own.status === "issued" || (own.status === "reserved" && excludeBookingId && String(own.booking) === String(excludeBookingId))) && (!own.expiresAt || own.expiresAt > now);
    welcome = {
      eligible: result.ok && Boolean(ownUsable),
      reason: !result.ok ? result.reason : !own ? "code_pending" : ownUsable ? null : own.status === "expired" || (own.expiresAt && own.expiresAt <= now) ? "expired" : "already_used",
      discountType: welcomePromo.discountType,
      discountValue: welcomePromo.discountValue,
      discountCents: result.ok ? result.discountCents : computeDiscount(welcomePromo, orderCents),
      // The owner's own code (only ever returned to its owner) so the checkout can offer "apply"
      code: ownUsable ? own.code : null,
      codeExpiresAt: ownUsable ? own.expiresAt : null,
    };
  }

  let codeResult = null;
  if (normalized) {
    const personalCode = normalizePersonalCode(normalized);
    if (personalCode) {
      const result = await checkPersonalCode(personalCode, ctx);
      codeResult = { code: personalCode, ok: result.ok, reason: result.reason, discountCents: result.discountCents, name: result.promo?.name, personal: true };
      if (result.ok) candidates.push({ promo: result.promo, discountCents: result.discountCents, viaCode: true, personal: result.personal });
    } else {
      const promo = await Promotion.findOne({ code: normalized }).lean();
      if (!promo) codeResult = { code: normalized, ok: false, reason: "not_found", discountCents: 0 };
      else {
        const result = await checkPromotion(promo, ctx);
        codeResult = { code: normalized, ...result, name: promo.name };
        if (result.ok) candidates.push({ promo, discountCents: result.discountCents, viaCode: true });
      }
    }
  }

  candidates.sort((a, b) => b.discountCents - a.discountCents || (b.viaCode ? 1 : 0) - (a.viaCode ? 1 : 0));
  const best = candidates[0] ?? null;
  if (codeResult?.ok && best && !best.viaCode) codeResult.superseded = true; // a better automatic offer applies

  return {
    applied: best
      ? {
          ...promoSummary(best.promo, best.discountCents),
          ...(best.personal && { code: best.personal.code, personalCodeId: best.personal._id }),
          promo: best.promo,
        }
      : null,
    codeResult,
    welcome,
  };
};

/**
 * Reserve a promotion for a new booking (call inside the customer lock).
 * Re-checks eligibility and atomically counts the use against usageLimit.
 */
export const reservePromotion = async (promo, { user, bookingId, discountCents, orderCents, contact, serviceId, personalCodeId, code }) => {
  // Personal code: atomically take it (single use, owner only)
  if (personalCodeId) {
    const taken = await reservePersonalCode(personalCodeId, user._id, bookingId);
    if (!taken) throw httpError(409, "This offer is no longer available. Please check the price again.");
  }
  try {
    return await reservePromotionInner(promo, { user, bookingId, discountCents, orderCents, contact, serviceId, code });
  } catch (error) {
    if (personalCodeId) await releasePersonalCodeForBooking(bookingId);
    throw error;
  }
};

const reservePromotionInner = async (promo, { user, bookingId, discountCents, orderCents, contact, serviceId, code }) => {
  const fresh = await Promotion.findById(promo._id).lean();
  const check = fresh && (await checkPromotion(fresh, { user, serviceId, orderCents, contact, excludeBookingId: bookingId }));
  if (!check?.ok || check.discountCents !== discountCents) {
    throw httpError(409, "This offer is no longer available. Please check the price again.");
  }
  const counted = await Promotion.findOneAndUpdate(
    {
      _id: promo._id,
      ...(fresh.usageLimit != null && { usedCount: { $lt: fresh.usageLimit } }),
    },
    { $inc: { usedCount: 1 } },
    { returnDocument: "after" }
  );
  if (!counted) throw httpError(409, "This offer is no longer available. Please check the price again.");

  try {
    return await PromotionRedemption.create({
      promotion: promo._id,
      kind: fresh.kind,
      code: code ?? fresh.code,
      customer: user._id,
      booking: bookingId,
      discountCents,
      orderCents,
      fingerprint: fingerprintOf(contact ?? {}),
    });
  } catch (error) {
    await Promotion.updateOne({ _id: promo._id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    throw error;
  }
};

/** Booking confirmed/paid → the reservation becomes final */
export const applyPromotionForBooking = async (bookingId) => {
  await PromotionRedemption.updateOne(
    { booking: bookingId, status: "reserved" },
    { $set: { status: "applied", appliedAt: new Date() } }
  );
  await usePersonalCodeForBooking(bookingId);
};

/** Booking cancelled/expired before completion → offer can be used again */
export const releasePromotionForBooking = async (bookingId) => {
  const redemption = await PromotionRedemption.findOneAndUpdate(
    { booking: bookingId, status: { $in: ACTIVE_REDEMPTION } },
    { $set: { status: "released", releasedAt: new Date() } }
  );
  if (redemption) {
    await Promotion.updateOne({ _id: redemption.promotion, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
  }
  await releasePersonalCodeForBooking(bookingId);
  return Boolean(redemption);
};

/** Re-take a released promotion (late payment after a hold expired). */
export const reacquirePromotionForBooking = async (bookingId) => {
  const redemption = await PromotionRedemption.findOne({ booking: bookingId, status: "released" });
  if (!redemption) return true;
  const promo = await Promotion.findOneAndUpdate(
    { _id: redemption.promotion, $or: [{ usageLimit: null }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }] },
    { $inc: { usedCount: 1 } }
  );
  if (!promo) return false;
  if (redemption.kind === "welcome" && !(await reacquirePersonalCodeForBooking(bookingId, redemption.code))) {
    await Promotion.updateOne({ _id: redemption.promotion, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    return false;
  }
  redemption.status = "reserved";
  redemption.releasedAt = undefined;
  await redemption.save();
  return true;
};

/** Public banner data for live promotions (homepage, checkout) */
export const activePromotionsForDisplay = async () => {
  const now = new Date();
  const promos = await Promotion.find({ active: true, "display.placement": { $ne: "none" } })
    .sort({ "display.priority": -1, createdAt: -1 })
    .lean();
  return promos
    .filter((p) => isLive(p, now) && (p.usageLimit == null || p.usedCount < p.usageLimit))
    .map((p) => ({
      id: p._id,
      kind: p.kind,
      code: p.code,
      discountType: p.discountType,
      discountValue: p.discountValue,
      maxDiscountCents: p.maxDiscountCents,
      minOrderCents: p.minOrderCents,
      services: p.services,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      firstBookingOnly: p.firstBookingOnly || p.kind === "welcome",
      ...p.display,
    }));
};

// ---------------------------------------------------------------------------
// Default promotions (created once; admins can edit or delete them afterwards)
// ---------------------------------------------------------------------------
const WELCOME_TEXT = {
  de: "10 % Rabatt auf deine erste Reinigung – nach der Registrierung erhältst du deinen persönlichen Code per E-Mail.",
  en: "Enjoy 10% OFF your first cleaning – sign up and we email you your personal code.",
  pl: "10% zniżki na pierwsze sprzątanie – po rejestracji wyślemy Ci osobisty kod e-mailem.",
};
const OLD_WELCOME_TEXT_DE = "10 % Rabatt auf deine erste Reinigung – automatisch nach Bestätigung deiner E-Mail-Adresse.";

const berlinEndOfDay = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 22, 59, 59)); // 23:59:59 CET

const DEFAULT_PROMOTIONS = [
  {
    seedKey: "welcome-10",
    doc: {
      name: "Willkommensrabatt 10 % (erste Reinigung)",
      kind: "welcome",
      discountType: "percent",
      discountValue: 10,
      firstBookingOnly: true,
      requiresVerifiedEmail: true,
      perCustomerLimit: 1,
      // No homepage/banner advertising: the welcome code lives in the signup
      // email, the customer profile and the checkout prompt only.
      display: { placement: "none" },
    },
  },
];

export const ensureDefaultPromotions = async () => {
  const settings = await Settings.findOneAndUpdate(
    { key: "platform" },
    { $setOnInsert: { key: "platform" } },
    { upsert: true, returnDocument: "after" }
  );
  const done = new Set(settings.seeds ?? []);
  // Welcome offer switched to personal codes: update the default banner text
  // (only if the admin has not changed it)
  if (!done.has("welcome-personal-code-text")) {
    await Promotion.updateMany(
      { kind: "welcome", "display.text.de": OLD_WELCOME_TEXT_DE },
      { $set: { "display.text": WELCOME_TEXT } }
    );
    await Settings.updateOne({ key: "platform" }, { $addToSet: { seeds: "welcome-personal-code-text" } });
  }
  for (const { seedKey, doc } of DEFAULT_PROMOTIONS) {
    if (done.has(seedKey)) continue;
    const exists = doc.code ? await Promotion.exists({ code: doc.code }) : await Promotion.exists({ kind: doc.kind });
    if (!exists) await Promotion.create(doc);
    await Settings.updateOne({ key: "platform" }, { $addToSet: { seeds: seedKey } });
  }
};
