import { Router } from "express";

import { protect } from "../middleware/auth.middleware.js";
import {
  capturePayPalPayment,
  createCheckoutSession,
  getBookingPayment,
  getPaymentConfig,
} from "../controllers/payment.controller.js";

// Mounted at /api/v1/payments (the webhook is mounted separately in app.js
// because it needs the raw request body for signature verification).
export const paymentRouter = Router();

paymentRouter.get("/config", getPaymentConfig);
paymentRouter.get("/booking/:bookingId", protect, getBookingPayment);
paymentRouter.post("/checkout", protect, createCheckoutSession);
paymentRouter.post("/paypal/capture", protect, capturePayPalPayment);
