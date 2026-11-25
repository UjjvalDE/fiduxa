import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./src/config/db.js";
import app from "./src/app.js";
import { loadSettings } from "./src/services/settings.service.js";
import { ensureDefaultPromotions } from "./src/services/promotion.service.js";
import { JOBS } from "./src/jobs/index.js";
import { startScheduler } from "./src/jobs/scheduler.js";
import { setBooting } from "./src/middleware/resilience.middleware.js";
import { installProcessHandlers } from "./src/utils/process-safety.js";
import { initErrorTracking, logger } from "./src/utils/logger.js";

const PORT = process.env.PORT || 3100;

let stopScheduler = () => {};
let server = null;

installProcessHandlers({
  name: "api",
  onShutdown: async () => {
    stopScheduler();
    if (server) {
      // Stop accepting new connections, let in-flight requests finish
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections?.();
      });
    }
    await mongoose.connection.close().catch(() => {});
  },
});

const startServer = async () => {
  await initErrorTracking();

  // Listen right away: /health answers (liveness) and every API route
  // answers 503 DB_UNAVAILABLE until MongoDB is connected and settings loaded.
  setBooting(true);
  server = app.listen(PORT, () => {
    logger.info({ port: PORT }, `Fiduxa API listening on port ${PORT} (health: /health, readiness: /ready)`);
  });
  // Slow-loris / hung-client protection (behind Caddy: keep-alive > proxy idle)
  server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS) || 60_000;
  server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS) || 20_000;
  server.keepAliveTimeout = Number(process.env.HTTP_KEEPALIVE_TIMEOUT_MS) || 65_000;

  // Connect with retry/backoff – never crash because MongoDB is not up yet
  await connectDB();

  // Admin-managed prices & rules (Admin → Einstellungen); retried if the DB blips
  for (let attempt = 1; ; attempt++) {
    try {
      await loadSettings();
      // Welcome offer + Christmas campaign (created once, then admin-managed)
      await ensureDefaultPromotions();
      break;
    } catch (error) {
      logger.error({ err: error.message, attempt }, "Loading settings failed – retrying");
      await new Promise((r) => setTimeout(r, Math.min(30_000, 1_000 * 2 ** attempt)));
    }
  }
  setBooting(false);
  logger.info("Fiduxa API ready");

  // Background jobs (holds, gift cards, e-mail outbox, no-show watch, …).
  // Single-instance deployments run them inside the API; with a dedicated
  // worker (npm run worker) set RUN_JOBS_IN_API=false here. Either way each
  // job is guarded by a DB lock, so running both is safe.
  if (process.env.RUN_JOBS_IN_API !== "false") stopScheduler = startScheduler(JOBS, { label: "api" });
  else logger.info("Background jobs disabled in API (RUN_JOBS_IN_API=false)");
};

startServer().catch((error) => {
  logger.fatal({ err: error }, "Failed to start Fiduxa server");
  process.exit(1);
});
