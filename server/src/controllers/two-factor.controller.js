// Admin two-factor authentication (TOTP, package E).
// Setup → QR code → enable with a code → login returns a short-lived challenge
// → /auth/2fa/verify completes the login. Optional per admin, enforced for all
// admins when SECURITY.requireAdmin2fa is true.
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { generateSecret, generateURI, verifySync } from "otplib";
import { z } from "zod";

import User from "../models/user.model.js";
import { SECURITY } from "../config/pricing.js";
import { recordAudit } from "../services/audit.service.js";
import { issueSession } from "../services/session.service.js";

const CHALLENGE_TTL = "5m";
const ISSUER = "Fiduxa Admin";

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Please enter the 6-digit code.") });

const codeValid = (secret, code) => {
  try {
    return Boolean(secret) && verifySync({ secret, token: code, epochTolerance: 30 }).valid;
  } catch {
    return false;
  }
};

export const twoFactorEnabled = (user) => Boolean(user?.twoFactor?.enabledAt);

/** Signed, short-lived proof that the password step succeeded */
export const createChallenge = (user) =>
  jwt.sign({ userId: user._id.toString(), tv: user.tokenVersion ?? 0, purpose: "2fa" }, process.env.JWT_SECRET, { expiresIn: CHALLENGE_TTL });

const requireAdmin = (req, res) => {
  if (req.user.role !== "admin") {
    res.status(403).json({ success: false, message: "Two-factor authentication is available for admin accounts only." });
    return false;
  }
  return true;
};

// GET /api/v1/users/me/2fa
export const getTwoFactorStatus = (req, res) =>
  res.json({
    success: true,
    available: req.user.role === "admin",
    enabled: twoFactorEnabled(req.user),
    enabledAt: req.user.twoFactor?.enabledAt ?? null,
    required: req.user.role === "admin" && Boolean(SECURITY.requireAdmin2fa),
  });

// POST /api/v1/users/me/2fa/setup → secret + otpauth URL + QR data URL
export const setupTwoFactor = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: ISSUER, label: req.user.email, secret });
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
    await User.updateOne({ _id: req.user._id }, { $set: { "twoFactor.pendingSecret": secret } });
    return res.json({ success: true, secret, otpauthUrl, qrDataUrl, enabled: twoFactorEnabled(req.user) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/users/me/2fa/enable { code }
export const enableTwoFactor = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { code } = codeSchema.parse(req.body);
    const user = await User.findById(req.user._id).select("+twoFactor.pendingSecret +twoFactor.secret");
    if (!user.twoFactor?.pendingSecret) {
      return res.status(409).json({ success: false, message: "Please start the two-factor setup first." });
    }
    if (!codeValid(user.twoFactor.pendingSecret, code)) {
      return res.status(401).json({ success: false, message: "Invalid verification code." });
    }
    user.set("twoFactor.secret", user.twoFactor.pendingSecret);
    user.set("twoFactor.pendingSecret", undefined);
    user.set("twoFactor.enabledAt", new Date());
    await user.save();
    await recordAudit({ actor: req.user._id, action: "user.2fa.enabled", entityType: "User", entityId: user._id });
    return res.json({ success: true, message: "Two-factor authentication is now active.", enabled: true, enabledAt: user.twoFactor.enabledAt });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/users/me/2fa/disable { code }
export const disableTwoFactor = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { code } = codeSchema.parse(req.body);
    const user = await User.findById(req.user._id).select("+twoFactor.secret");
    if (!twoFactorEnabled(user)) {
      return res.status(409).json({ success: false, message: "Two-factor authentication is not active." });
    }
    if (!codeValid(user.twoFactor.secret, code)) {
      return res.status(401).json({ success: false, message: "Invalid verification code." });
    }
    if (SECURITY.requireAdmin2fa) {
      return res.status(409).json({ success: false, message: "Two-factor authentication is required for all admins and cannot be switched off." });
    }
    user.set("twoFactor.secret", undefined);
    user.set("twoFactor.pendingSecret", undefined);
    user.set("twoFactor.enabledAt", null);
    await user.save();
    await recordAudit({ actor: req.user._id, action: "user.2fa.disabled", entityType: "User", entityId: user._id });
    return res.json({ success: true, message: "Two-factor authentication switched off.", enabled: false });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/auth/2fa/verify { challenge, code } – completes an admin login
export const verifyTwoFactorLogin = async (req, res, next) => {
  try {
    const { challenge, code } = z.object({ challenge: z.string().min(10), code: codeSchema.shape.code }).parse(req.body);
    let decoded;
    try {
      decoded = jwt.verify(challenge, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: "The login challenge is invalid or has expired. Please log in again." });
    }
    if (decoded.purpose !== "2fa") {
      return res.status(401).json({ success: false, message: "The login challenge is invalid or has expired. Please log in again." });
    }
    const user = await User.findById(decoded.userId).select("+twoFactor.secret");
    if (!user || !user.isActive || (decoded.tv ?? 0) !== (user.tokenVersion ?? 0) || !twoFactorEnabled(user)) {
      return res.status(401).json({ success: false, message: "The login challenge is invalid or has expired. Please log in again." });
    }
    if (!codeValid(user.twoFactor.secret, code)) {
      return res.status(401).json({ success: false, message: "Invalid verification code." });
    }
    const token = issueSession(res, user);
    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: Boolean(user.emailVerified),
        preferredLanguage: user.preferredLanguage ?? "de",
      },
    });
  } catch (error) {
    next(error);
  }
};
