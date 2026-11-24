import mongoose from "mongoose";
import { z } from "zod";

import GiftCard from "../models/gift-card.model.js";
import Payment from "../models/payment.model.js";
import { GIFT_CARDS } from "../config/pricing.js";
import { availableMethods } from "../services/payment.service.js";
import { capturePayPalOrder } from "../services/paypal.service.js";
import { findUsableGiftCard, maskCode } from "../services/gift-card.service.js";
import {
  activatePaidGiftCard,
  createGiftCardPurchase,
  startGiftCardPayment,
} from "../services/gift-card-purchase.service.js";
import { parseCalendarDate, todayInBerlin, DAY_MS } from "../utils/helpers.js";

// GET /api/v1/gift-cards/config (public)
export const getGiftCardConfig = (req, res) =>
  res.json({
    success: true,
    enabled: GIFT_CARDS.enabled,
    presetAmountsCents: GIFT_CARDS.presetAmountsCents,
    minCustomCents: GIFT_CARDS.minCustomCents,
    maxCustomCents: GIFT_CARDS.maxCustomCents,
    validityYears: GIFT_CARDS.validityYears,
    maxPerBooking: GIFT_CARDS.maxPerBooking,
    designs: ["classic", "festive", "spring", "thanks"],
    methods: availableMethods(),
  });

// POST /api/v1/gift-cards/check { code } (public, rate limited) – balance lookup
export const checkGiftCard = async (req, res, next) => {
  try {
    const { code } = z.object({ code: z.string().trim().max(40) }).parse(req.body);
    const found = await findUsableGiftCard(code);
    if (!found.card) return res.json({ success: true, valid: false, reason: found.reason });
    return res.json({
      success: true,
      valid: true,
      code: maskCode(found.code),
      balanceCents: found.card.balanceCents,
      expiresAt: found.card.expiresAt,
    });
  } catch (error) {
    next(error);
  }
};

const purchaseSchema = z.object({
  amountCents: z.number().int().min(500).max(200000),
  recipientName: z.string().trim().min(2).max(100),
  recipientEmail: z.string().trim().email().max(254),
  senderName: z.string().trim().min(2).max(100),
  message: z.string().trim().max(500).optional().default(""),
  design: z.enum(["classic", "festive", "spring", "thanks"]).optional().default("classic"),
  locale: z.enum(["de", "en", "pl"]).optional().default("de"),
  // YYYY-MM-DD, today = send right after payment (max 1 year ahead)
  deliveryDate: z.string().trim().optional(),
  method: z.enum(["stripe", "paypal"]).optional(),
});

const toCustomerCard = (card) => ({
  id: card._id,
  status: card.status,
  amountCents: card.initialCents,
  balanceCents: card.balanceCents,
  // The code is only shown once the card is paid
  code: ["active", "redeemed", "expired"].includes(card.status) ? card.code : null,
  recipientName: card.recipientName,
  recipientEmail: card.recipientEmail,
  senderName: card.senderName,
  message: card.message,
  design: card.design,
  deliverAt: card.deliverAt,
  deliveryStatus: card.deliveryStatus,
  deliveredAt: card.deliveredAt,
  expiresAt: card.expiresAt,
  paidAt: card.payment?.paidAt ?? null,
  createdAt: card.createdAt,
});

// POST /api/v1/gift-cards (customer) → { giftCard, checkoutUrl }
export const purchaseGiftCard = async (req, res, next) => {
  try {
    const data = purchaseSchema.parse(req.body);
    let deliverAt = null;
    if (data.deliveryDate) {
      const day = parseCalendarDate(data.deliveryDate);
      const today = todayInBerlin();
      if (!day || day < today || day > new Date(today.getTime() + 365 * DAY_MS)) {
        return res.status(422).json({ success: false, message: "Please choose a delivery date within the next 12 months." });
      }
      // 08:00 Berlin (≈ 07:00 UTC) on that day; today = immediately
      deliverAt = day.getTime() === today.getTime() ? null : new Date(day.getTime() + 7 * 60 * 60 * 1000);
    }

    const card = await createGiftCardPurchase(req.user, { ...data, deliverAt });
    let checkoutUrl = null;
    try {
      ({ url: checkoutUrl } = await startGiftCardPayment(card, req.user, data.method));
    } catch (error) {
      if (error?.paypal || error?.type?.startsWith?.("Stripe")) {
        console.error("Gift card payment start failed:", error.message);
        return res.status(502).json({
          success: false,
          message: "The payment provider is currently unavailable. Please try again later.",
          giftCard: toCustomerCard(card),
        });
      }
      throw error;
    }
    return res.status(201).json({ success: true, giftCard: toCustomerCard(card), checkoutUrl });
  } catch (error) {
    next(error);
  }
};

