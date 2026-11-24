import { Router } from "express";

import {
  forgotPassword,
  getMe,
  login,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "../controllers/auth.controller.js";

import { protect } from "../middleware/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.get("/me", protect, getMe);
authRouter.post("/verify-email", verifyEmail);
authRouter.post("/resend-verification", protect, resendVerification);
