import { z } from "zod";

import Booking from "../models/booking.model.js";
import Payment from "../models/payment.model.js";
import { FINANCE, PRICING } from "../config/pricing.js";
import { todayInBerlin } from "../utils/helpers.js";

// Management P&L from completed bookings. Revenue is recognised on the day
// the cleaning was completed (Europe/Berlin). All money in integer cents.
//
//   gross revenue (customer price incl. VAT, after discounts; gift-card
//                  redemptions count as revenue, gift-card sales do not)
// − VAT contained in the price
// = net revenue
// − cleaner pay (immutable per-booking records)
// − payment provider fees (estimated from the configured rates)
// − fixed costs (configured monthly amount, prorated per period)
// = profit before tax
// − income tax (estimate: configured rate on positive profit)
// = profit after tax
//
// "Fiduxa commission" = gross revenue − cleaner pay (what stays with the
// platform before VAT, fees, fixed costs and tax).

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const feeFor = (method, grossCents, count) => {
  const rule = FINANCE.fees?.[method];
  if (!rule) return 0; // cash, invoice, gift card: no provider fee
  return Math.round((grossCents * rule.pct) / 100) + rule.fixedCents * count;
};

const summarize = (rows, fixedCostsCents) => {
  const s = rows.reduce(
    (acc, r) => {
      acc.bookings += r.count;
      acc.grossCents += r.gross;
      acc.vatCents += r.vat;
      acc.cleanerPayCents += r.pay;
      acc.paymentFeesCents += feeFor(r._id.method, r.gross, r.count);
      return acc;
    },
    { bookings: 0, grossCents: 0, vatCents: 0, cleanerPayCents: 0, paymentFeesCents: 0 }
  );
  const commissionCents = s.grossCents - s.cleanerPayCents;
  // Agent model: VAT is only contained in the commission, not the full price
  if (FINANCE.vatBasis === "commission") {
    const rate = PRICING.vatRate ?? 0.19;
    s.vatCents = rate > 0 ? Math.round(commissionCents - commissionCents / (1 + rate)) : 0;
  }
  const netRevenueCents = s.grossCents - s.vatCents;
  const fixed = Math.round(fixedCostsCents);
  const profitBeforeTaxCents = netRevenueCents - s.cleanerPayCents - s.paymentFeesCents - fixed;
  const incomeTaxCents = profitBeforeTaxCents > 0 ? Math.round((profitBeforeTaxCents * FINANCE.incomeTaxRatePct) / 100) : 0;
  const profitAfterTaxCents = profitBeforeTaxCents - incomeTaxCents;
  return {
    ...s,
    netRevenueCents,
    commissionCents,
    fixedCostsCents: fixed,
    profitBeforeTaxCents,
    incomeTaxCents,
    profitAfterTaxCents,
    // share of gross revenue that is profit after tax
    marginPct: s.grossCents > 0 ? Math.round((profitAfterTaxCents / s.grossCents) * 1000) / 10 : null,
  };
};

