// Promotions: automatic welcome offer, seasonal campaigns and coupon codes.
// All discount maths happens here (server side). One promotional discount
// per booking – the best eligible one wins. Gift cards are NOT discounts.
import Promotion from "../models/promotion.model.js";
import PromotionRedemption from "../models/promotion-redemption.model.js";
import Booking from "../models/booking.model.js";
import Settings from "../models/settings.model.js";
import { fingerprintOf } from "../utils/identity.js";
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
 * Pick the best promotion for an order: welcome offer, automatic campaigns
 * and the entered code compete – the highest discount wins (no stacking).
 */
export const findBestPromotion = async ({ user, serviceId, orderCents, code, contact, excludeBookingId }) => {
  const now = new Date();
  const ctx = { user, serviceId, orderCents, contact, excludeBookingId, now };
  const normalized = normalizeCode(code);

  const automatic = await Promotion.find({
    active: true,
    $or: [{ kind: "welcome" }, { kind: "campaign", code: null }],
  }).lean();

  const candidates = [];
  let welcome = null;
  for (const promo of automatic) {
    if (!isLive(promo, now)) continue;
    const result = await checkPromotion(promo, ctx);
    if (promo.kind === "welcome") {
      welcome = {
        eligible: result.ok,
        reason: result.reason,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        discountCents: result.discountCents,
      };
    }
    if (result.ok) candidates.push({ promo, discountCents: result.discountCents });
  }

  let codeResult = null;
  if (normalized) {
    const promo = await Promotion.findOne({ code: normalized }).lean();
    if (!promo) codeResult = { code: normalized, ok: false, reason: "not_found", discountCents: 0 };
    else {
      const result = await checkPromotion(promo, ctx);
      codeResult = { code: normalized, ...result, name: promo.name };
      if (result.ok) candidates.push({ promo, discountCents: result.discountCents, viaCode: true });
    }
  }

  candidates.sort((a, b) => b.discountCents - a.discountCents || (b.viaCode ? 1 : 0) - (a.viaCode ? 1 : 0));
  const best = candidates[0] ?? null;
  if (codeResult?.ok && best && !best.viaCode) codeResult.superseded = true; // a better automatic offer applies

  return {
    applied: best ? { ...promoSummary(best.promo, best.discountCents), promo: best.promo } : null,
    codeResult,
    welcome,
  };
};

/**
 * Reserve a promotion for a new booking (call inside the customer lock).
 * Re-checks eligibility and atomically counts the use against usageLimit.
 */
export const reservePromotion = async (promo, { user, bookingId, discountCents, orderCents, contact, serviceId }) => {
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
      code: fresh.code,
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
export const applyPromotionForBooking = (bookingId) =>
  PromotionRedemption.updateOne(
    { booking: bookingId, status: "reserved" },
    { $set: { status: "applied", appliedAt: new Date() } }
  );

/** Booking cancelled/expired before completion → offer can be used again */
export const releasePromotionForBooking = async (bookingId) => {
  const redemption = await PromotionRedemption.findOneAndUpdate(
    { booking: bookingId, status: { $in: ACTIVE_REDEMPTION } },
    { $set: { status: "released", releasedAt: new Date() } }
  );
  if (redemption) {
    await Promotion.updateOne({ _id: redemption.promotion, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
  }
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
      display: {
        placement: "card",
        priority: 50,
        theme: "pine",
        ctaHref: "/registrieren",
        title: { de: "Willkommen bei Fiduxa!", en: "Welcome to Fiduxa!", pl: "Witamy w Fiduxa!" },
        text: {
          de: "10 % Rabatt auf deine erste Reinigung – automatisch nach Bestätigung deiner E-Mail-Adresse.",
          en: "Enjoy 10% OFF your first cleaning – applied automatically once you confirm your email address.",
          pl: "10% zniżki na pierwsze sprzątanie – automatycznie po potwierdzeniu adresu e-mail.",
        },
        ctaText: { de: "Konto erstellen & sparen", en: "Sign up & save", pl: "Załóż konto i oszczędzaj" },
        badge: { de: "−10 %", en: "−10%", pl: "−10%" },
      },
    },
  },
  {
    seedKey: "christmas-2026",
    doc: {
      name: "Weihnachtsreinigung 2026",
      kind: "campaign",
      code: "XMAS10",
      discountType: "percent",
      discountValue: 10,
      maxDiscountCents: 5000,
      minOrderCents: 5000,
      perCustomerLimit: 1,
      startsAt: new Date(Date.UTC(2026, 10, 15)),
      endsAt: berlinEndOfDay(2026, 12, 24),
      display: {
        placement: "hero",
        priority: 100,
        theme: "festive",
        ctaHref: "/buchung",
        title: {
          de: "Bring deine Familie an Weihnachten in einem frischen, sauberen Zuhause zusammen!",
          en: "Bring Your Family Together in a Fresh, Clean Home This Christmas!",
          pl: "Zbierz rodzinę w świeżym, czystym domu na Boże Narodzenie!",
        },
        text: {
          de: "Mehr Zeit für deine Liebsten in der Festtagszeit. Fiduxa übernimmt das Putzen, während du ein frisches, einladendes Zuhause genießt.",
          en: "Make more time for your loved ones this festive season. Let Fiduxa take care of the cleaning while you enjoy a fresh and welcoming home.",
          pl: "Więcej czasu dla bliskich w okresie świąt. Fiduxa zajmie się sprzątaniem, a Ty ciesz się świeżym i przytulnym domem.",
        },
        ctaText: { de: "Weihnachtsreinigung buchen", en: "Book Your Christmas Cleaning", pl: "Zarezerwuj świąteczne sprzątanie" },
        badge: { de: "Code XMAS10: −10 %", en: "Code XMAS10: −10%", pl: "Kod XMAS10: −10%" },
      },
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
  for (const { seedKey, doc } of DEFAULT_PROMOTIONS) {
    if (done.has(seedKey)) continue;
    const exists = doc.code ? await Promotion.exists({ code: doc.code }) : await Promotion.exists({ kind: doc.kind });
    if (!exists) await Promotion.create(doc);
    await Settings.updateOne({ key: "platform" }, { $addToSet: { seeds: seedKey } });
  }
};
