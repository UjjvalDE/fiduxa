import { Router } from "express";
import {
  changeMyPassword,
  getMyHousehold,
  getMyProfile,
  getMyWelcomeCode,
  updateMyHousehold,
  updateMyProfile,
} from "../controllers/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { deleteMyAccount, exportMyData } from "../controllers/account-privacy.controller.js";
import { disableTwoFactor, enableTwoFactor, getTwoFactorStatus, setupTwoFactor } from "../controllers/two-factor.controller.js"; // [E]

export const userRouter = Router();

userRouter.get("/me", protect, getMyProfile);
userRouter.get("/me/welcome-code", protect, getMyWelcomeCode);
userRouter.patch("/me", protect, updateMyProfile);
userRouter.patch("/me/password", protect, changeMyPassword);
// Admin two-factor authentication (package E)
userRouter.get("/me/2fa", protect, getTwoFactorStatus);
userRouter.post("/me/2fa/setup", protect, setupTwoFactor);
userRouter.post("/me/2fa/enable", protect, enableTwoFactor);
userRouter.post("/me/2fa/disable", protect, disableTwoFactor);

userRouter.get("/me/household", protect, getMyHousehold);
userRouter.put("/me/household", protect, updateMyHousehold);

// GDPR self-service (customers and cleaners): data export + account deletion
userRouter.get("/me/export", protect, exportMyData);
userRouter.delete("/me", protect, deleteMyAccount);
