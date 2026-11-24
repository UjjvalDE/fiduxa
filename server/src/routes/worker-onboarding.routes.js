import { Router } from "express";

import { protect } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { requireApprovedWorker } from "../middleware/worker-approval.middleware.js";

import {
  acceptWorkerInvitation,
  saveWorkerBankDetails,
} from "../controllers/worker-onboarding.controller.js";
import {
  addHoliday,
  deleteAvatar,
  deleteHoliday,
  getCalendar,
  getEarnings,
  getWorkerOverview,
  saveWorkerProfile,
  setAvailability,
  uploadAvatar,
} from "../controllers/worker-profile.controller.js";

export const workerOnboardingRouter = Router();

// Public route: invitation link is validated using its one-time token
workerOnboardingRouter.post("/accept-invitation", acceptWorkerInvitation);

// Routes below require an authenticated worker (approval NOT required,
// so pending workers can finish onboarding and prepare their profile)
const workerOnly = [protect, authorize("worker")];
const approvedOnly = [...workerOnly, requireApprovedWorker];

workerOnboardingRouter.get("/me", workerOnly, getWorkerOverview);
workerOnboardingRouter.put("/profile", workerOnly, saveWorkerProfile);
workerOnboardingRouter.put("/bank-details", workerOnly, saveWorkerBankDetails);
workerOnboardingRouter.put("/avatar", workerOnly, uploadAvatar);
workerOnboardingRouter.delete("/avatar", workerOnly, deleteAvatar);
workerOnboardingRouter.put("/availability", workerOnly, setAvailability);
workerOnboardingRouter.post("/holidays", workerOnly, addHoliday);
workerOnboardingRouter.delete("/holidays/:holidayId", workerOnly, deleteHoliday);

// Approved cleaners only
workerOnboardingRouter.get("/calendar", approvedOnly, getCalendar);
workerOnboardingRouter.get("/earnings", approvedOnly, getEarnings);
