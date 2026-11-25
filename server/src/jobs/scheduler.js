// Interval scheduler with a per-job MongoDB lock (utils/lock.js → tryWithLock).
// Two processes (API + worker, or two API instances) never execute the same
// job concurrently: whoever does not get the lock skips this tick.
import { tryWithLock } from "../utils/lock.js";
import { logger } from "../utils/logger.js";
import { enableOutboxKick } from "../services/email.service.js";

/** Run one job once, guarded by its lock. Returns { ran, result }. */
export const runJob = async (job) => {
  const started = Date.now();
  try {
    const outcome = await tryWithLock(`job:${job.name}`, () => job.run(), { ttlMs: job.lockMs ?? 5 * 60_000 });
    if (outcome.ran) {
      logger.debug({ job: job.name, ms: Date.now() - started, result: outcome.result }, "Job finished");
    } else {
      logger.debug({ job: job.name }, "Job skipped – lock held by another process");
    }
    return outcome;
  } catch (error) {
    logger.error({ err: error, job: job.name }, "Job failed");
    return { ran: true, error };
  }
};

/**
 * Start every job on its interval. Returns stop(). Jobs with runOnStart run
 * once shortly after boot (useful for daily jobs so a restart never skips them).
 */
export const startScheduler = (jobs, { label = "api" } = {}) => {
  const timers = [];
  let stopped = false;
  // This process delivers the e-mail outbox → new mails get an immediate kick
  if (jobs.some((job) => job.name === "emailOutbox")) enableOutboxKick(true);
  for (const job of jobs) {
    const tick = () => {
      if (!stopped) runJob(job);
    };
    const timer = setInterval(tick, job.everyMs);
    timer.unref?.();
    timers.push(timer);
    if (job.runOnStart) {
      const initial = setTimeout(tick, 5_000 + Math.random() * 5_000);
      initial.unref?.();
      timers.push(initial);
    }
  }
  logger.info({ jobs: jobs.map((j) => `${j.name}@${j.everyMs / 1000}s`), process: label }, "Scheduler started");
  return () => {
    stopped = true;
    enableOutboxKick(false);
    for (const timer of timers) clearTimeout(timer);
  };
};
