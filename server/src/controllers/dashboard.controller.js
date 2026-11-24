import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import BusinessRequest from "../models/business-request.model.js";
import ContactMessage from "../models/contact-message.model.js";
import AvailabilitySlot from "../models/availability-slot.model.js";
import { DAY_MS, todayInBerlin } from "../utils/helpers.js";

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
