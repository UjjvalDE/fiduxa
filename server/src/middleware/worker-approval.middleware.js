// Use after protect + authorize("worker") on worker JOB routes only.
// Do NOT add to worker-onboarding routes: pending workers must still be able
// to save their profile and bank details.
export const requireApprovedWorker = (req, res, next) => {
  if (!req.user || req.user.role !== "worker") {
    return res.status(403).json({
      success: false,
      message: "Worker access required.",
    });
  }

  if (!req.user.emailVerified) {
    return res.status(403).json({
      success: false,
      message: "Please verify your email first.",
    });
  }

  if (req.user.workerStatus !== "approved") {
    return res.status(403).json({
      success: false,
      message: "Your account is waiting for admin approval.",
      workerStatus: req.user.workerStatus,
    });
  }

  return next();
};
