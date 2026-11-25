import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { SESSION_COOKIE_NAME } from "../utils/session-cookie.js";
import { maybeRenewSession } from "../services/session.service.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : req.cookies?.[SESSION_COOKIE_NAME];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Short-lived 2FA challenges are not sessions
    if (decoded.purpose) {
      return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }

    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid or inactive account",
      });
    }

    // Reject tokens issued before the last password change
    if ((decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }

    // Sliding sessions (package E): renew near expiry; admins never beyond 24 h
    const renewal = maybeRenewSession(res, user, decoded);
    if (renewal.expired) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// Like protect, but anonymous requests continue without req.user
// (public endpoints that personalise their answer, e.g. price quotes).
export const optionalAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    if (decoded.purpose) return next();
    const user = await User.findById(decoded.userId);
    if (user?.isActive && (decoded.tv ?? 0) === (user.tokenVersion ?? 0)) req.user = user;
  } catch {
    /* invalid token → treat as anonymous */
  }
  return next();
};

/**
 * Customers created via Google/Apple must complete their profile (phone,
 * address, AGB + Datenschutz) before booking, buying gift cards or paying.
 * Use after `protect`.
 */
export const requireCompleteProfile = (req, res, next) => {
  if (req.user?.profileCompletionRequired) {
    return res.status(409).json({
      success: false,
      code: "PROFILE_INCOMPLETE",
      message: "Please complete your profile first (phone, address and consent to the terms).",
    });
  }
  return next();
};
