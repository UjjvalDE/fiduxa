import bcrypt from "bcryptjs";
import { z } from "zod";

import User from "../models/user.model.js";
import { OPERATIONS } from "../config/pricing.js";
import generateToken from "../utils/generate-token.js";
import { setSessionCookie } from "../utils/session-cookie.js";
import { welcomeCodeFor } from "../services/personal-code.service.js";
import { LEGAL_VERSIONS, isValidPhone } from "../config/legal.js";
import { recordAudit } from "../services/audit.service.js";

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
      ...(req.user.profileCompletionRequired && { profileIncomplete: true }),
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

    if (!user.password) {
      // Social-login-only account: set a first password via "forgot password"
      return res.status(400).json({
        success: false,
        code: "NO_PASSWORD_SET",
        message: "This account has no password yet. Use \"Forgot password\" to set one.",
      });
    }

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
  city: z.string().trim().max(80).optional(),
  floor: z.string().trim().max(80).optional(),
  billing: z.object({ name: z.string().trim().max(120).optional(), address: z.string().trim().max(200).optional(), postcode: z.string().trim().max(10).optional(), city: z.string().trim().max(80).optional() }).optional(),
});

// Saved address (konto → Adresse). Service address must be in Berlin; the
// billing address (optional, if different) may be anywhere.
const addressSchema = z.object({
  address: z.string().trim().min(3).max(200),
  postcode: z.string().trim().regex(OPERATIONS.servicePostcodeRegex, "We currently only clean in Berlin (postcodes 10115–14199)."),
  city: z.string().trim().max(80).optional().default("Berlin"),
  floor: z.string().trim().max(80).optional().default(""),
  accessNotes: z.string().trim().max(1000).optional().default(""),
  billing: z
    .object({
      name: z.string().trim().max(120).optional().default(""),
      address: z.string().trim().min(3).max(200),
      postcode: z.string().trim().min(4).max(10),
      city: z.string().trim().min(2).max(80),
    })
    .nullable()
    .optional(),
});

const addressView = (user) => {
  const h = user.household ?? {};
  return {
    address: h.address ?? "",
    postcode: h.postcode ?? "",
    city: h.city ?? "",
    floor: h.floor ?? "",
    accessNotes: h.accessNotes ?? "",
    billing: h.billing?.address ? { name: h.billing.name ?? "", address: h.billing.address, postcode: h.billing.postcode ?? "", city: h.billing.city ?? "" } : null,
  };
};

// GET /api/v1/users/me/address
export const getMyAddress = async (req, res, next) => {
  try {
    res.json({ success: true, address: addressView(req.user) });
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/users/me/address – only future bookings use it (bookings and
// invoices keep the address they were made with)
export const updateMyAddress = async (req, res, next) => {
  try {
    const data = addressSchema.parse(req.body ?? {});
    const user = await User.findById(req.user._id);
    for (const k of ["address", "postcode", "city", "floor", "accessNotes"]) user.set(`household.${k}`, data[k]);
    user.set("household.billing", data.billing ?? undefined);
    await user.save();
    res.json({ success: true, address: addressView(user) });
  } catch (error) {
    next(error);
  }
};

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
    // Keep the address-card fields the booking wizard does not send
    const prev = user.household?.toObject ? user.household.toObject() : user.household ?? {};
    user.household = { city: prev.city, floor: prev.floor, billing: prev.billing, address: prev.address, postcode: prev.postcode, ...data };
    await user.save();
    res.json({ success: true, household: householdView(user) });
  } catch (error) {
    next(error);
  }
};

// Profile completion after a Google/Apple sign-up: phone, Berlin service
// address and AGB + Datenschutz consent (same versions as the registration).
const literalTrue = (message) => z.literal(true, { message });
const completeProfileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().refine(isValidPhone, "Please enter a valid phone number."),
  address: addressSchema.shape.address,
  postcode: addressSchema.shape.postcode,
  city: z.string().trim().min(2).max(80).optional().default("Berlin"),
  floor: z.string().trim().max(80).optional().default(""),
  accessNotes: z.string().trim().max(1000).optional().default(""),
  acceptTerms: literalTrue("Please accept the terms and conditions."),
  acceptPrivacy: literalTrue("Please accept the privacy policy."),
  marketingOptIn: z.boolean().optional().default(false),
});

// GET /api/v1/users/me/complete-profile – prefill + legal versions
export const getCompleteProfile = async (req, res, next) => {
  try {
    const u = req.user;
    res.json({
      success: true,
      required: Boolean(u.profileCompletionRequired),
      profile: {
        name: u.name === "Fiduxa Kunde" ? "" : u.name,
        email: u.email,
        privateRelayEmail: Boolean(u.oauth?.applePrivateEmail),
        phone: u.phone ?? "",
        ...addressView(u),
      },
      versions: LEGAL_VERSIONS,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/users/me/complete-profile
export const completeMyProfile = async (req, res, next) => {
  try {
    const parsed = completeProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid details",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      });
    }
    if (req.user.role !== "consumer") return res.status(403).json({ success: false, message: "Customers only" });
    const data = parsed.data;
    const user = await User.findById(req.user._id);
    const now = new Date();
    user.name = data.name;
    user.phone = data.phone;
    for (const k of ["address", "postcode", "city", "floor", "accessNotes"]) user.set(`household.${k}`, data[k]);
    user.legalConsent = {
      termsVersion: LEGAL_VERSIONS.terms,
      termsAcceptedAt: now,
      privacyVersion: LEGAL_VERSIONS.privacy,
      privacyAcceptedAt: now,
      source: "complete_profile",
      marketingOptIn: data.marketingOptIn,
      marketingOptInAt: data.marketingOptIn ? now : undefined,
    };
    const wasRequired = Boolean(user.profileCompletionRequired);
    user.profileCompletionRequired = undefined;
    user.profileCompletedAt = now;
    await user.save();
    await recordAudit({
      actor: user._id,
      action: "user.profile_completed",
      entityType: "User",
      entityId: user._id,
      after: {
        termsVersion: LEGAL_VERSIONS.terms,
        privacyVersion: LEGAL_VERSIONS.privacy,
        marketingOptIn: data.marketingOptIn,
        postcode: data.postcode,
        wasRequired,
      },
    });
    res.json({
      success: true,
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, emailVerified: Boolean(user.emailVerified), preferredLanguage: user.preferredLanguage ?? "de" },
      address: addressView(user),
    });
  } catch (error) {
    next(error);
  }
};
