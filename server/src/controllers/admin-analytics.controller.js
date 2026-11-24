import Booking from "../models/booking.model.js";
import GiftCard from "../models/gift-card.model.js";
import Promotion from "../models/promotion.model.js";
import PromotionRedemption from "../models/promotion-redemption.model.js";
import { parseCalendarDate, todayInBerlin, DAY_MS } from "../utils/helpers.js";

// GET /api/v1/admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD (by creation date)
export const getAnalytics = async (req, res, next) => {
  try {
    const today = todayInBerlin();
    const from = parseCalendarDate(req.query.from) ?? new Date(today.getTime() - 29 * DAY_MS);
    const toDay = parseCalendarDate(req.query.to) ?? today;
    const to = new Date(toDay.getTime() + DAY_MS);
    const range = { $gte: from, $lt: to };

    const [bookingStats, statusCounts, promoRows, welcomeRows, giftSold, giftRedeemed, newCustomers] = await Promise.all([
      Booking.aggregate([
        { $match: { createdAt: range, status: { $in: ["confirmed", "in_progress", "completed"] } } },
        {
          $group: {
            _id: null,
            bookings: { $sum: 1 },
            beforeDiscountCents: { $sum: { $ifNull: ["$pricing.priceCents", "$estimate.totalCents"] } },
            promotionDiscountCents: { $sum: { $ifNull: ["$pricing.promotionDiscountCents", 0] } },
            afterDiscountCents: { $sum: { $ifNull: ["$pricing.totalCents", "$estimate.totalCents"] } },
            giftCardCents: { $sum: { $ifNull: ["$pricing.giftCardCents", 0] } },
            collectedCents: { $sum: { $ifNull: ["$pricing.payableCents", "$estimate.totalCents"] } },
          },
        },
      ]),
      Booking.aggregate([{ $match: { createdAt: range } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      PromotionRedemption.aggregate([
        { $match: { createdAt: range, status: "applied" } },
        { $group: { _id: "$promotion", redemptions: { $sum: 1 }, discountCents: { $sum: "$discountCents" }, orderCents: { $sum: "$orderCents" } } },
        { $sort: { redemptions: -1 } },
      ]),
      PromotionRedemption.aggregate([
        { $match: { createdAt: range, kind: "welcome" } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      GiftCard.aggregate([
        { $match: { "payment.paidAt": range, "payment.method": { $in: ["stripe", "paypal"] } } },
        { $group: { _id: null, count: { $sum: 1 }, soldCents: { $sum: "$initialCents" } } },
      ]),
      GiftCard.aggregate([
        { $match: { status: { $in: ["active", "redeemed", "expired", "disabled"] } } },
        { $group: { _id: null, initialCents: { $sum: "$initialCents" }, balanceCents: { $sum: "$balanceCents" } } },
      ]),
      (await import("../models/user.model.js")).default.countDocuments({ role: "consumer", createdAt: range }),
    ]);

    const promotions = await Promotion.find({ _id: { $in: promoRows.map((r) => r._id) } }).select("name kind code").lean();
    const byId = new Map(promotions.map((p) => [String(p._id), p]));
    const statuses = Object.fromEntries(statusCounts.map((r) => [r._id, r.count]));
    const created = statusCounts.reduce((s, r) => s + r.count, 0);
    const converted = (statuses.confirmed ?? 0) + (statuses.in_progress ?? 0) + (statuses.completed ?? 0);
    const welcome = Object.fromEntries(welcomeRows.map((r) => [r._id, r.count]));
    const b = bookingStats[0] ?? { bookings: 0, beforeDiscountCents: 0, promotionDiscountCents: 0, afterDiscountCents: 0, giftCardCents: 0, collectedCents: 0 };
    const allCards = giftRedeemed[0] ?? { initialCents: 0, balanceCents: 0 };

    return res.json({
      success: true,
      from: from.toISOString().slice(0, 10),
      to: toDay.toISOString().slice(0, 10),
      bookings: {
        created,
        converted,
        conversionRatePct: created ? Math.round((converted / created) * 1000) / 10 : null,
        byStatus: statuses,
      },
      revenue: {
        beforeDiscountCents: b.beforeDiscountCents,
        promotionDiscountCents: b.promotionDiscountCents,
        afterDiscountCents: b.afterDiscountCents,
        paidWithGiftCardsCents: b.giftCardCents,
        collectedCents: b.collectedCents,
      },
      promotions: {
        redemptions: promoRows.reduce((s, r) => s + r.redemptions, 0),
        discountCents: promoRows.reduce((s, r) => s + r.discountCents, 0),
        byPromotion: promoRows.map((r) => ({
          promotion: byId.get(String(r._id)) ?? { _id: r._id, name: "(gelöscht)" },
          redemptions: r.redemptions,
          discountCents: r.discountCents,
          orderCents: r.orderCents,
        })),
      },
      firstTimeCustomers: {
        newCustomers,
        welcomeApplied: welcome.applied ?? 0,
        welcomeReserved: welcome.reserved ?? 0,
        welcomeReleased: welcome.released ?? 0,
      },
      giftCards: {
        soldCount: giftSold[0]?.count ?? 0,
        soldCents: giftSold[0]?.soldCents ?? 0,
        // All-time: how much of the issued value has been used
        allTimeIssuedCents: allCards.initialCents,
        allTimeOpenCents: allCards.balanceCents,
        redemptionPct: allCards.initialCents
          ? Math.round(((allCards.initialCents - allCards.balanceCents) / allCards.initialCents) * 1000) / 10
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};