// GET /api/v1/admin/finance?year=2026&period=today|month|year|all
export const getFinanceOverview = async (req, res, next) => {
  try {
    const todayKey = todayInBerlin().toISOString().slice(0, 10);
    const [curYear, curMonth] = todayKey.split("-").map(Number);
    const q = z
      .object({
        year: z.coerce.number().int().min(2020).max(curYear + 1).optional().default(curYear),
        period: z.enum(["today", "month", "year", "all"]).optional().default("month"),
      })
      .parse(req.query);

    const vatRate = PRICING.vatRate ?? 0.19;
    const rows = await Booking.aggregate([
      { $match: { status: "completed" } },
      {
        $project: {
          serviceId: 1,
          // Recognition date: completion → earning record → appointment → creation
          at: { $ifNull: ["$job.completedAt", "$workerPayout.earnedAt", "$preferredDate", "$createdAt", "$$NOW"] },
          method: { $ifNull: ["$payment.method", "unknown"] },
          gross: { $ifNull: ["$pricing.totalCents", { $ifNull: ["$estimate.totalCents", 0] }] },
          vatStored: "$pricing.vatCents",
          pay: { $ifNull: ["$workerPayout.amountCents", 0] },
        },
      },
      {
        $addFields: {
          // Older bookings without a pricing snapshot: VAT contained in the price
          vat: {
            $ifNull: ["$vatStored", { $round: [{ $subtract: ["$gross", { $divide: ["$gross", 1 + vatRate] }] }, 0] }],
          },
        },
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: "Europe/Berlin" } },
            method: "$method",
            service: "$serviceId",
          },
          gross: { $sum: "$gross" },
          vat: { $sum: "$vat" },
          pay: { $sum: "$pay" },
          count: { $sum: 1 },
        },
      },
    ]);
    for (const r of rows) r._id.day = r._id.day ?? todayKey; // never crash on a missing date

    const monthly = FINANCE.monthlyFixedCostsCents ?? 0;
    const monthKey = todayKey.slice(0, 7);
    const firstDay = rows.reduce((m, r) => (r._id.day < m ? r._id.day : m), todayKey);
    const [firstY, firstM] = firstDay.split("-").map(Number);
    const monthsSinceStart = (curYear - firstY) * 12 + (curMonth - firstM) + 1;
    const monthsInYear = q.year < curYear ? 12 : q.year === curYear ? curMonth : 0;
    const yearPrefix = `${q.year}-`;

    const inPeriod = {
      today: (r) => r._id.day === todayKey,
      month: (r) => r._id.day.startsWith(monthKey),
      year: (r) => r._id.day.startsWith(yearPrefix),
      all: () => true,
    };
    const fixedFor = {
      today: monthly / daysInMonth(curYear, curMonth),
      month: monthly,
      year: monthly * monthsInYear,
      all: monthly * Math.max(1, monthsSinceStart),
    };
    const periods = Object.fromEntries(
      Object.keys(inPeriod).map((k) => [k, summarize(rows.filter(inPeriod[k]), fixedFor[k])])
    );

    const months = Array.from({ length: 12 }, (_, i) => {
      const key = `${q.year}-${String(i + 1).padStart(2, "0")}`;
      const isPastOrCurrent = q.year < curYear || (q.year === curYear && i + 1 <= curMonth);
      return { month: key, ...summarize(rows.filter((r) => r._id.day.startsWith(key)), isPastOrCurrent ? monthly : 0) };
    });

    const selected = rows.filter(inPeriod[q.period]);
    const group = (keyOf) => {
      const map = new Map();
      for (const r of selected) {
        const k = keyOf(r);
        const cur = map.get(k) ?? { grossCents: 0, bookings: 0, feeCents: 0 };
        cur.grossCents += r.gross;
        cur.bookings += r.count;
        cur.feeCents += feeFor(r._id.method, r.gross, r.count);
        map.set(k, cur);
      }
      return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.grossCents - a.grossCents);
    };

    // Upcoming confirmed bookings (not yet revenue) and refunds in the period
    const today = todayInBerlin();
    const [pipeline] = await Booking.aggregate([
      { $match: { status: "confirmed", preferredDate: { $gte: today } } },
      { $group: { _id: null, cents: { $sum: { $ifNull: ["$pricing.totalCents", { $ifNull: ["$estimate.totalCents", 0] }] } }, count: { $sum: 1 } } },
    ]);
    const periodStart = {
      today: today,
      month: new Date(Date.UTC(curYear, curMonth - 1, 1)),
      year: new Date(Date.UTC(q.year, 0, 1)),
      all: new Date(0),
    }[q.period];
    const periodEnd = q.period === "year" ? new Date(Date.UTC(q.year + 1, 0, 1)) : new Date(Date.now() + 86400e3);
    const [refunds] = await Payment.aggregate([
      { $match: { status: "refunded", refundedAt: { $gte: periodStart, $lt: periodEnd } } },
      { $group: { _id: null, cents: { $sum: "$amountCents" }, count: { $sum: 1 } } },
    ]);

    const years = [...new Set(rows.map((r) => Number(r._id.day.slice(0, 4))))].sort();
    return res.json({
      success: true,
      today: todayKey,
      year: q.year,
      period: q.period,
      years: years.includes(curYear) ? years : [...years, curYear],
      periods,
      monthly: months,
      breakdown: periods[q.period],
      byService: group((r) => r._id.service),
      byMethod: group((r) => r._id.method),
      pipeline: { cents: pipeline?.cents ?? 0, bookings: pipeline?.count ?? 0 },
      refunds: { cents: refunds?.cents ?? 0, count: refunds?.count ?? 0 },
      assumptions: { ...FINANCE, vatRate },
    });
  } catch (error) {
    next(error);
  }
};
