import { Router } from "express";

import { protect } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";

import {
  createWorker,
  getPendingWorkers,
  getWorkerForReview,
  listWorkers,
  resendWorkerInvitation,
  reviewWorker,
  setWorkerStatus,
} from "../controllers/worker-admin.controller.js";

import {
  assignWorker,
  getAllBookings,
  getAuditLogs,
  getBookingDetails,
  getCustomerDetails,
  getCustomers,
  setCustomerActive,
  updateBookingNotes,
  updateBookingStatus,
} from "../controllers/admin.controller.js";

import {
  getBusinessRequest,
  listBusinessRequests,
  updateBusinessRequest,
} from "../controllers/business-request.controller.js";

import {
  listContactMessages,
  updateContactMessage,
} from "../controllers/contact.controller.js";

import { getDashboardStats } from "../controllers/dashboard.controller.js";
import {
  createSlots,
  deleteSlot,
  listSlots,
  updateSlot,
} from "../controllers/admin-slot.controller.js";
import { listPayments, refundPayment } from "../controllers/payment.controller.js";
import { messageHandlers } from "../controllers/booking-message.controller.js";
import { listReviews, setReviewHidden } from "../controllers/review.controller.js";
import {
  createWorkerPayout,
  listOpenPayouts,
  listPayouts,
  setBookingPayoutHold,
  setWorkerPayRate,
} from "../controllers/admin-payout.controller.js";

import { getSettings, recordBookingCash, updateSettings } from "../controllers/admin-settings.controller.js";
import { createAdmin, listAdmins, resendAdminInvite, setAdminActive } from "../controllers/admin-team.controller.js";

import {
  createPromotion,
  deletePromotion,
  getPromotion,
  listPromotions,
  setPromotionActive,
  updatePromotion,
} from "../controllers/admin-promotion.controller.js";
import {
  adjustGiftCard,
  getGiftCard,
  issueGiftCard,
  listGiftCards,
  resendGiftCard,
  setGiftCardDisabled,
} from "../controllers/admin-gift-card.controller.js";
import { getAnalytics } from "../controllers/admin-analytics.controller.js";

const adminMessages = messageHandlers("admin");

export const adminRouter = Router();

// All routes below require admin authentication
adminRouter.use(protect, authorize("admin"));

// Dashboard
adminRouter.get("/dashboard/stats", getDashboardStats);

// Worker management
adminRouter.get("/workers", listWorkers);
adminRouter.post("/workers/invite", createWorker);
adminRouter.get("/workers/pending", getPendingWorkers);
adminRouter.get("/workers/:id/review", getWorkerForReview);
adminRouter.patch("/workers/:id/review", reviewWorker);
adminRouter.patch("/workers/:id/status", setWorkerStatus);
adminRouter.post("/workers/:id/resend-invitation", resendWorkerInvitation);
adminRouter.patch("/workers/:id/pay-rate", setWorkerPayRate);

// Booking management
adminRouter.get("/bookings", getAllBookings);
adminRouter.get("/bookings/:id", getBookingDetails);
adminRouter.patch("/bookings/:id/status", updateBookingStatus);
adminRouter.patch("/bookings/:id/assign", assignWorker);
adminRouter.patch("/bookings/:id/notes", updateBookingNotes);
adminRouter.patch("/bookings/:id/payout", setBookingPayoutHold);
adminRouter.patch("/bookings/:id/cash", recordBookingCash);

// Platform settings (prices, extras, booking rules, payment options, cleaner pay)
adminRouter.get("/settings", getSettings);
adminRouter.put("/settings", updateSettings);

// Promotions (welcome offer, campaigns, coupons)
adminRouter.get("/promotions", listPromotions);
adminRouter.post("/promotions", createPromotion);
adminRouter.get("/promotions/:id", getPromotion);
adminRouter.patch("/promotions/:id", updatePromotion);
adminRouter.patch("/promotions/:id/active", setPromotionActive);
adminRouter.delete("/promotions/:id", deletePromotion);

// Gift cards
adminRouter.get("/gift-cards", listGiftCards);
adminRouter.post("/gift-cards/issue", issueGiftCard);
adminRouter.get("/gift-cards/:id", getGiftCard);
adminRouter.post("/gift-cards/:id/disable", setGiftCardDisabled(true));
adminRouter.post("/gift-cards/:id/enable", setGiftCardDisabled(false));
adminRouter.post("/gift-cards/:id/adjust", adjustGiftCard);
adminRouter.post("/gift-cards/:id/resend", resendGiftCard);

// Analytics (promotions, gift cards, conversion, revenue)
adminRouter.get("/analytics", getAnalytics);

// Admin accounts
adminRouter.get("/admins", listAdmins);
adminRouter.post("/admins", createAdmin);
adminRouter.patch("/admins/:id", setAdminActive);
adminRouter.post("/admins/:id/resend-invite", resendAdminInvite);
adminRouter.get("/bookings/:id/messages", adminMessages.list);
adminRouter.post("/bookings/:id/messages", adminMessages.create);

// Cleaner payouts (after WORKER_PAY.payoutDelayDays)
adminRouter.get("/payouts/open", listOpenPayouts);
adminRouter.get("/payouts", listPayouts);
adminRouter.post("/payouts", createWorkerPayout);

// Reviews
adminRouter.get("/reviews", listReviews);
adminRouter.patch("/reviews/:id", setReviewHidden);

// Availability slots
adminRouter.get("/slots", listSlots);
adminRouter.post("/slots", createSlots);
adminRouter.patch("/slots/:id", updateSlot);
adminRouter.delete("/slots/:id", deleteSlot);

// Customers
adminRouter.get("/customers", getCustomers);
adminRouter.get("/customers/:id", getCustomerDetails);
adminRouter.patch("/customers/:id/status", setCustomerActive);

// Business (B2B) requests
adminRouter.get("/business-requests", listBusinessRequests);
adminRouter.get("/business-requests/:id", getBusinessRequest);
adminRouter.patch("/business-requests/:id", updateBusinessRequest);

// Contact messages
adminRouter.get("/contact-messages", listContactMessages);
adminRouter.patch("/contact-messages/:id", updateContactMessage);

// Payments
adminRouter.get("/payments", listPayments);
adminRouter.post("/payments/:id/refund", refundPayment);

// Audit log
adminRouter.get("/audit-logs", getAuditLogs);
