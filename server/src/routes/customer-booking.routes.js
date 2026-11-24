import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";

import {
  cancelMyBooking,
  decideMyAdjustment,
  editOwnBooking,
  getCancelPreview,
  getMyBooking,
  payMyAdjustment,
} from "../controllers/customer-booking.controller.js";
import { messageHandlers } from "../controllers/booking-message.controller.js";
import { createReview } from "../controllers/review.controller.js";
import { getMySeries, listMySeries, skipMyOccurrence, updateMySeries } from "../controllers/recurring-series.controller.js";

const customerMessages = messageHandlers("customer");

export const customerBookingRouter = Router();

customerBookingRouter.use(protect);

customerBookingRouter.get("/:id", getMyBooking);
customerBookingRouter.get("/:id/cancel-preview", getCancelPreview);
customerBookingRouter.post("/:id/cancel", cancelMyBooking);
// Price adjustments (duration review / edits of paid bookings): customer decides, pays
customerBookingRouter.post("/:id/adjustments/:adjId", decideMyAdjustment);
customerBookingRouter.post("/:id/adjustments/:adjId/pay", payMyAdjustment);
customerBookingRouter.patch("/:id", editOwnBooking);
customerBookingRouter.get("/:id/messages", customerMessages.list);
customerBookingRouter.post("/:id/messages", customerMessages.create);
customerBookingRouter.post("/:id/review", createReview);

// Recurring cleaning plans ("Mein Putzplan") – mounted at /api/v1/customer/series
export const customerSeriesRouter = Router();
customerSeriesRouter.use(protect);
customerSeriesRouter.get("/", listMySeries);
customerSeriesRouter.get("/:id", getMySeries);
customerSeriesRouter.patch("/:id", updateMySeries);
customerSeriesRouter.post("/:id/skip", skipMyOccurrence);
