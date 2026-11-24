import mongoose from "mongoose";
import { z } from "zod";

import GiftCard from "../models/gift-card.model.js";
import GiftCardTransaction from "../models/gift-card-transaction.model.js";
import Booking from "../models/booking.model.js";
import Payment from "../models/payment.model.js";
import { recordAudit } from "../services/audit.service.js";
import {
  adjustGiftCardBalance,
  expiryFor,
  generateGiftCardCode,
  normalizeGiftCardCode,
} from "../services/gift-card.service.js";
import { deliverGiftCard } from "../services/gift-card-purchase.service.js";
import { escapeRegex, getPagination, paginationMeta } from "../utils/helpers.js";

// GET /api/v1/admin/gift-cards?search=&status=&page=
export const listGiftCards = async (req, res, next) => {
  try {
    const pagination = getPagination(req.query, { defaultLimit: 25 });
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status);
    else filter.status = { $ne: "cancelled" };
    if (req.query.search) {
      const raw = String(req.query.search).trim();
      const code = normalizeGiftCardCode(raw);
      const rx = new RegExp(escapeRegex(raw), "i");
      filter.$or = [
        ...(code ? [{ code }] : []),
        { code: rx },
        { recipientEmail: rx },
        { recipientName: rx },
        { senderEmail: rx },
        { senderName: rx },
      ];
    }
    const [cards, total, totals] = await Promise.all([
      GiftCard.find(filter)
        .populate("purchaser", "name email")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      GiftCard.countDocuments(filter),
      GiftCard.aggregate([
        { $match: { status: { $in: ["active", "redeemed", "expired", "disabled"] } } },
        { $group: { _id: null, soldCents: { $sum: "$initialCents" }, openCents: { $sum: "$balanceCents" }, count: { $sum: 1 } } },
      ]),
    ]);
    return res.json({
      success: true,
      giftCards: cards,
      totals: totals[0] ?? { soldCents: 0, openCents: 0, count: 0 },
      pagination: paginationMeta(pagination, total),
    });
  } catch (error) {
    next(error);
  }
};

const load = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid ID." });
    return null;
  }
  const card = await GiftCard.findById(req.params.id);
  if (!card) res.status(404).json({ success: false, message: "Gift card not found." });
  return card;
};

// GET /api/v1/admin/gift-cards/:id – card, ledger, bookings, payments
export const getGiftCard = async (req, res, next) => {
  try {
    const card = await load(req, res);
    if (!card) return;
    const [transactions, payments] = await Promise.all([
      GiftCardTransaction.find({ giftCard: card._id })
        .populate("booking", "reference status preferredDate")
        .populate("actor", "name email role")
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
      Payment.find({ giftCard: card._id }).select("-checkoutUrl").sort({ createdAt: -1 }).lean(),
    ]);
    await card.populate("purchaser", "name email");
    await card.populate("issuedBy", "name");
    return res.json({ success: true, giftCard: card, transactions, payments });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/gift-cards/:id/disable { reason }  ·  /enable
export const setGiftCardDisabled = (disabled) => async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(disabled ? 3 : 0).max(300).optional().default("") }).parse(req.body ?? {});
    const card = await load(req, res);
    if (!card) return;
    if (disabled && !["active", "redeemed"].includes(card.status)) {
      return res.status(409).json({ success: false, message: "Only active gift cards can be disabled." });
    }
    if (!disabled && card.status !== "disabled") {
      return res.status(409).json({ success: false, message: "This gift card is not disabled." });
    }
    // Reservations of open bookings stay valid; only new uses are blocked
    card.status = disabled ? "disabled" : card.balanceCents > 0 ? "active" : "redeemed";
    card.disabledReason = disabled ? reason : "";
    await card.save();
    await GiftCardTransaction.create({
      giftCard: card._id,
      type: "adjust",
      amountCents: 0,
      balanceAfterCents: card.balanceCents,
      actor: req.user._id,
      note: disabled ? `Disabled: ${reason}` : "Enabled again",
    });
    await recordAudit({
      actor: req.user._id,
      action: disabled ? "giftcard.disabled" : "giftcard.enabled",
      entityType: "GiftCard",
      entityId: card._id,
      after: { reason },
    });
    return res.json({ success: true, giftCard: card });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/gift-cards/:id/adjust { amountCents (+/-), reason }
export const adjustGiftCard = async (req, res, next) => {
  try {
    const { amountCents, reason } = z
      .object({
        amountCents: z.number().int().min(-200000).max(200000).refine((v) => v !== 0, "Enter an amount."),
        reason: z.string().trim().min(5).max(300),
      })
      .parse(req.body);
    const card = await load(req, res);
    if (!card) return;
    if (["pending_payment", "cancelled"].includes(card.status)) {
      return res.status(409).json({ success: false, message: "Unpaid gift cards cannot be adjusted." });
    }
    const updated = await adjustGiftCardBalance({ cardId: card._id, amountCents, actor: req.user._id, note: reason });
    await recordAudit({
      actor: req.user._id,
      action: "giftcard.adjusted",
      entityType: "GiftCard",
      entityId: card._id,
      before: { balanceCents: card.balanceCents },
      after: { balanceCents: updated.balanceCents, amountCents, reason },
    });
    return res.json({ success: true, giftCard: updated });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/gift-cards/issue – goodwill / marketing card (no payment)
export const issueGiftCard = async (req, res, next) => {
  try {
    const data = z
      .object({
        amountCents: z.number().int().min(500).max(200000),
        recipientName: z.string().trim().min(2).max(100),
        recipientEmail: z.string().trim().email(),
        message: z.string().trim().max(500).optional().default(""),
        reason: z.string().trim().min(3).max(300),
        locale: z.enum(["de", "en", "pl"]).optional().default("de"),
        sendEmail: z.boolean().optional().default(true),
      })
      .parse(req.body);
    const now = new Date();
    const card = await GiftCard.create({
      code: await generateGiftCardCode(),
      status: "active",
      initialCents: data.amountCents,
      balanceCents: data.amountCents,
      senderName: "Fiduxa",
      recipientName: data.recipientName,
      recipientEmail: data.recipientEmail.toLowerCase(),
      message: data.message,
      locale: data.locale,
      payment: { method: "admin", paidAt: now, payable: false },
      expiresAt: expiryFor(now),
      issuedBy: req.user._id,
      deliveryStatus: data.sendEmail ? "pending" : "sent",
    });
    await GiftCardTransaction.create({
      giftCard: card._id,
      type: "issue",
      amountCents: data.amountCents,
      balanceAfterCents: data.amountCents,
      actor: req.user._id,
      note: data.reason,
      idempotencyKey: `issue:${card._id}`,
    });
    if (data.sendEmail) await deliverGiftCard(card._id);
    await recordAudit({ actor: req.user._id, action: "giftcard.issued", entityType: "GiftCard", entityId: card._id, after: { amountCents: data.amountCents, reason: data.reason } });
    return res.status(201).json({ success: true, giftCard: await GiftCard.findById(card._id) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/gift-cards/:id/resend – email the card to the recipient again
export const resendGiftCard = async (req, res, next) => {
  try {
    const card = await load(req, res);
    if (!card) return;
    if (!["active", "redeemed"].includes(card.status)) {
      return res.status(409).json({ success: false, message: "Only paid gift cards can be sent." });
    }
    card.deliveryStatus = "pending";
    card.deliverAt = null;
    await card.save();
    const sent = await deliverGiftCard(card._id);
    return res.json({ success: sent, message: sent ? "Gift card sent." : "The email could not be sent." });
  } catch (error) {
    next(error);
  }
};

export { Booking };
