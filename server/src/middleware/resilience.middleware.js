// Fail fast instead of hanging when the platform is unhealthy.
//
//   dbGuard        – MongoDB not connected → 503 DB_UNAVAILABLE (+ Retry-After)
//   busyGuard      – event loop lagging or too many requests in flight →
//                    503 SERVER_BUSY (+ Retry-After). Thresholds via env:
//                    BUSY_MAX_LAG_MS (default 250, 0 = off),
//                    BUSY_MAX_INFLIGHT (default 400, 0 = off).
//   maintenanceGuard – MAINTENANCE_MODE=true → 503 MAINTENANCE for everything
//                    except admin routes, auth (so admins can sign in), the
//                    payment webhooks and the status probes.
//
// /health and /ready are registered before these guards and stay reachable.
import { monitorEventLoopDelay } from "node:perf_hooks";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { SESSION_COOKIE_NAME } from "../utils/session-cookie.js";

const envNum = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const unavailable = (res, { status = 503, code, message, retryAfter }) => {
  res.setHeader("Retry-After", String(retryAfter));
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ success: false, code, message, retryAfter });
};

// ---------- Database ----------
let booting = false;
/** main.js marks the app as booting until settings are loaded after connect. */
export const setBooting = (value) => {
  booting = Boolean(value);
};
export const isServiceReady = () => mongoose.connection.readyState === 1 && !booting;

export const dbGuard = (req, res, next) => {
  if (isServiceReady()) return next();
  return unavailable(res, {
    code: "DB_UNAVAILABLE",
    message: "The service is temporarily unavailable. Please try again in a moment.",
    retryAfter: envNum("DB_RETRY_AFTER_S", 10),
  });
};

// ---------- Load / backpressure ----------
const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();
let lagMs = 0;
let inFlight = 0;
const sampler = setInterval(() => {
  // Worst delay of the last window (ns → ms); the histogram is reset each window
  lagMs = histogram.max / 1e6;
  histogram.reset();
}, 1_000);
sampler.unref();

export const loadStats = () => ({ eventLoopLagMs: Math.round(lagMs), inFlight });

export const busyGuard = (req, res, next) => {
  const maxLag = envNum("BUSY_MAX_LAG_MS", 250);
  const maxInFlight = envNum("BUSY_MAX_INFLIGHT", 400);
  const tooLaggy = maxLag > 0 && lagMs > maxLag;
  const tooMany = maxInFlight > 0 && inFlight >= maxInFlight;
  if (tooLaggy || tooMany) {
    return unavailable(res, {
      code: "SERVER_BUSY",
      message: "We are very busy right now. Please try again in a few seconds.",
      retryAfter: envNum("BUSY_RETRY_AFTER_S", 5),
    });
  }
  inFlight++;
  let done = false;
  const release = () => {
    if (done) return;
    done = true;
    inFlight--;
  };
  res.on("finish", release);
  res.on("close", release);
  return next();
};

// ---------- Maintenance ----------
export const isMaintenanceMode = () => process.env.MAINTENANCE_MODE === "true";

// Routes that stay open during maintenance
const MAINTENANCE_OPEN = [
  /^\/api\/v1\/admin(\/|$)/,
  /^\/api\/v1\/auth(\/|$)/,
  /^\/api\/v1\/payments\/webhook$/,
  /^\/api\/v1\/payments\/paypal\/webhook$/,
  /^\/api\/v1\/(ready|status)$/,
];

/** Role from the session token without a DB lookup (routes still re-check it). */
const tokenRole = (req) => {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.[SESSION_COOKIE_NAME];
    if (!token || !process.env.JWT_SECRET) return null;
    return jwt.verify(token, process.env.JWT_SECRET)?.role ?? null;
  } catch {
    return null;
  }
};

export const maintenanceGuard = (req, res, next) => {
  if (!isMaintenanceMode() || !req.path.startsWith("/api/")) return next();
  if (MAINTENANCE_OPEN.some((re) => re.test(req.path))) return next();
  if (tokenRole(req) === "admin") return next();
  return unavailable(res, {
    code: "MAINTENANCE",
    message: "Fiduxa is undergoing maintenance. Please try again shortly.",
    retryAfter: envNum("MAINTENANCE_RETRY_AFTER_S", 120),
  });
};
