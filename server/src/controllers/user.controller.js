import bcrypt from "bcryptjs";
import { z } from "zod";

import User from "../models/user.model.js";
import generateToken from "../utils/generate-token.js";
import { setSessionCookie } from "../utils/session-cookie.js";
import { welcomeCodeFor } from "../services/personal-code.service.js";

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
    const token = generateToken(user);
    setSessionCookie(res, token);
    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
      token,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/users/me/welcome-code – the customer's personal welcome code
// (issued after email verification; older verified accounts get one on first call)
export const getMyWelcomeCode = async (req, res, next) => {
  try {
    if (req.user.role !== "consumer") return res.json({ success: true, welcome: null });
    if (!req.user.emailVerified) return res.json({ success: true, welcome: { status: "verify_email" } });
    const result = await welcomeCodeFor(req.user);
    if (!result) return res.json({ success: true, welcome: null });
    const { promo, code } = result;
    const expired = code.status === "expired" || (code.expiresAt && code.expiresAt <= new Date());
    return res.json({
      success: true,
      welcome: {
        code: code.code,
        status: expired && code.status === "issued" ? "expired" : code.status,
        expiresAt: code.expiresAt,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        maxDiscountCents: promo.maxDiscountCents,
        minOrderCents: promo.minOrderCents,
      },
    });
  } catch (error) {
    next(error);
  }
};

const householdSchema = z.object({
  areaM2: z.coerce.number().min(15).max(1000).optional(),
  condition: z.enum(["basic", "normal", "moderate", "heavy"]).optional(),
  extras: z.array(z.string().max(60)).max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
  pets: z.boolean().optional(),
  accessNotes: z.string().trim().max(1000).optional(),
  address: z.string().trim().max(200).optional(),
  postcode: z.string().trim().max(10).optional(),
});

const householdView = (user) => {
  const h = user.household?.toObject ? user.household.toObject() : user.household;
  return h && Object.keys(h).length ? h : null;
};

// GET /api/v1/users/me/household – saved household profile (or null)
export const getMyHousehold = async (req, res, next) => {
  try {
    res.json({ success: true, household: householdView(req.user) });
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/users/me/household – replace the saved household profile
export const updateMyHousehold = async (req, res, next) => {
  try {
    const data = householdSchema.parse(req.body);
    const user = await User.findById(req.user._id);
    user.household = data;
    await user.save();
    res.json({ success: true, household: householdView(user) });
  } catch (error) {
    next(error);
  }
};
