import { getSiteUrl } from "../utils/site-url.js";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import User from "../models/user.model.js";
import { clearSessionCookie } from "../utils/session-cookie.js";
import { issueSession } from "../services/session.service.js"; // [E] sliding sessions
import { createChallenge, twoFactorEnabled } from "./two-factor.controller.js"; // [E] admin 2FA
import { SECURITY } from "../config/pricing.js"; // [E]
import {
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeOfferEmail,
  trySend,
} from "../services/email.service.js";
import Promotion from "../models/promotion.model.js";
import { isLive } from "../services/promotion.service.js";
import PersonalCode from "../models/personal-code.model.js";
import { issuePersonalCode, liveWelcomePromotion } from "../services/personal-code.service.js";
import { LEGAL_VERSIONS } from "../config/legal.js";

const VERIFY_HOURS = 24;

/** Live welcome offer (percent) or null – shown in verification emails */
const welcomePercent = async () => {
  const promo = await Promotion.findOne({ kind: "welcome", active: true }).lean();
  return promo && isLive(promo) && promo.discountType === "percent" ? promo.discountValue : null;
};

/** Create a verification token and email the link. Saves the user. */
const sendVerification = async (user) => {
  const token = randomBytes(32).toString("hex");
  user.emailVerificationTokenHash = hashToken(token);
  user.emailVerificationExpires = new Date(Date.now() + VERIFY_HOURS * 60 * 60 * 1000);
  await user.save();
  const pct = await welcomePercent();
  return trySend("Email verification", () =>
    sendEmailVerificationEmail({
      to: user.email,
      name: user.name,
      url: `${getSiteUrl()}/email-bestaetigen?token=${token}`,
      locale: user.preferredLanguage,
      welcomePercent: pct,
    })
  );
};

const hashToken = (value) => createHash("sha256").update(value).digest("hex");

// Validation rules
const passwordRule = z.string().min(8).max(72);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).optional(),
  password: passwordRule,
  locale: z.enum(["de", "en", "pl"]).optional().default("de"),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const toPublicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  emailVerified: Boolean(user.emailVerified),
  preferredLanguage: user.preferredLanguage ?? "de",
  ...(user.role === "worker" && { workerStatus: user.workerStatus }),
  ...(user.profileCompletionRequired && { profileIncomplete: true }),
});

// REGISTER CUSTOMER
export const register = async (req, res) => {
  try {
    const validation = registerSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration details",
        errors: validation.error.issues,
      });
    }

    const { name, email, phone, password, locale } = validation.data;

    const normalizedEmail = email.toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email: normalizedEmail,
      phone,
      password: hashedPassword,
      role: "consumer",
      preferredLanguage: locale,
      // The form states that registering accepts the AGB + Datenschutz
      legalConsent: {
        termsVersion: LEGAL_VERSIONS.terms,
        termsAcceptedAt: new Date(),
        privacyVersion: LEGAL_VERSIONS.privacy,
        privacyAcceptedAt: new Date(),
        source: "register",
      },
    });

    const token = issueSession(res, user);
    // Confirmation link (unlocks the welcome discount)
    await sendVerification(user);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      token,
      user: toPublicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    console.error("Registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create account",
    });
  }
};

// LOGIN
export const login = async (req, res) => {
  try {
    const validation = loginSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid login details",
        errors: validation.error.issues,
      });
    }

    const { email, password } = validation.data;

    const user = await User.findOne({
      email: email.toLowerCase(),
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "This account is inactive",
      });
    }

    // Social-login-only accounts have no password (until they set one via reset)
    const passwordMatches = Boolean(user.password) && (await bcrypt.compare(password, user.password));

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Package E: admin two-factor authentication
    if (user.role === "admin") {
      if (twoFactorEnabled(user)) {
        return res.status(200).json({
          success: true,
          requires2fa: true,
          challenge: createChallenge(user),
          message: "Please enter your verification code.",
        });
      }
      if (SECURITY.requireAdmin2fa) {
        return res.status(403).json({
          success: false,
          code: "2FA_SETUP_REQUIRED",
          message: "Two-factor authentication is required for admin accounts but is not set up for yours yet.",
        });
      }
    }

    const token = issueSession(res, user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: toPublicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to log in",
    });
  }
};

