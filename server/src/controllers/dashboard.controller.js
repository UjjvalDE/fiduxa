import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import BusinessRequest from "../models/business-request.model.js";
import ContactMessage from "../models/contact-message.model.js";
import AvailabilitySlot from "../models/availability-slot.model.js";
import { DAY_MS, todayInBerlin } from "../utils/helpers.js";
import { countLateToday } from "../services/no-show.service.js";

// GET /api/v1/admin/dashboard/stats
export const getDashboardStats = async (req, res, next) => {
  try {
    const today = todayInBerlin();
    const tomorrow = new Date(today.getTime() + DAY_MS);
    const inSevenDays = new Date(today.getTime() + 7 * DAY_MS);

    const [
      statusCounts,
      revenueResult,
      todaysJobs,
      unassignedUpcoming,
      workerCounts,
      newBusinessRequests,
      newContactMessages,
      totalCustomers,
      refundsPending,
      slotCapacity,
      lateToday,
    ] = await Promise.all([
      Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),

      // Revenue = payments actually received
      Booking.aggregate([
        { $match: { "payment.status": "paid" } },
        { $group: { _id: null, total: { $sum: "$payment.amountCents" } } },
      ]),

      Booking.countDocuments({
        preferredDate: { $gte: today, $lt: tomorrow },
        status: { $in: ["confirmed", "in_progress", "completed"] },
      }),

      Booking.countDocuments({
        preferredDate: { $gte: today },
        status: "confirmed",
        assignedWorker: null,
      }),

      User.aggregate([
        { $match: { role: "worker" } },
        { $group: { _id: "$workerStatus", count: { $sum: 1 } } },
      ]),

      BusinessRequest.countDocuments({ status: "new_request" }),
      ContactMessage.countDocuments({ status: "new" }),
      User.countDocuments({ role: "consumer" }),
      Booking.countDocuments({ "payment.status": "refund_pending" }),

      // Published windows for the next 7 days (team-hours) and booked hours
      (async () => {
        const windows = await AvailabilitySlot.find({ date: { $gte: tomorrow, $lte: inSevenDays }, active: true })
          .select("startTime endTime capacity")
          .lean();
        const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        const capacityMinutes = windows.reduce(
          (sum, w) => sum + (w.endTime ? (minutes(w.endTime) - minutes(w.startTime)) * w.capacity : 120 * w.capacity),
          0
        );
        const booked = await Booking.find({
          availabilitySlot: { $in: windows.map((w) => w._id) },
          status: { $in: ["payment_pending", "confirmed", "in_progress", "completed"] },
        })
          .select("estimate.durationMinutes")
          .lean();
        const bookedMinutes = booked.reduce((sum, b) => sum + (b.estimate?.durationMinutes ?? 0), 0);
        return [{ slots: windows.length, capacity: capacityMinutes, booked: bookedMinutes, bookings: booked.length }];
      })(),

      // Cleaners flagged late by the no-show watch today
      countLateToday(),
    ]);

    const byStatus = Object.fromEntries(statusCounts.map((row) => [row._id, row.count]));
    const workersByStatus = Object.fromEntries(workerCounts.map((row) => [row._id, row.count]));
    const capacity = slotCapacity[0] ?? { capacity: 0, booked: 0, slots: 0 };

    return res.json({
      success: true,
      stats: {
        totalBookings: statusCounts.reduce((sum, row) => sum + row.count, 0),
        paymentPending: byStatus.payment_pending || 0,
        confirmedBookings: byStatus.confirmed || 0,
        inProgressBookings: byStatus.in_progress || 0,
        completedBookings: byStatus.completed || 0,
        cancelledBookings: byStatus.cancelled || 0,
        expiredBookings: byStatus.expired || 0,
        todaysJobs,
        lateToday,
        unassignedUpcoming,
        totalCustomers,
        refundsPending,
        // Values in MINUTES (team time): capacity = window length × teams
        nextSevenDays: {
          slots: capacity.slots,
          capacity: capacity.capacity,
          booked: capacity.booked,
          free: Math.max(0, capacity.capacity - capacity.booked),
          bookings: capacity.bookings ?? 0,
          unit: "minutes",
        },
        workers: {
          approved: workersByStatus.approved || 0,
          pendingReview: workersByStatus.pending_review || 0,
          invited: workersByStatus.invited || 0,
          suspended: workersByStatus.suspended || 0,
        },
        newBusinessRequests,
        newContactMessages,
        paidRevenueCents: revenueResult[0]?.total || 0,
        currency: "EUR",
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/v1/admin/dashboard/overview – visual overview (KPI trends, mix)
// All series by Europe/Berlin calendar day. "Last 30 days" vs the 30 before.
// ---------------------------------------------------------------------------
const TZ = "Europe/Berlin";
const pctChange = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

export const getDashboardOverview = async (req, res, next) => {
  try {
    const today = todayInBerlin();
    const tomorrow = new Date(today.getTime() + DAY_MS);
    const from60 = new Date(tomorrow.getTime() - 60 * DAY_MS);
    const keyOf = (d) => d.toISOString().slice(0, 10);
    const days60 = Array.from({ length: 60 }, (_, i) => keyOf(new Date(from60.getTime() + i * DAY_MS)));
    const last30 = days60.slice(30);
    const prev30 = days60.slice(0, 30);
    const todayKey = keyOf(today);
    const [curY, curM] = todayKey.split("-").map(Number);
    const monthStart = new Date(Date.UTC(curY, curM - 1, 1));
    const lastMonthStart = new Date(Date.UTC(curY, curM - 2, 1));
    const yearStart = new Date(Date.UTC(curY, 0, 1));
    const lastYearStart = new Date(Date.UTC(curY - 1, 0, 1));
    const nineMonthsStart = new Date(Date.UTC(curY, curM - 9, 1));
    const dayExpr = (field) => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone: TZ } });
    const completedAt = { $ifNull: ["$job.completedAt", "$workerPayout.earnedAt", "$preferredDate", "$createdAt"] };
    const gross = { $ifNull: ["$pricing.totalCents", { $ifNull: ["$estimate.totalCents", 0] }] };

    const [createdDaily, revenueDaily, customersDaily, cancelledDaily, monthly, resolved, upcoming] = await Promise.all([
      Booking.aggregate([
        { $match: { createdAt: { $gte: from60 } } },
        { $group: { _id: dayExpr("$createdAt"), n: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { status: "completed" } },
        { $addFields: { at: completedAt } },
        { $match: { at: { $gte: from60 } } },
        { $group: { _id: dayExpr("$at"), cents: { $sum: gross }, n: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $match: { role: "consumer", createdAt: { $gte: from60 } } },
        { $group: { _id: dayExpr("$createdAt"), n: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { status: { $in: ["cancelled", "expired"] }, updatedAt: { $gte: from60 } } },
        { $group: { _id: dayExpr("$updatedAt"), n: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { status: "completed" } },
        { $addFields: { at: completedAt } },
        { $match: { at: { $gte: lastYearStart < nineMonthsStart ? lastYearStart : nineMonthsStart } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$at", timezone: TZ } },
            cents: { $sum: gross },
            commission: { $sum: { $ifNull: ["$workerPayout.commissionCents", 0] } },
            n: { $sum: 1 },
          },
        },
      ]),
      // Outcome of bookings whose date lies in the last 90 days
      Booking.aggregate([
        { $match: { preferredDate: { $gte: new Date(today.getTime() - 90 * DAY_MS), $lt: tomorrow }, status: { $in: ["completed", "cancelled", "expired"] } } },
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ]),
      Booking.countDocuments({ status: "confirmed", preferredDate: { $gte: today } }),
    ]);

    const mapOf = (rows, field = "n") => new Map(rows.map((r) => [r._id, r[field]]));
    const created = mapOf(createdDaily);
    const revenue = mapOf(revenueDaily, "cents");
    const customers = mapOf(customersDaily);
    const cancelled = mapOf(cancelledDaily);
    const sum = (map, keys) => keys.reduce((s, k) => s + (map.get(k) ?? 0), 0);
    const series = (map) => last30.map((k) => ({ day: k, value: map.get(k) ?? 0 }));

    const cancelRate = (keys) => {
      const c = sum(cancelled, keys);
      const n = sum(created, keys);
      return n > 0 ? Math.round((c / n) * 1000) / 10 : 0;
    };
    const curCancel = cancelRate(last30);
    const prevCancel = cancelRate(prev30);

    const months = new Map(monthly.map((m) => [m._id, m]));
    const monthKey = (d) => d.toISOString().slice(0, 7);
    const bars = Array.from({ length: 9 }, (_, i) => {
      const d = new Date(Date.UTC(curY, curM - 9 + i, 1));
      const m = months.get(monthKey(d));
      return { month: monthKey(d), revenueCents: m?.cents ?? 0, commissionCents: m?.commission ?? 0, bookings: m?.n ?? 0, partial: i === 8 };
    });
    const sumMonths = (fromDate, toDate) =>
      [...months.entries()].filter(([k]) => k >= monthKey(fromDate) && k < monthKey(toDate)).reduce((s, [, m]) => s + m.cents, 0);
    const thisMonth = months.get(monthKey(monthStart))?.cents ?? 0;
    const lastMonth = months.get(monthKey(lastMonthStart))?.cents ?? 0;
    const thisYear = sumMonths(yearStart, new Date(Date.UTC(curY + 1, 0, 1)));
    const lastYear = sumMonths(lastYearStart, yearStart);

    const res90 = Object.fromEntries(resolved.map((r) => [r._id, r.n]));
    const resolvedTotal = (res90.completed ?? 0) + (res90.cancelled ?? 0) + (res90.expired ?? 0);
    const share = (n) => (resolvedTotal > 0 ? Math.round(((n ?? 0) / resolvedTotal) * 1000) / 10 : 0);

    return res.json({
      success: true,
      today: todayKey,
      kpis: {
        bookings: { value: sum(created, last30), changePct: pctChange(sum(created, last30), sum(created, prev30)), series: series(created) },
        revenue: { valueCents: sum(revenue, last30), changePct: pctChange(sum(revenue, last30), sum(revenue, prev30)), series: series(revenue) },
        customers: { value: sum(customers, last30), changePct: pctChange(sum(customers, last30), sum(customers, prev30)), series: series(customers) },
        cancellation: { ratePct: curCancel, changePts: Math.round((curCancel - prevCancel) * 10) / 10, series: series(cancelled) },
      },
      month: { revenueCents: thisMonth, lastMonthCents: lastMonth, ofLastMonthPct: lastMonth > 0 ? Math.round((thisMonth / lastMonth) * 1000) / 10 : null },
      year: { revenueCents: thisYear, lastYearCents: lastYear, ofLastYearPct: lastYear > 0 ? Math.round((thisYear / lastYear) * 1000) / 10 : null },
      completion: {
        ratePct: share(res90.completed),
        completedPct: share(res90.completed),
        cancelledPct: share(res90.cancelled),
        expiredPct: share(res90.expired),
        resolved: resolvedTotal,
        upcoming,
      },
      monthly: bars,
    });
  } catch (error) {
    next(error);
  }
};
