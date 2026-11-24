import { Router } from "express";

import { protect } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { requireApprovedWorker } from "../middleware/worker-approval.middleware.js";

import {
  acceptJob,
  completeMyJob,
  declineJob,
  getMyJob,
  listMyJobs,
  listOpenJobs,
  markOnTheWay,
  releaseJob,
  reportJobIssue,
  startMyJob,
} from "../controllers/worker-job.controller.js";
import { messageHandlers } from "../controllers/booking-message.controller.js";

const workerMessages = messageHandlers("worker");

// Mounted at /api/v1/worker/jobs – approved workers only
export const workerJobRouter = Router();

workerJobRouter.use(protect, authorize("worker"), requireApprovedWorker);

workerJobRouter.get("/", listMyJobs);
// Open jobs (must be registered before "/:id")
workerJobRouter.get("/open", listOpenJobs);
workerJobRouter.get("/:id", getMyJob);
workerJobRouter.post("/:id/accept", acceptJob);
workerJobRouter.post("/:id/decline", declineJob);
workerJobRouter.post("/:id/release", releaseJob);
workerJobRouter.post("/:id/on-the-way", markOnTheWay);
workerJobRouter.post("/:id/start", startMyJob);
workerJobRouter.post("/:id/complete", completeMyJob);
workerJobRouter.post("/:id/report-issue", reportJobIssue);
workerJobRouter.get("/:id/messages", workerMessages.list);
workerJobRouter.post("/:id/messages", workerMessages.create);
