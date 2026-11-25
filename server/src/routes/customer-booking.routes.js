import { Router } from "express";
import { protect, requireCompleteProfile } from "../middleware/auth.middleware.js";

import {
  cancelMyBooking,
  chooseMyAlternative,
  getMyAlternatives,
  decideMyAdjustment,
  editOwnBooking,
  getCancelPreview,
  getMyBooking,
  payMyAdjustment,
} from "../controllers/customer-booking.controller.js";
import { messageHandlers } from "../controllers/booking-message.controller.js";
import { createReview } from "../controllers/review.controller.js";
import { getMySeries, listMySeries, skipMyOccurrence, updateMySeries } from "../controllers/recurring-series.controller.js";
import { dismissMyFeedback, getMyPendingFeedback } from "../controllers/job-feedback.controller.js";
import { createMyComplaint, listMyBookingComplaints } from "../controllers/complaint.controller.js";

const customerMessages = messageHandlers("customer");

export const customerBookingRouter = Router();

customerBookingRouter.use(protect);

// Feedback pop-up (must be registered before "/:id")
customerBookingRouter.get("/feedback/pending", getMyPendingFeedback);
customerBookingRouter.get("/:id", getMyBooking);
customerBookingRouter.post("/:id/feedback/dismiss", dismissMyFeedback);
customerBookingRouter.get("/:id/cancel-preview", getCancelPreview);
customerBookingRouter.post("/:id/cancel", cancelMyBooking);
// No cleaner available: pick an alternative time / wait / cancel free
customerBookingRouter.get("/:id/alternatives", getMyAlternatives);
customerBookingRouter.post("/:id/alternatives", chooseMyAlternative);
// Price adjustments (duration review / edits of paid bookings): customer decides, pays
customerBookingRouter.post("/:id/adjustments/:adjId", decideMyAdjustment);
customerBookingRouter.post("/:id/adjustments/:adjId/pay", requireCompleteProfile, payMyAdjustment);
customerBookingRouter.patch("/:id", editOwnBooking);
customerBookingRouter.get("/:id/messages", customerMessages.list);
customerBookingRouter.post("/:id/messages", customerMessages.create);
customerBookingRouter.post("/:id/review", createReview);
// Complaints about the cleaning (own bookings only)
customerBookingRouter.get("/:id/complaints", listMyBookingComplaints);
customerBookingRouter.post("/:id/complaints", createMyComplaint);

// Recurring cleaning plans ("Mein Putzplan") – mounted at /api/v1/customer/series
export const customerSeriesRouter = Router();
customerSeriesRouter.use(protect);
customerSeriesRouter.get("/", listMySeries);
customerSeriesRouter.get("/:id", getMySeries);
customerSeriesRouter.patch("/:id", updateMySeries);
customerSeriesRouter.post("/:id/skip", skipMyOccurrence);