// GET /api/v1/auth/me
export const getMe = async (req, res, next) => {
  try {
    // OAuth-only accounts have no password (konto shows "Passwort vergessen" instead)
    const hasPassword = Boolean(await User.exists({ _id: req.user._id, password: { $type: "string" } }));
    res.status(200).json({ success: true, user: { ...toPublicUser(req.user), hasPassword } });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/auth/forgot-password  { email }
// Always returns the same response so attackers cannot discover accounts.
export const forgotPassword = async (req, res, next) => {
  const genericResponse = {
    success: true,
    message:
      "If an account exists for this email, we have sent a link to reset the password.",
  };

  try {
    const parsed = z
      .object({ email: z.string().trim().email() })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(200).json(genericResponse);
    }

    const user = await User.findOne({
      email: parsed.data.email.toLowerCase(),
      isActive: true,
      // Invited workers must use their invitation link instead
      workerStatus: { $ne: "invited" },
    });

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const token = randomBytes(32).toString("hex");
    user.passwordResetTokenHash = hashToken(token);
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    // Link must point to the WEBSITE (not the API port)
    const baseUrl = process.env.PASSWORD_RESET_URL || `${getSiteUrl()}/passwort-zuruecksetzen`;

    await trySend("Password reset", () =>
      sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl: `${baseUrl}?token=${token}`,
        locale: user.preferredLanguage,
      })
    );

    return res.status(200).json(genericResponse);
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/auth/reset-password  { token, password }
export const resetPassword = async (req, res, next) => {
  try {
    const data = z
      .object({ token: z.string().min(1), password: passwordRule })
      .parse(req.body);

    const user = await User.findOne({
      passwordResetTokenHash: hashToken(data.token),
      passwordResetExpires: { $gt: new Date() },
    }).select("+passwordResetTokenHash +passwordResetExpires");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "The reset link is invalid or has expired.",
      });
    }

    user.password = await bcrypt.hash(data.password, 12);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    // Invalidate all existing login tokens
    user.passwordChangedAt = new Date();
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password updated. You can now log in.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Issue the personal welcome code to a customer whose email was just
 * confirmed (link or verified social login) and email it. Returns the
 * percentage or null.
 */
export const grantWelcomeOffer = async (user) => {
  if (user.role !== "consumer") return null;
  const promo = await liveWelcomePromotion();
  if (!promo) return null;
  const { code } = await issuePersonalCode(promo, user);
  const pct = promo.discountType === "percent" ? promo.discountValue : null;
  const status = await trySend("Welcome offer", () =>
    sendWelcomeOfferEmail({
      to: user.email,
      name: user.name,
      locale: user.preferredLanguage,
      percent: pct,
      code: code.code,
      expiresAt: code.expiresAt,
    })
  );
  if (status === "sent") await PersonalCode.updateOne({ _id: code._id }, { $set: { emailedAt: new Date() } });
  return pct;
};

// POST /api/v1/auth/verify-email  { token }
export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.body);
    const user = await User.findOne({
      emailVerificationTokenHash: hashToken(token),
      emailVerificationExpires: { $gt: new Date() },
    }).select("+emailVerificationTokenHash +emailVerificationExpires");

    if (!user) {
      return res.status(400).json({ success: false, message: "The confirmation link is invalid or has expired." });
    }

    const firstTime = !user.emailVerified;
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Personal, single-use welcome code – shown only in this email and in the account
    const pct = firstTime ? await grantWelcomeOffer(user) : null;

    return res.json({
      success: true,
      message: "Email address confirmed.",
      welcomePercent: pct,
      // The code itself is only sent by email (and shown in the account), not here
      welcomeCodeSent: Boolean(pct),
      user: toPublicUser(user),
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/auth/resend-verification (logged in)
export const resendVerification = async (req, res, next) => {
  try {
    if (req.user.emailVerified) {
      return res.json({ success: true, message: "Your email address is already confirmed.", alreadyVerified: true });
    }
    const user = await User.findById(req.user._id);
    const status = await sendVerification(user);
    return res.json({
      success: status === "sent",
      message: status === "sent" ? "We have sent you a new confirmation link." : "The email could not be sent.",
    });
  } catch (error) {
    next(error);
  }
};


// POST /api/v1/auth/logout – ends the cookie session on this browser.
// (JWTs are stateless; a global revocation happens via tokenVersion on
// password change. Clearing the HttpOnly cookie is the per-device logout.)
export const logout = (req, res) => {
  clearSessionCookie(res);
  return res.json({ success: true, message: "Logged out." });
};


// GET /api/v1/auth/session – silent session probe (always 200, no 401 noise
// in the browser console for anonymous visitors). Returns the user when the
// cookie or bearer token is valid, otherwise { authenticated: false }.
export const getSession = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : req.cookies?.["fiduxa_session"];
    if (!token) return res.json({ success: true, authenticated: false });
    const jwt = (await import("jsonwebtoken")).default;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await (await import("../models/user.model.js")).default.findById(decoded.userId);
    if (!user || !user.isActive || (decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.json({ success: true, authenticated: false });
    }
    return res.json({ success: true, authenticated: true, user: toPublicUser(user) });
  } catch {
    return res.json({ success: true, authenticated: false });
  }
};
