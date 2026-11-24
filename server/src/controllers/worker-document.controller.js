// Cleaner verification documents (package E): ID, work permit, Gewerbe, other.
// Cleaners upload PDF/JPG/PNG (≤ 5 MB, checked by magic bytes); the admin
// downloads and verifies/rejects them. Approval requires every document kind
// in VERIFICATION.requiredDocuments to be verified.
import mongoose from "mongoose";
import { todayInBerlin } from "../utils/helpers.js";
import { z } from "zod";

import User from "../models/user.model.js";
import { DOCUMENT_KINDS } from "../config/pricing.js";
import { recordAudit } from "../services/audit.service.js";
import { sendAdminNotificationEmail, trySend } from "../services/email.service.js";
import { decodeCv } from "./worker-application.controller.js";
import {
  EXPIRING_KINDS,
  eligibilityProblem,
  eligibleUntil,
  findJobsBeyondExpiry,
  isFreeMovement,
  isFreeMovementCountry,
  kindStatus,
  requiredKindsFor,
} from "../services/work-eligibility.service.js";

export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_DOCUMENTS = 10;

const uploadSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  idType: z.enum(["", "passport", "national_id", "residence_permit", "other"]).optional().default(""),
  name: z.string().trim().min(1).max(200),
  dataUrl: z.string().max(Math.ceil((DOCUMENT_MAX_BYTES * 4) / 3) + 200),
});

const toDocument = (d) => ({
  id: d._id,
  kind: d.kind,
  name: d.name,
  type: d.type,
  size: d.size,
  uploadedAt: d.uploadedAt,
  status: d.status,
  note: d.note ?? "",
  checkedAt: d.checkedAt ?? null,
  idType: d.idType ?? "",
  expiresAt: d.expiresAt ?? null,
});

/** Every required document kind has at least one verified file */
export const requiredDocumentsVerified = (user) =>
  requiredKindsFor(user).every((kind) => (user?.documents ?? []).some((d) => d.kind === kind && d.status === "verified"));

/** Required kinds that are still missing a verified document */
export const missingRequiredDocuments = (user) =>
  requiredKindsFor(user).filter((kind) => !(user?.documents ?? []).some((d) => d.kind === kind && d.status === "verified"));

export const documentsView = (user) => ({
  documents: (user?.documents ?? []).map(toDocument),
  required: requiredKindsFor(user),
  missing: missingRequiredDocuments(user),
  verified: requiredDocumentsVerified(user),
  // Step-by-step checklist: one entry per required kind (+ optional extra docs)
  checklist: requiredKindsFor(user).map((kind) => {
    const s = kindStatus(user, kind);
    return {
      kind,
      status: s.status,
      expires: EXPIRING_KINDS.includes(kind),
      expiresAt: s.document?.expiresAt ?? null,
      note: s.status === "rejected" ? s.note ?? "" : "",
      documentId: s.document?._id ?? null,
      renewalPending: Boolean(s.renewal),
    };
  }),
  workEligibility: {
    nationality: user?.workEligibility?.nationality ?? "",
    euCitizen: isFreeMovement(user),
    permitRequired: isFreeMovement(user) !== true,
  },
  eligibility: (() => {
    const problem = eligibilityProblem(user, null, { enforce: true });
    return { eligible: !problem, code: problem?.code ?? null, kind: problem?.kind ?? null, eligibleUntil: eligibleUntil(user) };
  })(),
});

