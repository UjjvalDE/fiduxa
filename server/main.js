import "dotenv/config";
import connectDB from "./src/config/db.js";
import app from "./src/app.js";
import { loadSettings } from "./src/services/settings.service.js";
import { ensureDefaultPromotions } from "./src/services/promotion.service.js";
import { JOBS } from "./src/jobs/index.js";
import { startScheduler } from "./src/jobs/scheduler.js";
import { captureError, initErrorTracking, logger } from "./src/utils/logger.js";

const PORT = process.env.PORT || 3100;

const startServer = async () => {
  try {
    await initErrorTracking();

    // Connect to MongoDB first
    await connectDB();

    // Admin-managed prices & rules (Admin → Einstellungen)
    await loadSettings();
    // Welcome offer + Christmas campaign (created once, then admin-managed)
    await ensureDefaultPromotions();

    // Start Express server after database connection
    const server = app.listen(PORT, () => {
      console.log("-----------------------------------");
      console.log("       FIDUXA BACKEND SERVER");
      console.log("-----------------------------------");
      console.log(`Server running on port ${PORT}`);
      console.log(`Health: http://localhost:${PORT}/health`);
      console.log("-----------------------------------");
    });

    // Background jobs (holds, gift cards, e-mail outbox, no-show watch, …).
    // Single-instance deployments run them inside the API; with a dedicated
    // worker (npm run worker) set RUN_JOBS_IN_API=false here. Either way each
    // job is guarded by a DB lock, so running both is safe.
    const stopScheduler =
      process.env.RUN_JOBS_IN_API !== "false" ? startScheduler(JOBS, { label: "api" }) : () => {};
    if (process.env.RUN_JOBS_IN_API === "false") logger.info("Background jobs disabled in API (RUN_JOBS_IN_API=false)");

    const shutdown = (signal) => {
      console.log(`${signal} received. Closing server...`);
      stopScheduler();

      server.close(() => {
        console.log("Server closed successfully.");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("unhandledRejection", (reason) => captureError(reason, { source: "unhandledRejection" }));
  } catch (error) {
    console.error("Failed to start Fiduxa server:", error);
    process.exit(1);
  }
};

startServer();
