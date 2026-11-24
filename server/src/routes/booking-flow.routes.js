import { Router } from "express";

import {
  createBookingRequest,
  getAvailableDaysHandler,
  getAvailableSlots,
  getEstimate,
  getQuote,
  getMyBookings,
} from "../controllers/booking-flow.controller.js";

import { optionalAuth, protect } from "../middleware/auth.middleware.js";

export const bookingFlowRouter = Router();

// Public price estimate
bookingFlowRouter.post("/estimate", getEstimate);
// Full checkout price (welcome offer, campaign/code, gift cards, VAT)
bookingFlowRouter.post("/quote", optionalAuth, getQuote);

// Public availability lookup
bookingFlowRouter.get("/availability", getAvailableSlots);
bookingFlowRouter.get("/availability/days", getAvailableDaysHandler);

// Customer-only booking endpoints
bookingFlowRouter.post("/", protect, createBookingRequest);
bookingFlowRouter.get("/my-bookings", protect, getMyBookings);
