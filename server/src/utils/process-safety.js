// Process-level safety nets shared by the API (main.js) and the worker.
//   unhandledRejection → logged (and sent to Sentry when enabled)
//   uncaughtException  → logged, then exit(1) so Docker restarts a clean process
//   SIGTERM / SIGINT   → graceful shutdown: run `onShutdown`, force-exit after
//                        SHUTDOWN_TIMEOUT_MS (default 15 s)
import { captureError, logger } from "./logger.js";

export const installProcessHandlers = ({ name, onShutdown }) => {
  let shuttingDown = false;

  process.on("unhandledRejection", (reason) => captureError(reason, { source: "unhandledRejection", process: name }));
  process.on("uncaughtException", (error) => {
    captureError(error, { source: "uncaughtException", process: name });
    logger.fatal({ process: name }, "Uncaught exception – exiting so the container restarts");
    setTimeout(() => process.exit(1), 200).unref();
  });

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, process: name }, "Shutting down gracefully");
    const force = setTimeout(() => {
      logger.error({ process: name }, "Graceful shutdown timed out – forcing exit");
      process.exit(1);
    }, Number(process.env.SHUTDOWN_TIMEOUT_MS) || 15_000);
    force.unref();
    try {
      await onShutdown(signal);
      logger.info({ process: name }, "Shutdown complete");
      process.exit(0);
    } catch (error) {
      logger.error({ err: error, process: name }, "Error during shutdown");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  return { isShuttingDown: () => shuttingDown };
};
