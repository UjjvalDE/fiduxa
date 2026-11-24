// Background worker: runs the job registry (src/jobs/index.js) without
// serving HTTP. Start with `npm run worker` (or the "worker" service in
// docker-compose.yml). Safe to run next to the API – every job takes a
// MongoDB lock, so nothing runs twice.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./src/config/db.js";
import { loadSettings } from "./src/services/settings.service.js";
import { JOBS } from "./src/jobs/index.js";
import { startScheduler } from "./src/jobs/scheduler.js";
import { initErrorTracking, logger } from "./src/utils/logger.js";

process.env.SERVICE_NAME ||= "fiduxa-worker";

const start = async () => {
  try {
    await initErrorTracking();
    await connectDB();
    await loadSettings();

    const stop = startScheduler(JOBS, { label: "worker" });
    // Keep the event loop alive (interval timers are unref'ed)
    const keepAlive = setInterval(() => {}, 60_000);

    const shutdown = async (signal) => {
      logger.info({ signal }, "Worker shutting down");
      stop();
      clearInterval(keepAlive);
      await mongoose.connection.close().catch(() => {});
      process.exit(0);
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("unhandledRejection", (reason) => logger.error({ err: reason }, "Unhandled rejection in worker"));
  } catch (error) {
    logger.fatal({ err: error }, "Worker failed to start");
    process.exit(1);
  }
};

start();
