// Structured JSON logging (pino). One logger for API + worker; request logs
// come from pino-http (see app.js) and carry a request id.
//   LOG_LEVEL=debug|info|warn|error   (default: info, test: warn)
import pino from "pino";

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "warn" : "info");

export const logger = pino({
  level,
  base: { service: process.env.SERVICE_NAME || "fiduxa-api", env: process.env.NODE_ENV || "development" },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token"],
    censor: "[redacted]",
  },
});

// ---------------------------------------------------------------------------
// Optional error tracking. @sentry/node is NOT a dependency – when SENTRY_DSN
// is set we try to load it and simply log a warning if it is not installed.
// ---------------------------------------------------------------------------
let sentry = null;

export const initErrorTracking = async () => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || sentry) return sentry;
  try {
    const mod = await import("@sentry/node");
    mod.init({ dsn, environment: process.env.NODE_ENV || "development", tracesSampleRate: 0 });
    sentry = mod;
    logger.info("Sentry error tracking enabled");
  } catch (error) {
    logger.warn({ err: error.message }, "SENTRY_DSN is set but @sentry/node is not installed – errors are logged only");
  }
  return sentry;
};

/** Report an unexpected error (logged always, forwarded to Sentry when enabled). */
export const captureError = (error, context = {}) => {
  logger.error({ err: error, ...context }, error?.message || "Unhandled error");
  try {
    sentry?.captureException?.(error, { extra: context });
  } catch {
    /* never let error reporting throw */
  }
};

export default logger;
