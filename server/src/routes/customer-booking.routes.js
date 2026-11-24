import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";

import {
  cancelMyBooking,
  getMyBooking,
} from "../controllers/customer-booking.controller.js";
import { messageHandlers } from "../controllers/booking-message.controller.js";
import { createReview } from "../controllers/review.controller.js";

const customerMessages = messageHandlers("customer");

export const customerBookingRouter = Router();

customerBookingRouter.use(protect);

customerBookingRouter.get("/:id", getMyBooking);
customerBookingRouter.post("/:id/cancel", cancelMyBooking);
customerBookingRouter.get("/:id/messages", customerMessages.list);
customerBookingRouter.post("/:id/messages", customerMessages.create);
customerBookingRouter.post("/:id/review", createReview);