// GET /api/v1/worker/documents
export const listMyDocuments = async (req, res, next) => {
  try {
    return res.json({ success: true, ...documentsView(req.user) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/worker/documents  { kind, name, dataUrl }
export const uploadMyDocument = async (req, res, next) => {
  try {
    const data = uploadSchema.parse(req.body);
    const decoded = decodeCv(data.dataUrl);
    if (!decoded || !DOCUMENT_TYPES.includes(decoded.kind.type)) {
      return res.status(422).json({ success: false, message: "Please upload the document as PDF, JPG or PNG." });
    }
    if (decoded.buffer.length > DOCUMENT_MAX_BYTES) {
      return res.status(422).json({ success: false, message: "The document may be at most 5 MB." });
    }
    // Re-upload after a rejection replaces the rejected file of that kind. Atomic
    // $pull: re-saving the whole array would drop the (unselected) bytes of other files.
    const rejected = await User.findById(req.user._id).select("documents._id documents.kind documents.status").lean();
    const replaced = (rejected?.documents ?? []).filter((d) => d.kind === data.kind && d.status === "rejected").map((d) => d._id);
    if (replaced.length) await User.updateOne({ _id: req.user._id }, { $pull: { documents: { _id: { $in: replaced } } } });
    const user = await User.findById(req.user._id);
    if ((user.documents?.length ?? 0) >= MAX_DOCUMENTS) {
      return res.status(409).json({ success: false, message: "You have reached the maximum number of documents. Please delete one first." });
    }
    user.documents.push({
      kind: data.kind,
      idType: data.idType,
      name: data.name.replace(/[^\w.\- ()äöüÄÖÜß]/g, "_"),
      type: decoded.kind.type,
      size: decoded.buffer.length,
      data: decoded.buffer,
      uploadedAt: new Date(),
      status: "pending",
    });
    await user.save();
    const doc = user.documents[user.documents.length - 1];
    await recordAudit({ actor: req.user._id, action: "worker.document.uploaded", entityType: "User", entityId: user._id, after: { documentId: doc._id, kind: doc.kind, size: doc.size, replacedRejected: replaced.length } });
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Neues Dokument zur Prüfung: ${user.name}`,
        lines: [`Reinigungskraft: ${user.name} (${user.email})`, `Dokument: ${doc.kind} – ${doc.name}`, "Im Adminbereich unter „Reinigungskräfte“ prüfen."],
      })
    );
    return res.status(201).json({ success: true, message: "Document uploaded. We will check it shortly.", document: toDocument(doc), ...documentsView(user) });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/worker/documents/:id – only while pending
export const deleteMyDocument = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid document ID." });
    const user = await User.findById(req.user._id);
    const doc = user.documents.id(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found." });
    if (doc.status !== "pending") {
      return res.status(409).json({ success: false, message: "Checked documents can no longer be deleted. Please contact the office." });
    }
    doc.deleteOne();
    await user.save();
    await recordAudit({ actor: req.user._id, action: "worker.document.deleted", entityType: "User", entityId: user._id, before: { documentId: req.params.id } });
    return res.json({ success: true, message: "Document deleted.", ...documentsView(user) });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
const loadWorkerDoc = async (req, res, { withData = false } = {}) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.docId)) {
    res.status(400).json({ success: false, message: "Invalid worker or document ID." });
    return null;
  }
  const query = User.findOne({ _id: req.params.id, role: "worker" });
  if (withData) query.select("+documents.data");
  const worker = await query;
  if (!worker) {
    res.status(404).json({ success: false, message: "Worker not found." });
    return null;
  }
  const doc = worker.documents.id(req.params.docId);
  if (!doc) {
    res.status(404).json({ success: false, message: "Document not found." });
    return null;
  }
  return { worker, doc };
};

/** Send the bytes: attachment by default; inline (admin preview) only for images/PDF */
const sendDocumentFile = (res, doc, { inline = false } = {}) => {
  res.setHeader("Content-Type", doc.type);
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(doc.name)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  return res.send(doc.data);
};

// GET /api/v1/admin/workers/:id/documents/:docId – download (?inline=1 for the preview)
export const downloadWorkerDocument = async (req, res, next) => {
  try {
    const found = await loadWorkerDoc(req, res, { withData: true });
    if (!found) return;
    const { doc } = found;
    if (!doc.data) return res.status(404).json({ success: false, message: "Document not found." });
    return sendDocumentFile(res, doc, { inline: req.query.inline === "1" });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/workers/:id/documents/:docId  { status: verified|rejected|pending, note? }
export const reviewWorkerDocument = async (req, res, next) => {
  try {
    const data = z
      .object({
        status: z.enum(["verified", "rejected", "pending"]),
        note: z.string().trim().max(500).optional().default(""),
        // ISO date (YYYY-MM-DD) – expiry of ID / work permit, valid through that day
        expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        idType: z.enum(["", "passport", "national_id", "residence_permit", "other"]).optional(),
      })
      .parse(req.body);
    const found = await loadWorkerDoc(req, res);
    if (!found) return;
    const { worker, doc } = found;
    if (data.status === "rejected" && !data.note) {
      return res.status(422).json({ success: false, message: "Please add a note explaining why the document was rejected." });
    }
    if (data.expiresAt !== undefined && data.expiresAt !== null) {
      const expiry = new Date(`${data.expiresAt}T00:00:00.000Z`);
      if (Number.isNaN(expiry.getTime())) return res.status(422).json({ success: false, message: "Invalid expiry date." });
      if (data.status === "verified" && expiry.getTime() < todayInBerlin().getTime()) {
        return res.status(422).json({ success: false, code: "DOCUMENT_ALREADY_EXPIRED", message: "This document has already expired and cannot be approved." });
      }
    }
    const before = { status: doc.status, note: doc.note, expiresAt: doc.expiresAt ?? null };
    if (data.expiresAt !== undefined) {
      doc.expiresAt = data.expiresAt ? new Date(`${data.expiresAt}T00:00:00.000Z`) : null;
      doc.reminders = { d30At: null, d7At: null, expiredAt: null };
    }
    if (data.idType !== undefined) doc.idType = data.idType;
    doc.status = data.status;
    doc.note = data.note;
    doc.checkedBy = data.status === "pending" ? null : req.user._id;
    doc.checkedAt = data.status === "pending" ? null : new Date();
    await worker.save();
    await recordAudit({ actor: req.user._id, action: `worker.document.${data.status}`, entityType: "User", entityId: worker._id, before, after: { documentId: doc._id, kind: doc.kind, ...data } });
    return res.json({ success: true, message: data.status === "verified" ? "Document verified." : data.status === "rejected" ? "Document rejected." : "Document reset to pending.", document: toDocument(doc), ...documentsView(worker) });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/worker/documents/:id/file – the cleaner's own file (attachment only)
export const downloadMyDocument = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid document ID." });
    const user = await User.findById(req.user._id).select("+documents.data");
    const doc = user?.documents.id(req.params.id);
    if (!doc?.data) return res.status(404).json({ success: false, message: "Document not found." });
    return sendDocumentFile(res, doc);
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/worker/documents/eligibility  { nationality: "DE" }
export const saveMyWorkEligibility = async (req, res, next) => {
  try {
    const { nationality } = z.object({ nationality: z.string().trim().regex(/^[A-Za-z]{2}$/) }).parse(req.body ?? {});
    const user = await User.findById(req.user._id);
    const before = { ...(user.workEligibility?.toObject?.() ?? {}) };
    user.workEligibility = { nationality: nationality.toUpperCase(), euCitizen: isFreeMovementCountry(nationality), declaredAt: new Date() };
    await user.save();
    await recordAudit({ actor: req.user._id, action: "worker.eligibility.declared", entityType: "User", entityId: user._id, before, after: { nationality: user.workEligibility.nationality, euCitizen: user.workEligibility.euCitizen } });
    return res.json({ success: true, ...documentsView(user) });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/documents/queue – every pending document + jobs beyond expiry
export const listDocumentQueue = async (req, res, next) => {
  try {
    const workers = await User.find({ role: "worker", anonymisedAt: null, "documents.status": "pending" })
      .select("name email workerStatus documents workEligibility role")
      .limit(200)
      .lean();
    const items = [];
    for (const w of workers) {
      for (const d of w.documents ?? []) {
        if (d.status !== "pending") continue;
        items.push({
          worker: { id: w._id, name: w.name, email: w.email, workerStatus: w.workerStatus, nationality: w.workEligibility?.nationality ?? "", euCitizen: isFreeMovement(w) },
          document: toDocument(d),
          expires: EXPIRING_KINDS.includes(d.kind),
        });
      }
    }
    items.sort((a, b) => new Date(a.document.uploadedAt) - new Date(b.document.uploadedAt));
    const flagged = await findJobsBeyondExpiry();
    return res.json({ success: true, count: items.length, items, flagged });
  } catch (error) {
    next(error);
  }
};
