import { Router } from "express";
import { getFinanceOverview } from "../controllers/admin-finance.controller.js";
import {
  downloadApplicationCv,
  getApplication,
  inviteApplicant,
  listApplications,
  updateApplication,
} from "../controllers/worker-application.controller.js";
import {
  commissionOverview,
  commissionReport,
  commissionWorkerDetail,
  setCommissionOverride,
} from "../controllers/admin-commission.controller.js";

import { dispatchAssign, dispatchAuto, dispatchUnassign, getDispatchBooking, getDispatchOverview } from "../controllers/admin-dispatch.controller.js";
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
  editBookingDetails,
  getAllBookings,
  getAuditLogs,
  getBookingDetails,
  getCustomerDetails,
  getCustomers,
  setCustomerActive,
  updateBookingNotes,
  updateBookingStatus,
  listStuckJobs,
  decideNotHappened,
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

import { getDashboardOverview, getDashboardStats } from "../controllers/dashboard.controller.js";
import {
  createSlots,
  deleteSlot,
  listSlots,
  updateSlot,
} from "../controllers/admin-slot.controller.js";
import { listPayments, refundPayment } from "../controllers/payment.controller.js";
import { messageHandlers } from "../controllers/booking-message.controller.js";
import { listReviews, resolveReviewDispute, setReviewHidden } from "../controllers/review.controller.js";
import {
  createWorkerPayout,
  listOpenPayouts,
  refreshWorkerPayout,
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
import { getEmail, listEmails, resendEmailById } from "../controllers/admin-email.controller.js";
// [slot-A-imports]
import { adminListSeries, adminUpdateSeries } from "../controllers/recurring-series.controller.js";
// [slot-B-imports]
import { downloadInvoiceAsAdmin } from "../controllers/invoice.controller.js";
import { deleteCustomerAsAdmin } from "../controllers/account-privacy.controller.js";
import { createCustomerByAdmin, createManualBooking, searchCustomers } from "../controllers/admin-manual.controller.js";
// [slot-C-imports]
import { adminCancelPreview, createDurationAdjustment, listCashDebt, resolveBookingAdjustment } from "../controllers/admin-money.controller.js";
// [slot-D-imports]
import { downloadWorkerDocument, listDocumentQueue, reviewWorkerDocument } from "../controllers/worker-document.controller.js";
import { getWorkerReliability, markNoShow, unpauseWorkerAction } from "../controllers/admin-trust.controller.js";
// [slot-E-imports]
// [slot-F-imports]

const adminMessages = messageHandlers("admin");

import { adminFeedbackCsv, adminFeedbackSummary } from "../controllers/job-feedback.controller.js";
import {
  adminAddNote,
  adminCloseComplaint,
  adminComplaintAction,
  adminComplaintPhoto,
  adminGetComplaint,
  adminListComplaints,
  adminStartReview,
} from "../controllers/complaint.controller.js";
export const adminRouter = Router();

// All routes below require admin authentication
adminRouter.use(protect, authorize("admin"));

// Dashboard
adminRouter.get("/dashboard/stats", getDashboardStats);
adminRouter.get("/dashboard/overview", getDashboardOverview);

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
adminRouter.get("/bookings/stuck", listStuckJobs);
adminRouter.get("/bookings/:id", getBookingDetails);
adminRouter.patch("/bookings/:id/details", editBookingDetails);
adminRouter.patch("/bookings/:id/status", updateBookingStatus);
adminRouter.patch("/bookings/:id/not-happened", decideNotHappened);
adminRouter.patch("/bookings/:id/assign", assignWorker);
// Disposition (automatic assignment): overview, ranked cleaners, manual reassignment
adminRouter.get("/dispatch", getDispatchOverview);
adminRouter.get("/dispatch/bookings/:id", getDispatchBooking);
adminRouter.post("/dispatch/bookings/:id/assign", dispatchAssign);
adminRouter.post("/dispatch/bookings/:id/auto", dispatchAuto);
adminRouter.post("/dispatch/bookings/:id/unassign", dispatchUnassign);
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

// Cleaner payouts (monthly: previous month's earnings on POLICIES.payouts.payoutDayOfMonth)
adminRouter.get("/payouts/open", listOpenPayouts);
adminRouter.get("/payouts", listPayouts);
adminRouter.post("/payouts", createWorkerPayout);
adminRouter.post("/payouts/:id/refresh", refreshWorkerPayout);

// Reviews
adminRouter.get("/reviews", listReviews);
// Structured post-service feedback (internal): averages + CSV
adminRouter.get("/feedback", adminFeedbackSummary);
adminRouter.get("/feedback/export.csv", adminFeedbackCsv);
// Customer complaints (review, remedies, cleaner restrictions)
adminRouter.get("/complaints", adminListComplaints);
adminRouter.get("/complaints/:id", adminGetComplaint);
adminRouter.get("/complaints/:id/photos/:photoId", adminComplaintPhoto);
adminRouter.post("/complaints/:id/review", adminStartReview);
adminRouter.post("/complaints/:id/notes", adminAddNote);
adminRouter.post("/complaints/:id/actions", adminComplaintAction);
adminRouter.post("/complaints/:id/resolve", adminCloseComplaint("resolved"));
adminRouter.post("/complaints/:id/reject", adminCloseComplaint("rejected"));
adminRouter.patch("/reviews/:id", setReviewHidden);
adminRouter.patch("/reviews/:id/dispute", resolveReviewDispute);

// Rating-based commission system
adminRouter.get("/commission", commissionOverview);
adminRouter.get("/finance", getFinanceOverview);

// Cleaner job applications (public "Become a cleaner" form)
adminRouter.get("/applications", listApplications);
adminRouter.get("/applications/:id", getApplication);
adminRouter.get("/applications/:id/cv", downloadApplicationCv);
adminRouter.patch("/applications/:id", updateApplication);
adminRouter.post("/applications/:id/invite", inviteApplicant);
adminRouter.get("/commission/report", commissionReport);
adminRouter.get("/commission/workers/:id", commissionWorkerDetail);
adminRouter.patch("/workers/:id/commission-override", setCommissionOverride);

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

// E-mail outbox / send log
adminRouter.get("/emails", listEmails);
adminRouter.get("/emails/:id", getEmail);
adminRouter.post("/emails/:id/resend", resendEmailById);
// [slot-A-routes]
// Recurring cleaning plans (Putzpläne)
adminRouter.get("/series", adminListSeries);
adminRouter.patch("/series/:id", adminUpdateSeries);
// [slot-B-routes]
// Invoices, GDPR deletion, phone orders (manual customers + bookings)
adminRouter.get("/bookings/:id/invoice", downloadInvoiceAsAdmin);
adminRouter.post("/bookings", createManualBooking);
adminRouter.get("/customer-search", searchCustomers);
adminRouter.post("/customers", createCustomerByAdmin);
adminRouter.delete("/customers/:id", deleteCustomerAsAdmin);
// [slot-C-routes]
// Money policies: duration-based price adjustments, open adjustments, cancellation fee preview, cash debt
adminRouter.post("/bookings/:id/duration-adjustment", createDurationAdjustment);
adminRouter.patch("/bookings/:id/adjustments/:adjId", resolveBookingAdjustment);
adminRouter.get("/bookings/:id/cancel-preview", adminCancelPreview);
adminRouter.get("/cash-debt", listCashDebt);
// [slot-D-routes]
// Trust & security (package E): documents, no-show, reliability pause
adminRouter.get("/documents/queue", listDocumentQueue); // all pending docs + jobs beyond expiry
adminRouter.get("/workers/:id/documents/:docId", downloadWorkerDocument);
adminRouter.patch("/workers/:id/documents/:docId", reviewWorkerDocument);
adminRouter.get("/workers/:id/reliability", getWorkerReliability);
adminRouter.post("/workers/:id/unpause", unpauseWorkerAction);
adminRouter.post("/bookings/:id/no-show", markNoShow);
// [slot-E-routes]
// [slot-F-routes]
