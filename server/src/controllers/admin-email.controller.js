import mongoose from "mongoose";
import { z } from "zod";

import EmailMessage from "../models/email.model.js";
import { resendEmail } from "../services/email.service.js";
import { recordAudit } from "../services/audit.service.js";
import { escapeRegex, getPagination, paginationMeta } from "../utils/helpers.js";

const LIST_FIELDS = "to subject template bookingRef status attempts lastError nextAttemptAt sentAt resentAt createdAt";

// GET /api/v1/admin/emails?status=&search=&page=&limit=
export const listEmails = async (req, res, next) => {
  try {
    const { status, search } = z
      .object({
        status: z.enum(["queued", "sent", "failed"]).optional(),
        search: z.string().trim().max(120).optional(),
      })
      .parse(req.query);
    const pagination = getPagination(req.query, { defaultLimit: 25 });

    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ to: rx }, { subject: rx }, { bookingRef: rx }, { template: rx }];
    }

    const [emails, total, counts] = await Promise.all([
      EmailMessage.find(filter).select(LIST_FIELDS).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
      EmailMessage.countDocuments(filter),
      EmailMessage.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    return res.json({
      success: true,
      emails,
      counts: Object.fromEntries(counts.map((row) => [row._id, row.count])),
      pagination: paginationMeta(pagination, total),
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/emails/:id  (full record incl. html for preview)
export const getEmail = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Email not found." });
    const email = await EmailMessage.findById(req.params.id).lean();
    if (!email) return res.status(404).json({ success: false, message: "Email not found." });
    return res.json({ success: true, email });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/emails/:id/resend
export const resendEmailById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Email not found." });
    const email = await EmailMessage.findById(req.params.id);
    if (!email) return res.status(404).json({ success: false, message: "Email not found." });

    const before = { status: email.status, attempts: email.attempts };
    const { status, record } = await resendEmail(email, req.user._id);

    await recordAudit({
      actor: req.user._id,
      action: "email.resend",
      entityType: "EmailMessage",
      entityId: email._id,
      before,
      after: { status: record.status, attempts: record.attempts, to: record.to },
    });

    return res.json({
      success: true,
      message: status === "sent" ? "Email sent." : status === "failed" ? "Email could not be sent." : "Email queued for retry.",
      email: record,
    });
  } catch (error) {
    next(error);
  }
};
