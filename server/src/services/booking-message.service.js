// Booking Q&A thread shared by customer, assigned cleaner and the office.
import BookingMessage from "../models/booking-message.model.js";
import User from "../models/user.model.js";
import { firstName } from "./worker-profile.service.js";
import { sendAdminNotificationEmail, sendNewMessageEmail, trySend } from "./email.service.js";

const MAX_MESSAGES_PER_BOOKING = 200;

const authorLabel = (msg, viewerRole) => {
  if (msg.authorRole === "admin") return "Fiduxa";
  const name = msg.author?.name ?? "";
  // Customers and cleaners see each other's first name only; the office sees full names
  return viewerRole === "admin" ? name : firstName(name);
};

/** Thread for a viewer; marks the messages as read for them */
export const getThread = async (booking, viewer) => {
  const messages = await BookingMessage.find({ booking: booking._id })
    .populate("author", "name")
    .sort({ createdAt: 1 })
    .lean();

  await BookingMessage.updateMany(
    { booking: booking._id, readBy: { $ne: viewer._id } },
    { $addToSet: { readBy: viewer._id } }
  );

  return messages.map((m) => ({
    _id: m._id,
    body: m.body,
    authorRole: m.authorRole,
    authorName: authorLabel(m, viewer.role),
    mine: String(m.author?._id ?? m.author) === String(viewer._id),
    createdAt: m.createdAt,
  }));
};

/** Unread message count for a viewer per booking id */
export const unreadCounts = async (bookingIds, viewerId) => {
  if (bookingIds.length === 0) return {};
  const rows = await BookingMessage.aggregate([
    { $match: { booking: { $in: bookingIds }, readBy: { $ne: viewerId }, author: { $ne: viewerId } } },
    { $group: { _id: "$booking", count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
};

/** Post a message and notify the other parties by email */
export const postMessage = async (booking, author, body) => {
  const count = await BookingMessage.countDocuments({ booking: booking._id });
  if (count >= MAX_MESSAGES_PER_BOOKING) {
    throw Object.assign(new Error("This conversation is full. Please contact us by phone or email."), { statusCode: 409 });
  }

  const message = await BookingMessage.create({
    booking: booking._id,
    author: author._id,
    authorRole: author.role,
    body,
    readBy: [author._id],
  });

  const authorKind = author.role === "admin" ? "office" : author.role === "consumer" ? "customer" : "cleaner";

  // Customer
  if (author.role !== "consumer") {
    await trySend("Booking message", () =>
      sendNewMessageEmail({
        to: booking.customerDetails.email,
        name: booking.customerDetails.name,
        locale: booking.locale,
        booking,
        authorKind,
        authorName: author.name,
        body,
        path: `/konto/buchungen/${booking._id}`,
      })
    );
  }

  // Assigned cleaner
  if (booking.assignedWorker && String(booking.assignedWorker) !== String(author._id)) {
    const worker = await User.findById(booking.assignedWorker).select("name email preferredLanguage");
    if (worker) {
      await trySend("Booking message", () =>
        sendNewMessageEmail({
          to: worker.email,
          name: worker.name,
          locale: worker.preferredLanguage,
          booking,
          authorKind,
          authorName: author.name,
          body,
          path: `/worker/jobs/${booking._id}`,
        })
      );
    }
  }

  // Office
  if (author.role !== "admin") {
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Neue Nachricht zu ${booking.reference}`,
        lines: [`Von: ${author.name} (${author.role === "consumer" ? "Kunde" : "Reinigungskraft"})`, "", body],
      })
    );
  }

  return {
    _id: message._id,
    body: message.body,
    authorRole: message.authorRole,
    authorName: author.role === "admin" ? "Fiduxa" : firstName(author.name),
    mine: true,
    createdAt: message.createdAt,
  };
};
