import { Router } from "express";
import {
  changeMyPassword,
  getMyProfile,
  updateMyProfile,
} from "../controllers/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";

export const userRouter = Router();

userRouter.get("/me", protect, getMyProfile);
userRouter.patch("/me", protect, updateMyProfile);
userRouter.patch("/me/password", protect, changeMyPassword);
