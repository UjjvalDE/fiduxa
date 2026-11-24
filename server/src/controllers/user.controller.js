import bcrypt from "bcryptjs";
import { z } from "zod";

import User from "../models/user.model.js";
import generateToken from "../utils/generate-token.js";

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  preferredLanguage: z.enum(["de", "en", "pl"]).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

export const getMyProfile = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      role: req.user.role,
      emailVerified: Boolean(req.user.emailVerified),
      preferredLanguage: req.user.preferredLanguage ?? "de",
      createdAt: req.user.createdAt,
    },
  });
};

export const updateMyProfile = async (req, res, next) => {
  try {
    const data = updateProfileSchema.parse(req.body);

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: data },
      { returnDocument: "after", runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        preferredLanguage: updatedUser.preferredLanguage ?? "de",
      },
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/users/me/password
export const changeMyPassword = async (req, res, next) => {
  try {
    const data = changePasswordSchema.parse(req.body);

    const user = await User.findById(req.user._id).select("+password");

    const matches = await bcrypt.compare(data.currentPassword, user.password);

    if (!matches) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    user.password = await bcrypt.hash(data.newPassword, 12);
    user.passwordChangedAt = new Date();
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    // Old tokens are now invalid – return a fresh one
    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
      token: generateToken(user),
    });
  } catch (error) {
    next(error);
  }
};
