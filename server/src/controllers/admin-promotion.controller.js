import mongoose from "mongoose";
import { z } from "zod";

import Promotion from "../models/promotion.model.js";
import PromotionRedemption from "../models/promotion-redemption.model.js";
import { recordAudit } from "../services/audit.service.js";
import { isLive, normalizeCode } from "../services/promotion.service.js";
import { escapeRegex, getPagination, paginationMeta } from "../utils/helpers.js";

const text = z.object({ de: z.string().trim().max(400), en: z.string().trim().max(400), pl: z.string().trim().max(400) }).partial();
const SERVICES = ["home-cleaning", "deep-cleaning", "end-of-tenancy"];

const promotionSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    kind: z.enum(["welcome", "campaign", "coupon"]),
    code: z
      .string()
      .trim()
      .max(30)
      .transform((v) => normalizeCode(v) || null)
      .refine((v) => v === null || /^[A-Z0-9_-]{3,30}$/.test(v), "Use 3–30 letters, numbers, - or _.")
      .nullable()
      .optional(),
    discountType: z.enum(["percent", "fixed"]),
    discountValue: z.number().positive(),
    maxDiscountCents: z.number().int().min(0).nullable().optional(),
    minOrderCents: z.number().int().min(0).optional().default(0),
    services: z.array(z.enum(SERVICES)).optional().default([]),
    firstBookingOnly: z.boolean().optional().default(false),
    requiresVerifiedEmail: z.boolean().optional().default(false),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    active: z.boolean().optional().default(true),
    usageLimit: z.number().int().min(1).nullable().optional(),
    perCustomerLimit: z.number().int().min(1).max(100).optional().default(1),
    display: z
      .object({
        placement: z.enum(["none", "hero", "banner", "card"]).default("none"),
        priority: z.number().int().min(0).max(1000).default(0),
        title: text.optional(),
        text: text.optional(),
        ctaText: text.optional(),
        ctaHref: z.string().trim().max(200).regex(/^\/(?!\/)[^\s]*$/, "Use a path on this site, e.g. /buchung").optional(),
        // "" (none), an https URL, or a path on this site (e.g. /images/christmas.jpg)
        imageUrl: z
          .string()
          .trim()
          .max(500)
          .refine((u) => u === "" || /^https:\/\/[^\s]+$/.test(u) || /^\/(?!\/)[^\s]*$/.test(u), "Use an https image URL.")
          .optional(),
        theme: z.enum(["pine", "festive", "spring", "summer", "autumn", "winter", "sale"]).optional(),
        badge: text.optional(),
      })
      .optional(),
  })
  .refine((p) => p.discountType !== "percent" || p.discountValue <= 100, { message: "A percentage cannot be above 100.", path: ["discountValue"] })
  .refine((p) => p.discountType !== "fixed" || Number.isInteger(p.discountValue), { message: "Fixed discounts are in cents.", path: ["discountValue"] })
  .refine((p) => !p.startsAt || !p.endsAt || p.startsAt < p.endsAt, { message: "The end must be after the start.", path: ["endsAt"] })
  .refine((p) => p.kind !== "coupon" || p.code, { message: "Coupons need a code.", path: ["code"] });

const statsFor = async (ids) => {
  const rows = await PromotionRedemption.aggregate([
    { $match: { promotion: { $in: ids } } },
    {
      $group: {
        _id: { promotion: "$promotion", status: "$status" },
        count: { $sum: 1 },
        discountCents: { $sum: "$discountCents" },
        orderCents: { $sum: "$orderCents" },
      },
    },
  ]);
  const out = {};
  for (const r of rows) {
    const key = String(r._id.promotion);
    out[key] ??= { applied: 0, reserved: 0, released: 0, discountCents: 0, orderCents: 0 };
    out[key][r._id.status] = r.count;
    if (r._id.status === "applied") {
      out[key].discountCents += r.discountCents;
      out[key].orderCents += r.orderCents;
    }
  }
  return out;
};

const withState = (p, stats) => {
  const now = new Date();
  const state = !p.active ? "inactive" : p.startsAt && p.startsAt > now ? "scheduled" : p.endsAt && p.endsAt <= now ? "ended" : "live";
  return { ...p, state, live: isLive(p, now), stats: stats ?? { applied: 0, reserved: 0, released: 0, discountCents: 0, orderCents: 0 } };
};

// GET /api/v1/admin/promotions?kind=&state=&search=
export const listPromotions = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.kind) filter.kind = String(req.query.kind);
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(String(req.query.search)), "i");
      filter.$or = [{ name: rx }, { code: rx }];
    }
    const promos = await Promotion.find(filter).sort({ "display.priority": -1, createdAt: -1 }).limit(500).lean();
    const stats = await statsFor(promos.map((p) => p._id));
    let list = promos.map((p) => withState(p, stats[String(p._id)]));
    if (req.query.state) list = list.filter((p) => p.state === req.query.state);
    return res.json({ success: true, promotions: list });
  } catch (error) {
    next(error);
  }
};

