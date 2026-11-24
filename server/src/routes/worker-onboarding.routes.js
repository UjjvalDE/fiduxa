import { Router } from "express";

import { protect } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { requireApprovedWorker } from "../middleware/worker-approval.middleware.js";

import {
  acceptWorkerInvitation,
  saveWorkerBankDetails,
  saveWorkerPayoutMethod,
} from "../controllers/worker-onboarding.controller.js";
import { disputeReview, listMyReviews } from "../controllers/review.controller.js";
import { getWorkerPerformance } from "../controllers/worker-performance.controller.js";
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

import { deleteMyDocument, listMyDocuments, uploadMyDocument } from "../controllers/worker-document.controller.js"; // [E]
import { getMyReliability } from "../controllers/worker-reliability.controller.js"; // [E]

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
workerOnboardingRouter.put("/payout-method", workerOnly, saveWorkerPayoutMethod);
workerOnboardingRouter.put("/avatar", workerOnly, uploadAvatar);
workerOnboardingRouter.delete("/avatar", workerOnly, deleteAvatar);
workerOnboardingRouter.put("/availability", workerOnly, setAvailability);
workerOnboardingRouter.post("/holidays", workerOnly, addHoliday);
workerOnboardingRouter.delete("/holidays/:holidayId", workerOnly, deleteHoliday);
// Verification documents + reliability rules (package E)
workerOnboardingRouter.get("/documents", workerOnly, listMyDocuments);
workerOnboardingRouter.post("/documents", workerOnly, uploadMyDocument);
workerOnboardingRouter.delete("/documents/:id", workerOnly, deleteMyDocument);
workerOnboardingRouter.get("/reliability", workerOnly, getMyReliability);

// Approved cleaners only
workerOnboardingRouter.get("/calendar", approvedOnly, getCalendar);
workerOnboardingRouter.get("/earnings", approvedOnly, getEarnings);
workerOnboardingRouter.get("/performance", approvedOnly, getWorkerPerformance);
workerOnboardingRouter.get("/reviews", approvedOnly, listMyReviews);
workerOnboardingRouter.post("/reviews/:id/dispute", approvedOnly, disputeReview);
