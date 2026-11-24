// Background job registry. Both the API process (RUN_JOBS_IN_API !== "false")
// and the worker (worker.js) run these through the scheduler; a MongoDB lock
// per job guarantees that only one process executes a given job at a time.
import { expireStaleHolds } from "../services/availability.service.js";
import { alertUnassignedJobs } from "../services/job-dispatch.service.js";
import { loadSettings } from "../services/settings.service.js";
import { expireGiftCards } from "../services/gift-card.service.js";
import { deliverDueGiftCards } from "../services/gift-card-purchase.service.js";
import { expirePersonalCodes } from "../services/personal-code.service.js";
import { reconcileCommissionTiers } from "../services/commission.service.js";
import { purgeOldApplications } from "../controllers/worker-application.controller.js";
import { processEmailOutbox } from "../services/email.service.js";
import { detectNoShows } from "../services/no-show.service.js";
import { logger } from "../utils/logger.js";

const MINUTE = 60_000;

// Run several independent tasks; one failure never stops the others.
const runAll = async (tasks) => {
  const summary = {};
  for (const [name, fn] of Object.entries(tasks)) {
    try {
      summary[name] = await fn();
    } catch (error) {
      summary[name] = `error: ${error.message}`;
      logger.error({ err: error, task: name }, "Job task failed");
    }
  }
  return summary;
};

export const JOBS = [
  {
    // Release unpaid holds, gift card delivery/expiry, personal codes, settings
    // changed by another instance, "still unassigned" alerts
    name: "housekeeping",
    everyMs: MINUTE,
    run: () =>
      runAll({
        expiredHolds: expireStaleHolds,
        giftCardsDelivered: deliverDueGiftCards,
        giftCardsExpired: expireGiftCards,
        personalCodesExpired: expirePersonalCodes,
        settingsReloaded: async () => {
          await loadSettings();
          return true;
        },
        unassignedAlerts: alertUnassignedJobs,
      }),
  },
  {
    // Safety net: recompute commission tiers; GDPR purge of old applications
    name: "dailyMaintenance",
    everyMs: 24 * 60 * MINUTE,
    runOnStart: true,
    run: () => runAll({ tiersReconciled: reconcileCommissionTiers, applicationsPurged: purgeOldApplications }),
  },
  {
    // Deliver queued / retry-due transactional e-mails
    name: "emailOutbox",
    everyMs: 30_000,
    run: () => processEmailOutbox(),
  },
  {
    // Cleaner has not checked in 15 min after the start → alert office + customer
    name: "noShowWatch",
    everyMs: 5 * MINUTE,
    run: () => detectNoShows(),
  },
];

// Recurring bookings (owned by another module) – optional until the file exists
try {
  const m = await import("./recurring.js");
  if (m.recurringJob) JOBS.push(m.recurringJob);
} catch {
  /* recurring.js not present yet */
}

export const findJob = (name) => JOBS.find((job) => job.name === name);
