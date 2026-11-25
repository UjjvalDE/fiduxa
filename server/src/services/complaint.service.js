// Complaints against the cleaning / cleaner of a booking.
//   Customer files one on a completed (or past) booking of their own.
//   Office reviews it (open → in_review) and records remedies / restrictions
//   in the resolution log, then resolves or rejects it (customer gets a mail).
//   Remedies reuse existing money flows: partial refund via the payment
//   provider (refundPaymentRecord) and admin-issued gift cards.
//   Restrictions reuse the reliability pause (time-limited) and the worker
//   suspension (block).
import Booking from "../models/booking.model.js";
import Complaint, { COMPLAINT_MAX_PHOTOS, COMPLAINT_PHOTO_MAX_BYTES, COMPLAINT_PHOTO_TYPES } from "../models/complaint.model.js";
import Payment from "../models/payment.model.js";
import User from "../models/user.model.js";
import { DAY_MS, httpError, slotStartInstant } from "../utils/helpers.js";
import { recordAudit } from "./audit.service.js";
import { trySend } from "./email.service.js";
import { bookingRefundStatus, refundableCents, refundPaymentRecord } from "./payment.service.js";
import { issueAdminGiftCard } from "./gift-card-purchase.service.js";
import { sendComplaintOutcomeEmail, sendComplaintRestrictionEmail, sendNewComplaintAdminEmail } from "./complaint-email.service.js";

const OPEN_STATUSES = ["open", "in_review"];
const RESTRICTIONS = ["warning", "suspend", "block"];

/** Magic-byte check for complaint photos (JPG / PNG only) */
const decodePhoto = (dataUrl) => {
  const m = /^data:([\w.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl ?? ""));
  if (!m) return null;
  const buffer = Buffer.from(m[2], "base64");
  const type = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff ? "image/jpeg" : buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 ? "image/png" : null;
  if (!type || !COMPLAINT_PHOTO_TYPES.includes(type)) return null;
  return { buffer, type };
};

/** A complaint can be filed once the job is done or its start lies in the past */
export const canComplainAbout = (booking, now = Date.now()) => {
  if (!booking) return false;
  if (booking.status === "completed") return true;
  if (!["confirmed", "in_progress"].includes(booking.status)) return false;
  const start = slotStartInstant(booking.preferredDate, booking.slot);
  return start.getTime() < now;
};

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** Customer view: no internal notes, no cleaner restrictions */
export const customerView = (c) => ({
  _id: c._id,
  booking: c.booking,
  bookingRef: c.bookingRef,
  category: c.category,
  description: c.description,
  photoCount: c.photos?.length ?? 0,
  status: c.status,
  createdAt: c.createdAt,
  remedies: (c.actions ?? [])
    .filter((a) => ["refund", "voucher", "reclean"].includes(a.type))
    .map((a) => ({ type: a.type, amountCents: a.amountCents ?? null, giftCardCode: a.type === "voucher" ? a.giftCardCode ?? "" : undefined, at: a.at })),
  resolution: c.status === "resolved" || c.status === "rejected" ? { message: c.resolution?.message ?? "", at: c.resolution?.at ?? null } : null,
});

/** Cleaner view: neutral – category, status and their own restriction only */
export const workerView = (c) => {
  const restriction = [...(c.actions ?? [])].reverse().find((a) => RESTRICTIONS.includes(a.type));
  return {
    _id: c._id,
    bookingRef: c.bookingRef,
    category: c.category,
    status: c.status,
    createdAt: c.createdAt,
    restriction: restriction ? { type: restriction.type, days: restriction.days ?? null, until: restriction.until ?? null, at: restriction.at } : null,
  };
};

