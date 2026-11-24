// GDPR self-service (customers and cleaners) + admin customer deletion.
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { z } from "zod";

import User from "../models/user.model.js";
import { anonymiseUser, assertDeletable, deletionPreview, exportUserData, RETENTION_YEARS } from "../services/account-privacy.service.js";
import { recordAudit } from "../services/audit.service.js";
import { clearSessionCookie } from "../utils/session-cookie.js";

const RETENTION_MESSAGE =
  `Your account has been deleted. Bookings and invoices are kept in anonymised form for ${RETENTION_YEARS} years as required by German tax law (§ 147 AO) and then erased.`;

// GET /api/v1/users/me/export  → JSON download
export const exportMyData = async (req, res, next) => {
  try {
    const data = await exportUserData(req.user);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `attachment; filename="fiduxa-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return res.status(200).send(JSON.stringify({ success: true, ...data }, null, 2));
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/users/me/deletion-check → blockers, confirmation method, unpaid earnings
export const getMyDeletionCheck = async (req, res, next) => {
  try {
    return res.json({ success: true, ...(await deletionPreview(req.user)) });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/users/me  { password }  (social-login-only accounts: { confirmEmail })
export const deleteMyAccount = async (req, res, next) => {
  try {
    const { password, confirmEmail } = z
      .object({ password: z.string().min(1).max(72).optional(), confirmEmail: z.string().trim().max(254).optional() })
      .parse(req.body ?? {});
    const user = await User.findById(req.user._id).select("+password");
    if (!user) return res.status(400).json({ success: false, message: "Current password is incorrect." });
    if (user.password) {
      if (!password || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ success: false, message: "Current password is incorrect." });
      }
    } else if (!confirmEmail || confirmEmail.toLowerCase() !== user.email) {
      // Social-login-only account (no password): confirm with the account email instead
      return res.status(400).json({
        success: false,
        code: "CONFIRM_EMAIL_REQUIRED",
        message: "Please confirm the deletion by entering the email address of your account.",
      });
    }
    try {
      await assertDeletable(user);
    } catch (error) {
      if (error.code !== "OPEN_BOOKINGS" && error.code !== "OPEN_JOBS") throw error;
      await recordAudit({ actor: user._id, action: "account.delete.blocked", entityType: "User", entityId: user._id, after: { code: error.code, bookings: error.bookings?.map((b) => b.reference) } });
      // Customers cancel (per the cancellation policy) / cleaners release first – the list links to them
      return res.status(409).json({ success: false, code: error.code, message: error.message, bookings: error.bookings ?? [] });
    }
    const summary = await anonymiseUser(user, { actorId: user._id, self: true });
    clearSessionCookie(res);
    return res.json({ success: true, message: RETENTION_MESSAGE, retentionYears: RETENTION_YEARS, ...summary });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/admin/customers/:id  { reason }
export const deleteCustomerAsAdmin = async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body ?? {});
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid customer ID." });
    }
    const customer = await User.findOne({ _id: req.params.id, role: { $in: ["consumer", "worker"] } });
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });
    if (customer.anonymisedAt) return res.status(409).json({ success: false, message: "This account was already deleted." });
    await assertDeletable(customer);
    const summary = await anonymiseUser(customer, { actorId: req.user._id, reason });
    return res.json({ success: true, message: "Customer account deleted and anonymised.", retentionYears: RETENTION_YEARS, ...summary });
  } catch (error) {
    next(error);
  }
};
