import { Router } from "express";

import { forgotPassword, getMe, getSession, login, logout, register, resendVerification, resetPassword, verifyEmail } from "../controllers/auth.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { verifyTwoFactorLogin } from "../controllers/two-factor.controller.js"; // [E]

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
authRouter.get("/session", getSession);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.get("/me", protect, getMe);
authRouter.post("/verify-email", verifyEmail);
authRouter.post("/resend-verification", protect, resendVerification);
authRouter.post("/2fa/verify", verifyTwoFactorLogin); // [E] completes an admin login
