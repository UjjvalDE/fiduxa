// Admin accounts: list, add (set-password email), deactivate/reactivate.
import mongoose from "mongoose";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

import User from "../models/user.model.js";
import { recordAudit } from "../services/audit.service.js";
import { sendAdminInviteEmail, trySend } from "../services/email.service.js";
import { getSiteUrl } from "../utils/site-url.js";

const INVITE_HOURS = 48;

const toAdmin = (u, me) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  isActive: u.isActive,
  preferredLanguage: u.preferredLanguage,
  // Never logged in with an own password yet (still has the invitation link)
  invitationPending: Boolean(u.passwordResetExpires && !u.passwordChangedAt),
  isMe: String(u._id) === String(me),
  createdAt: u.createdAt,
});

const issueInvite = async (user, invitedBy) => {
  const token = randomBytes(32).toString("hex");
  user.passwordResetTokenHash = createHash("sha256").update(token).digest("hex");
  user.passwordResetExpires = new Date(Date.now() + INVITE_HOURS * 60 * 60 * 1000);
  await user.save();
  const url = `${process.env.PASSWORD_RESET_URL || `${getSiteUrl()}/passwort-zuruecksetzen`}?token=${token}&neu=1`;
  return trySend("Admin invite", () =>
    sendAdminInviteEmail({ to: user.email, name: user.name, url, invitedBy, locale: user.preferredLanguage })
  );
};

// GET /api/v1/admin/admins
export const listAdmins = async (req, res, next) => {
  try {
    const admins = await User.find({ role: "admin" })
      .select("name email phone isActive preferredLanguage createdAt passwordChangedAt +passwordResetExpires")
      .sort({ createdAt: 1 })
      .lean();
    return res.json({ success: true, admins: admins.map((a) => toAdmin(a, req.user._id)) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/admins  { name, email, phone?, locale? }
export const createAdmin = async (req, res, next) => {
  try {
    const data = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().trim().email().transform((v) => v.toLowerCase()),
        phone: z.string().trim().max(30).optional().default(""),
        locale: z.enum(["de", "en", "pl"]).optional().default("de"),
      })
      .parse(req.body);

    if (await User.exists({ email: data.email })) {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }

    const admin = await User.create({
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: "admin",
      preferredLanguage: data.locale,
      emailVerified: true,
      // Unusable random password until the new admin sets their own
      password: await bcrypt.hash(randomBytes(24).toString("hex"), 12),
    });
    const emailStatus = await issueInvite(admin, req.user.name);

    await recordAudit({
      actor: req.user._id,
      action: "admin.created",
      entityType: "User",
      entityId: admin._id,
      after: { email: admin.email },
    });

    return res.status(201).json({
      success: true,
      message: emailStatus === "sent" ? "Admin added. We emailed a link to set the password." : "Admin added, but the email could not be sent.",
      emailStatus,
      admin: toAdmin({ ...admin.toObject(), passwordResetExpires: admin.passwordResetExpires }, req.user._id),
    });
  } catch (error) {
    next(error);
  }
};

const loadAdmin = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid ID." });
    return null;
  }
  const admin = await User.findOne({ _id: req.params.id, role: "admin" }).select("+passwordResetExpires");
  if (!admin) res.status(404).json({ success: false, message: "Admin not found." });
  return admin;
};

// PATCH /api/v1/admin/admins/:id  { isActive }
export const setAdminActive = async (req, res, next) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const admin = await loadAdmin(req, res);
    if (!admin) return;

    if (!isActive) {
      if (String(admin._id) === String(req.user._id)) {
        return res.status(409).json({ success: false, message: "You cannot deactivate your own account." });
      }
      const others = await User.countDocuments({ role: "admin", isActive: true, _id: { $ne: admin._id } });
      if (others === 0) {
        return res.status(409).json({ success: false, message: "At least one active admin is required." });
      }
    }

    admin.isActive = isActive;
    // Log the admin out everywhere when deactivated
    if (!isActive) admin.tokenVersion = (admin.tokenVersion ?? 0) + 1;
    await admin.save();

    await recordAudit({
      actor: req.user._id,
      action: isActive ? "admin.reactivated" : "admin.deactivated",
      entityType: "User",
      entityId: admin._id,
    });
    return res.json({ success: true, admin: toAdmin(admin.toObject(), req.user._id) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/admins/:id/resend-invite
export const resendAdminInvite = async (req, res, next) => {
  try {
    const admin = await loadAdmin(req, res);
    if (!admin) return;
    if (!admin.isActive) {
      return res.status(409).json({ success: false, message: "This admin is deactivated." });
    }
    const emailStatus = await issueInvite(admin, req.user.name);
    return res.json({
      success: emailStatus === "sent",
      message: emailStatus === "sent" ? "Invitation sent again." : "The email could not be sent.",
    });
  } catch (error) {
    next(error);
  }
};