const load = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid ID." });
    return null;
  }
  const promo = await Promotion.findById(req.params.id);
  if (!promo) res.status(404).json({ success: false, message: "Promotion not found." });
  return promo;
};

// GET /api/v1/admin/promotions/:id  (+ redemptions page)
export const getPromotion = async (req, res, next) => {
  try {
    const promo = await load(req, res);
    if (!promo) return;
    const pagination = getPagination(req.query, { defaultLimit: 25 });
    const [redemptions, total, stats] = await Promise.all([
      PromotionRedemption.find({ promotion: promo._id })
        .populate("customer", "name email")
        .populate("booking", "reference status preferredDate")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      PromotionRedemption.countDocuments({ promotion: promo._id }),
      statsFor([promo._id]),
    ]);
    return res.json({
      success: true,
      promotion: withState(promo.toObject(), stats[String(promo._id)]),
      redemptions,
      pagination: paginationMeta(pagination, total),
    });
  } catch (error) {
    next(error);
  }
};

const duplicateCode = (error, res) => {
  if (error.code === 11000) {
    res.status(409).json({ success: false, message: "This code is already used by another promotion." });
    return true;
  }
  return false;
};

// POST /api/v1/admin/promotions
export const createPromotion = async (req, res, next) => {
  try {
    const data = promotionSchema.parse(req.body);
    if (data.kind === "welcome" && (await Promotion.exists({ kind: "welcome", active: true })) && data.active) {
      return res.status(409).json({ success: false, message: "There is already an active welcome offer. Deactivate it first." });
    }
    const promo = await Promotion.create({ ...data, code: data.code ?? null, createdBy: req.user._id, updatedBy: req.user._id });
    await recordAudit({ actor: req.user._id, action: "promotion.created", entityType: "Promotion", entityId: promo._id, after: data });
    return res.status(201).json({ success: true, promotion: withState(promo.toObject()) });
  } catch (error) {
    if (duplicateCode(error, res)) return;
    next(error);
  }
};

// PATCH /api/v1/admin/promotions/:id  (full object, like create)
export const updatePromotion = async (req, res, next) => {
  try {
    const data = promotionSchema.parse(req.body);
    const promo = await load(req, res);
    if (!promo) return;
    if (data.kind === "welcome" && data.active && (await Promotion.exists({ kind: "welcome", active: true, _id: { $ne: promo._id } }))) {
      return res.status(409).json({ success: false, message: "There is already an active welcome offer. Deactivate it first." });
    }
    const before = promo.toObject();
    promo.set({ ...data, code: data.code ?? null, updatedBy: req.user._id });
    await promo.save();
    await recordAudit({
      actor: req.user._id,
      action: "promotion.updated",
      entityType: "Promotion",
      entityId: promo._id,
      before: { discountType: before.discountType, discountValue: before.discountValue, active: before.active, code: before.code },
      after: data,
    });
    return res.json({ success: true, promotion: withState(promo.toObject()) });
  } catch (error) {
    if (duplicateCode(error, res)) return;
    next(error);
  }
};

// PATCH /api/v1/admin/promotions/:id/active { active }
export const setPromotionActive = async (req, res, next) => {
  try {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const promo = await load(req, res);
    if (!promo) return;
    if (active && promo.kind === "welcome" && (await Promotion.exists({ kind: "welcome", active: true, _id: { $ne: promo._id } }))) {
      return res.status(409).json({ success: false, message: "There is already an active welcome offer. Deactivate it first." });
    }
    promo.active = active;
    promo.updatedBy = req.user._id;
    await promo.save();
    await recordAudit({ actor: req.user._id, action: active ? "promotion.activated" : "promotion.deactivated", entityType: "Promotion", entityId: promo._id });
    return res.json({ success: true, promotion: withState(promo.toObject()) });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/admin/promotions/:id – only without redemptions (keeps history intact)
export const deletePromotion = async (req, res, next) => {
  try {
    const promo = await load(req, res);
    if (!promo) return;
    if (await PromotionRedemption.exists({ promotion: promo._id })) {
      return res.status(409).json({
        success: false,
        message: "This promotion has already been used. Deactivate it instead of deleting it.",
      });
    }
    await promo.deleteOne();
    await recordAudit({ actor: req.user._id, action: "promotion.deleted", entityType: "Promotion", entityId: promo._id, before: { name: promo.name, code: promo.code } });
    return res.json({ success: true, message: "Promotion deleted." });
  } catch (error) {
    next(error);
  }
};