const countsFor = async (filter) => {
  const rows = await Complaint.aggregate([{ $match: filter }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
  const counts = { total: 0, open: 0, in_review: 0, resolved: 0, rejected: 0 };
  for (const r of rows) {
    counts[r._id] = r.n;
    counts.total += r.n;
  }
  return counts;
};
export const complaintCounts = countsFor;

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export const createComplaint = async ({ customer, bookingId, category, description, photos = [] }) => {
  const booking = await Booking.findOne({ _id: bookingId, customer: customer._id }).select("customer assignedWorker reference status preferredDate slot customerDetails");
  if (!booking) throw httpError(404, "Booking not found.");
  if (!canComplainAbout(booking)) throw Object.assign(httpError(409, "A complaint can only be filed for a completed or past booking."), { code: "COMPLAINT_NOT_ALLOWED" });
  const open = await Complaint.countDocuments({ booking: booking._id, status: { $in: OPEN_STATUSES } });
  if (open > 0) throw Object.assign(httpError(409, "There is already an open complaint for this booking."), { code: "COMPLAINT_OPEN" });
  if (photos.length > COMPLAINT_MAX_PHOTOS) throw httpError(422, `At most ${COMPLAINT_MAX_PHOTOS} photos.`);

  const decoded = photos.map((p) => {
    const d = decodePhoto(p.dataUrl);
    if (!d) throw Object.assign(httpError(422, "Please upload photos as JPG or PNG."), { code: "COMPLAINT_PHOTO_TYPE" });
    if (d.buffer.length > COMPLAINT_PHOTO_MAX_BYTES) throw Object.assign(httpError(422, "A photo may be at most 3 MB."), { code: "COMPLAINT_PHOTO_SIZE" });
    return { name: String(p.name).replace(/[^\w.\- ()äöüÄÖÜß]/g, "_").slice(0, 200), type: d.type, size: d.buffer.length, data: d.buffer };
  });

  const complaint = await Complaint.create({
    booking: booking._id,
    bookingRef: booking.reference,
    customer: customer._id,
    worker: booking.assignedWorker ?? null,
    category,
    description,
    photos: decoded,
    status: "open",
    history: [{ status: "open", by: customer._id }],
  });
  await recordAudit({ actor: customer._id, action: "complaint.created", entityType: "Complaint", entityId: complaint._id, after: { booking: booking.reference, category, photos: decoded.length } });
  const worker = booking.assignedWorker ? await User.findById(booking.assignedWorker).select("name") : null;
  await trySend("Admin notification", () => sendNewComplaintAdminEmail({ complaint, customerName: `${customer.name} (${customer.email})`, workerName: worker?.name ?? "" }));
  return complaint;
};

export const listCustomerComplaints = async (customerId, bookingId) => {
  const filter = { customer: customerId, ...(bookingId && { booking: bookingId }) };
  return (await Complaint.find(filter).sort({ createdAt: -1 }).lean()).map(customerView);
};

// ---------------------------------------------------------------------------
// Cleaner
// ---------------------------------------------------------------------------

export const listWorkerComplaints = async (workerId) => {
  const rows = await Complaint.find({ worker: workerId }).select("bookingRef category status createdAt actions").sort({ createdAt: -1 }).limit(50).lean();
  return { complaints: rows.map(workerView), counts: await countsFor({ worker: workerId }) };
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const loadOpen = async (id) => {
  const complaint = await Complaint.findById(id);
  if (!complaint) throw httpError(404, "Complaint not found.");
  if (!OPEN_STATUSES.includes(complaint.status)) throw Object.assign(httpError(409, "This complaint is already closed."), { code: "COMPLAINT_CLOSED" });
  return complaint;
};

const toReview = (complaint, adminId) => {
  if (complaint.status === "open") {
    complaint.status = "in_review";
    complaint.history.push({ status: "in_review", by: adminId });
  }
};

export const startReview = async (id, adminId) => {
  const complaint = await loadOpen(id);
  toReview(complaint, adminId);
  await complaint.save();
  await recordAudit({ actor: adminId, action: "complaint.in_review", entityType: "Complaint", entityId: complaint._id });
  return complaint;
};

export const addInternalNote = async (id, adminId, body) => {
  const complaint = await Complaint.findById(id);
  if (!complaint) throw httpError(404, "Complaint not found.");
  complaint.internalNotes.push({ body, by: adminId });
  await complaint.save();
  return complaint;
};

/** Refundable amount of the booking's main payment (0 when none) */
export const bookingRefundable = async (bookingId) => {
  const payment = await Payment.findOne({ booking: bookingId, purpose: { $ne: "adjustment" }, status: { $in: ["paid", "partially_refunded"] } }).sort({ paidAt: -1 });
  return { payment, remainingCents: payment ? refundableCents(payment) : 0 };
};

/**
 * One resolution step. type:
 *   refund   { amountCents }  – partial/full refund of the booking payment
 *   voucher  { amountCents }  – gift card for the customer (emailed)
 *   warning | suspend { days } | block – restriction of the cleaner
 *   reclean | other { note }  – free re-clean / anything else, with a note
 */
export const applyAction = async (id, adminId, { type, amountCents, days, note = "" }) => {
  const complaint = await loadOpen(id);
  const action = { type, note, by: adminId, at: new Date() };

  if (type === "refund") {
    const { payment, remainingCents } = await bookingRefundable(complaint.booking);
    if (!payment?.paymentIntentId) throw Object.assign(httpError(409, "This booking has no online payment that can be refunded."), { code: "COMPLAINT_NO_PAYMENT" });
    if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > remainingCents) {
      throw Object.assign(httpError(422, `The refund amount must be between 0.01 € and ${(remainingCents / 100).toFixed(2)} €.`), { code: "REFUND_TOO_HIGH", remainingCents });
    }
    try {
      action.refundId = await refundPaymentRecord(payment, { amountCents, reason: `Beschwerde ${complaint.bookingRef}${note ? ` – ${note}` : ""}`, by: adminId });
    } catch (error) {
      if (error?.type?.startsWith?.("Stripe") || error?.paypal) throw httpError(502, `Refund failed: ${error.message}`);
      throw error;
    }
    action.amountCents = amountCents;
    await Booking.updateOne({ _id: complaint.booking }, { $set: { "payment.status": bookingRefundStatus(payment), "payment.refundedAt": payment.refundedAt } });
    // Same rule as a manual admin refund: unpaid cleaner earnings wait for the office's decision
    await Booking.updateOne({ _id: complaint.booking, "workerPayout.status": "pending" }, { $set: { "workerPayout.status": "on_hold" } });
  } else if (type === "voucher") {
    if (!Number.isInteger(amountCents) || amountCents < 500 || amountCents > 200000) throw httpError(422, "The voucher must be between 5 € and 2,000 €.");
    const customer = await User.findById(complaint.customer).select("name email preferredLanguage");
    if (!customer?.email || customer.anonymisedAt) throw httpError(409, "The customer account no longer exists.");
    const card = await issueAdminGiftCard({
      amountCents,
      recipientName: customer.name,
      recipientEmail: customer.email,
      reason: `Beschwerde ${complaint.bookingRef}`,
      message: note.slice(0, 500),
      locale: ["de", "en", "pl"].includes(customer.preferredLanguage) ? customer.preferredLanguage : "de",
      actorId: adminId,
      audit: { complaint: String(complaint._id) },
    });
    action.amountCents = amountCents;
    action.giftCard = card._id;
    action.giftCardCode = card.code;
  } else if (RESTRICTIONS.includes(type)) {
    if (!complaint.worker) throw Object.assign(httpError(409, "No cleaner is assigned to this booking."), { code: "COMPLAINT_NO_WORKER" });
    const worker = await User.findOne({ _id: complaint.worker, role: "worker" });
    if (!worker) throw httpError(404, "Worker not found.");
    const before = { workerStatus: worker.workerStatus, isActive: worker.isActive, pausedAt: worker.reliability?.pausedAt ?? null, pausedUntil: worker.reliability?.pausedUntil ?? null };
    if (type === "suspend") {
      if (!Number.isInteger(days) || days < 1 || days > 365) throw httpError(422, "Please give the number of days (1–365).");
      action.days = days;
      action.until = new Date(Date.now() + days * DAY_MS);
      worker.set("reliability.pausedAt", new Date());
      worker.set("reliability.pausedUntil", action.until);
      worker.set("reliability.pausedReason", `Beschwerde ${complaint.bookingRef}`.slice(0, 300));
      await worker.save();
    } else if (type === "block") {
      if (worker.workerStatus === "approved") {
        worker.workerStatus = "suspended";
        worker.isActive = false; // blocks login and API access (same as Admin → suspend)
        await worker.save();
      }
    }
    await recordAudit({ actor: adminId, action: `complaint.worker_${type}`, entityType: "User", entityId: worker._id, before, after: { complaint: String(complaint._id), days: action.days ?? null, until: action.until ?? null, note } });
    await trySend("Complaint restriction", () => sendComplaintRestrictionEmail({ worker, complaint, action }));
  } else if (type === "reclean" || type === "other") {
    if (!note.trim()) throw httpError(422, "Please add a note.");
  } else {
    throw httpError(422, "Unknown action.");
  }

  toReview(complaint, adminId);
  complaint.actions.push(action);
  await complaint.save();
  await recordAudit({ actor: adminId, action: `complaint.action.${type}`, entityType: "Complaint", entityId: complaint._id, after: { amountCents: action.amountCents ?? null, days: action.days ?? null, note } });
  return complaint;
};

/** Close the complaint (resolved | rejected) and tell the customer */
export const closeComplaint = async (id, adminId, { status, message }) => {
  const complaint = await loadOpen(id);
  if (status === "rejected" && !message.trim()) throw httpError(422, "Please give a reason for the rejection.");
  complaint.status = status;
  complaint.resolution = { message, at: new Date(), by: adminId };
  complaint.history.push({ status, by: adminId, note: message.slice(0, 1000) });
  await complaint.save();
  await recordAudit({ actor: adminId, action: `complaint.${status}`, entityType: "Complaint", entityId: complaint._id, after: { message } });

  const [booking, customer] = await Promise.all([
    Booking.findById(complaint.booking).select("reference customerDetails locale"),
    User.findById(complaint.customer).select("name email preferredLanguage anonymisedAt"),
  ]);
  if (booking && customer && !customer.anonymisedAt) {
    const sent = await trySend("Complaint outcome", () => sendComplaintOutcomeEmail({ complaint, booking, customer }));
    if (sent === "sent") {
      complaint.customerNotifiedAt = new Date();
      await complaint.save();
    }
  }
  return complaint;
};
