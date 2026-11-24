import mongoose from "mongoose";
import { z } from "zod";

import ContactMessage from "../models/contact-message.model.js";
import {
  sendAdminNotificationEmail,
  trySend,
} from "../services/email.service.js";
import { getPagination, paginationMeta } from "../utils/helpers.js";

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  phone: z.string().trim().max(30).optional().default(""),
  subject: z.string().trim().max(200).optional().default(""),
  message: z.string().trim().min(10).max(3000),
  privacyAccepted: z.literal(true, {
    message: "Please accept the privacy notice.",
  }),
});

// POST /api/v1/contact (public)
export const createContactMessage = async (req, res, next) => {
  try {
    const data = contactSchema.parse(req.body);

    const contact = await ContactMessage.create({
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone,
      subject: data.subject,
      message: data.message,
      privacyAcceptedAt: new Date(),
    });

    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Neue Kontaktanfrage von ${contact.name}`,
        lines: [
          `Name: ${contact.name}`,
          `E-Mail: ${contact.email}`,
          `Telefon: ${contact.phone || "-"}`,
          `Betreff: ${contact.subject || "-"}`,
          "",
          contact.message,
        ],
      })
    );

    return res.status(201).json({
      success: true,
      message:
        "Message received.",
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/contact-messages?status=&page=&limit=
export const listContactMessages = async (req, res, next) => {
  try {
    const pagination = getPagination(req.query, { defaultLimit: 20 });
    const filter = {};

    if (req.query.status) {
      if (!["new", "in_progress", "closed"].includes(req.query.status)) {
        return res.status(400).json({ success: false, message: "Invalid status." });
      }
      filter.status = req.query.status;
    }

    const [messages, total] = await Promise.all([
      ContactMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      ContactMessage.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      pagination: paginationMeta(pagination, total),
      messages,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/contact-messages/:id  { status }
export const updateContactMessage = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid message ID." });
    }

    const { status } = z
      .object({ status: z.enum(["new", "in_progress", "closed"]) })
      .parse(req.body);

    const message = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { returnDocument: "after", runValidators: true }
    );

    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    return res.json({
      success: true,
      message: "Status updated.",
      contactMessage: { id: message._id, status: message.status },
    });
  } catch (error) {
    next(error);
  }
};
