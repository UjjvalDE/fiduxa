import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import { getDashboardStats } from "../controllers/dashboard.controller.js";

export const dashboardRouter = Router();

dashboardRouter.get("/stats", protect, authorize("admin"), getDashboardStats);
