// Background worker: runs the job registry (src/jobs/index.js) without
// serving HTTP. Start with `npm run worker` (or the "worker" service in
// docker-compose.yml). Safe to run next to the API – every job takes a
// MongoDB lock, so nothing runs twice.
//
// Resilience: the worker waits (with backoff) for MongoDB instead of
// crashing; while the database is down the scheduler skips its ticks and
// resumes automatically. Queued e-mails stay in the outbox until then.
import "dotenv/config";
import mongoose from "mongoose";
import { writeFileSync } from "node:fs";
import connectDB from "./src/config/db.js";
import { loadSettings } from "./src/services/settings.service.js";
import { JOBS } from "./src/jobs/index.js";
import { startScheduler } from "./src/jobs/scheduler.js";
import { installProcessHandlers } from "./src/utils/process-safety.js";
import { initErrorTracking, logger } from "./src/utils/logger.js";

process.env.SERVICE_NAME ||= "fiduxa-worker";

let stop = () => {};
let keepAlive = null;

installProcessHandlers({
  name: "worker",
  onShutdown: async () => {
    stop();
    if (keepAlive) clearInterval(keepAlive);
    await mongoose.connection.close().catch(() => {});
  },
});

// Heartbeat file for the Docker healthcheck: written every 30 s while the
// event loop is alive (mtime is checked by the compose healthcheck).
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE || "/tmp/fiduxa-worker.alive";
const beat = () => {
  try {
    writeFileSync(HEARTBEAT_FILE, `${Date.now()} db=${mongoose.connection.readyState === 1 ? "up" : "down"}\n`);
  } catch {
    /* read-only fs – healthcheck falls back to process check */
  }
};

const start = async () => {
  await initErrorTracking();
  beat();
  keepAlive = setInterval(beat, 30_000);
  await connectDB();
  for (let attempt = 1; ; attempt++) {
    try {
      await loadSettings();
      break;
    } catch (error) {
      logger.error({ err: error.message, attempt }, "Worker: loading settings failed – retrying");
      await new Promise((r) => setTimeout(r, Math.min(30_000, 1_000 * 2 ** attempt)));
    }
  }
  stop = startScheduler(JOBS, { label: "worker" });
};

start().catch((error) => {
  logger.fatal({ err: error }, "Worker failed to start");
  process.exit(1);
});
