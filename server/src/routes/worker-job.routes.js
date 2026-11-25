import { Router } from "express";

import { protect } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { requireApprovedWorker } from "../middleware/worker-approval.middleware.js";

import {
  acceptJob,
  completeMyJob,
  confirmMyJobLate,
  reportJobNotHappened,
  declineJob,
  getMyJob,
  listMyJobs,
  listOpenJobs,
  markOnTheWay,
  releaseJob,
  reportJobIssue,
  reportEmergency,
  requestMyExtraTime,
  startMyJob,
} from "../controllers/worker-job.controller.js";
import { dismissWorkerFeedback, getWorkerPendingFeedback, submitWorkerFeedback } from "../controllers/job-feedback.controller.js";
import { messageHandlers } from "../controllers/booking-message.controller.js";
import { listMyWorkerComplaints } from "../controllers/complaint.controller.js";

const workerMessages = messageHandlers("worker");

// Mounted at /api/v1/worker/jobs – approved workers only
export const workerJobRouter = Router();

workerJobRouter.use(protect, authorize("worker"), requireApprovedWorker);

workerJobRouter.get("/", listMyJobs);
// Open jobs (must be registered before "/:id")
workerJobRouter.get("/open", listOpenJobs);
workerJobRouter.get("/feedback/pending", getWorkerPendingFeedback);
// Complaints about my jobs (neutral view: category, status, my restriction)
workerJobRouter.get("/complaints", listMyWorkerComplaints);
workerJobRouter.get("/:id", getMyJob);
workerJobRouter.post("/:id/accept", acceptJob);
workerJobRouter.post("/:id/decline", declineJob);
workerJobRouter.post("/:id/release", releaseJob);
workerJobRouter.post("/:id/emergency", reportEmergency);
workerJobRouter.post("/:id/on-the-way", markOnTheWay);
workerJobRouter.post("/:id/start", startMyJob);
workerJobRouter.post("/:id/complete", completeMyJob);
workerJobRouter.post("/:id/confirm-late", confirmMyJobLate);
workerJobRouter.post("/:id/not-happened", reportJobNotHappened);
workerJobRouter.post("/:id/report-issue", reportJobIssue);
workerJobRouter.post("/:id/extra-time", requestMyExtraTime);
workerJobRouter.post("/:id/feedback", submitWorkerFeedback);
workerJobRouter.post("/:id/feedback/dismiss", dismissWorkerFeedback);
workerJobRouter.get("/:id/messages", workerMessages.list);
workerJobRouter.post("/:id/messages", workerMessages.create);