const loadOwnCard = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ success: false, message: "Gift card not found." });
    return null;
  }
  const card = await GiftCard.findOne({ _id: req.params.id, purchaser: req.user._id });
  if (!card) res.status(404).json({ success: false, message: "Gift card not found." });
  return card;
};

// GET /api/v1/gift-cards/mine
export const listMyGiftCards = async (req, res, next) => {
  try {
    const cards = await GiftCard.find({ purchaser: req.user._id, status: { $ne: "cancelled" } })
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json({ success: true, giftCards: cards.map(toCustomerCard) });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/gift-cards/:id (buyer)
export const getMyGiftCard = async (req, res, next) => {
  try {
    const card = await loadOwnCard(req, res);
    if (!card) return;
    return res.json({ success: true, giftCard: toCustomerCard(card) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/gift-cards/:id/pay { method } – retry payment of a pending card
export const retryGiftCardPayment = async (req, res, next) => {
  try {
    const { method } = z.object({ method: z.enum(["stripe", "paypal"]).optional() }).parse(req.body ?? {});
    const card = await loadOwnCard(req, res);
    if (!card) return;
    if (card.status !== "pending_payment") {
      return res.status(409).json({ success: false, message: "This gift card cannot be paid any more." });
    }
    const { url } = await startGiftCardPayment(card, req.user, method);
    return res.json({ success: true, checkoutUrl: url });
  } catch (error) {
    if (error?.paypal || error?.type?.startsWith?.("Stripe")) {
      return res.status(502).json({ success: false, message: "The payment provider is currently unavailable. Please try again later." });
    }
    next(error);
  }
};

// POST /api/v1/gift-cards/:id/paypal/capture { orderId }
export const captureGiftCardPayPal = async (req, res, next) => {
  try {
    const { orderId } = z.object({ orderId: z.string().trim().min(5).max(64).regex(/^[A-Z0-9-]+$/i) }).parse(req.body);
    const card = await loadOwnCard(req, res);
    if (!card) return;
    const payment = await Payment.findOne({ giftCard: card._id, provider: "paypal", checkoutSessionId: orderId });
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found." });

    if (payment.status === "paid") return res.json({ success: true, giftCard: toCustomerCard(await GiftCard.findById(card._id)) });
    if (card.status === "cancelled") {
      return res.status(409).json({ success: false, message: "This purchase has expired. You have not been charged." });
    }

    const capture = await capturePayPalOrder(orderId);
    if (capture.status === "COMPLETED") {
      if (capture.amountCents !== payment.amountCents || capture.currency !== "EUR") {
        payment.status = "failed";
        payment.failureReason = `Amount mismatch: got ${capture.amountCents} ${capture.currency}`;
        await payment.save();
        return res.status(409).json({ success: false, message: "The payment could not be verified. Please contact us." });
      }
      payment.status = "paid";
      payment.paidAt = new Date();
      payment.paymentIntentId = capture.captureId;
      await payment.save();
      await activatePaidGiftCard(payment);
      return res.json({ success: true, giftCard: toCustomerCard(await GiftCard.findById(card._id)) });
    }
    payment.status = capture.status === "PENDING" ? "processing" : "failed";
    payment.paymentIntentId = capture.captureId;
    await payment.save();
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
    if (error?.paypal) return res.status(502).json({ success: false, message: "The payment provider is currently unavailable. Please try again later." });
    next(error);
  }
};
