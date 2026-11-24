// GDPR self-service (customers and cleaners) + admin customer deletion.
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { z } from "zod";

import User from "../models/user.model.js";
import { anonymiseUser, assertDeletable, exportUserData, RETENTION_YEARS } from "../services/account-privacy.service.js";
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

// DELETE /api/v1/users/me  { password }
export const deleteMyAccount = async (req, res, next) => {
  try {
    const { password } = z.object({ password: z.string().min(1).max(72) }).parse(req.body ?? {});
    const user = await User.findById(req.user._id).select("+password");
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }
    await assertDeletable(user);
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
