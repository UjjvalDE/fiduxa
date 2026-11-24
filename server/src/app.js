import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { ZodError } from "zod";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";

import { authRouter } from "./routes/auth.routes.js";
import { userRouter } from "./routes/user.routes.js";
import { bookingFlowRouter } from "./routes/booking-flow.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { customerBookingRouter, customerSeriesRouter } from "./routes/customer-booking.routes.js";
import { customerInvoiceRouter } from "./routes/invoice.routes.js";
import { workerOnboardingRouter } from "./routes/worker-onboarding.routes.js";
import { workerJobRouter } from "./routes/worker-job.routes.js";
import { catalogueRouter, publicFormRouter } from "./routes/public.routes.js";
import { paymentRouter } from "./routes/payment.routes.js";
import { giftCardRouter } from "./routes/gift-card.routes.js";
import { handlePayPalWebhook, handleStripeWebhook } from "./controllers/payment.controller.js";
import { captureError, logger } from "./utils/logger.js";

const app = express();

// Behind a reverse proxy (Caddy/Nginx/Netlify) so rate limits see real IPs
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

// ---------- Security & parsing (must run BEFORE routes) ----------
app.use(helmet());

app.use(
  cors({
    origin: (process.env.CLIENT_URL || "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim()),
    credentials: true,
  })
);

// Stripe webhook needs the untouched raw body for signature verification,
// so it is registered BEFORE the JSON body parser.
app.post(
  "/api/v1/payments/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  handleStripeWebhook
);
// PayPal webhook: raw body too (verified via PayPal's verify-webhook-signature API)
app.post(
  "/api/v1/payments/paypal/webhook",
  express.raw({ type: "*/*", limit: "1mb" }),
  handlePayPalWebhook
);

// Global 1 MB JSON limit – except the CV upload route, which gets its own
// larger parser AFTER its rate limiter (see below)
const jsonDefault = express.json({ limit: "1mb" });
app.use((req, res, next) => (req.path.startsWith("/api/v1/jobs/applications") || req.path.startsWith("/api/v1/worker/documents") ? next() : jsonDefault(req, res, next)));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---------- Request logging ----------
// Development: colourful one-liners (morgan). Everything else: structured JSON
// via pino-http with a request id (X-Request-Id is honoured and echoed).
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else if (process.env.NODE_ENV !== "test" || process.env.LOG_REQUESTS === "1") {
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = String(req.headers["x-request-id"] || randomUUID());
        res.setHeader("X-Request-Id", id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === "/health" || req.url === "/ready" },
      customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    })
  );
}

// ---------- Rate limits ----------
// Load tests from one machine would hit the per-IP limits immediately.
// The bypass only works in NODE_ENV=test – never in production.
const rateLimitsOff = process.env.NODE_ENV === "test" && process.env.DISABLE_RATE_LIMIT === "1";

// Local development: every request comes from localhost (dev reloads, session
// polling), so the per-IP limits run out within minutes. Raise them ×50 there;
// production keeps the strict limits.
const devLimitFactor = process.env.NODE_ENV === "development" ? 50 : 1;

const limiter = (windowMinutes, limit) =>
  rateLimitsOff
    ? (req, res, next) => next()
    : rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: limit * devLimitFactor,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests. Please try again later.",
    },
  });

app.use("/api", limiter(15, 300)); // general API
app.use("/api/v1/auth/login", limiter(15, 20)); // brute-force protection
app.use("/api/v1/auth/register", limiter(60, 10));
app.use("/api/v1/auth/forgot-password", limiter(60, 5));
app.use("/api/v1/auth/reset-password", limiter(60, 10));
app.use("/api/v1/worker/accept-invitation", limiter(60, 10));
app.use("/api/v1/business-requests", limiter(60, 10));
app.use("/api/v1/contact", limiter(60, 10));
app.use("/api/v1/jobs/applications", limiter(60, 5), express.json({ limit: "8mb" })); // CV ≤ 5 MB as base64
app.use("/api/v1/worker/documents", express.json({ limit: "8mb" })); // cleaner documents ≤ 5 MB as base64 (package E)
app.use("/api/v1/auth/oauth", limiter(15, 60)); // social login round-trips
app.use("/api/v1/auth/2fa/verify", limiter(15, 20)); // 2FA code guessing (package E)
// Guessing gift card codes / coupons
app.use("/api/v1/gift-cards/check", limiter(15, 20));
app.use("/api/v1/bookings/quote", limiter(15, 200));
app.use("/api/v1/auth/verify-email", limiter(60, 20));
app.use("/api/v1/auth/resend-verification", limiter(60, 5));

// ---------- Health ----------
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Fiduxa API is running.",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// Readiness: only "ready" when MongoDB answers a ping (load balancer / compose healthcheck)
app.get("/ready", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) throw new Error("database not connected");
    await mongoose.connection.db.admin().ping();
    return res.status(200).json({ success: true, ready: true, database: "connected", timestamp: new Date().toISOString() });
  } catch (error) {
    return res.status(503).json({ success: false, ready: false, database: "unavailable", reason: error.message });
  }
});

// ---------- Routes ----------
app.use("/api/v1", catalogueRouter);
app.use("/api/v1", publicFormRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/bookings", bookingFlowRouter);
app.use("/api/v1/customer/bookings", customerBookingRouter);
app.use("/api/v1/customer", customerInvoiceRouter);
app.use("/api/v1/customer/series", customerSeriesRouter);
app.use("/api/v1/payments", paymentRouter);
app.use("/api/v1/gift-cards", giftCardRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/worker/jobs", workerJobRouter);
app.use("/api/v1/worker", workerOnboardingRouter);

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

// ---------- Global error handler ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Validation errors from zod → 422 with field details
  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      message: "Please check the submitted information.",
      details: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  // Invalid JSON body
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON body.",
    });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(422).json({
      success: false,
      message: "Please check the submitted information.",
      details: Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message,
      })),
    });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      message: `Invalid value for ${err.path}.`,
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A record with this value already exists.",
    });
  }

  const statusCode = err.statusCode || 500;

  // 503 = expected "feature not configured" responses – no stack trace needed
  if (statusCode >= 500 && statusCode !== 503) {
    captureError(err, {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      userId: req.user?._id ? String(req.user._id) : undefined,
    });
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? "Internal server error." : err.message,
    ...(err.code && statusCode < 500 && { code: err.code }),
    ...(err.details && { details: err.details }),
  });
});

export default app;
