// Cleaner verification documents (package E): ID, work permit, Gewerbe, other.
// Cleaners upload PDF/JPG/PNG (≤ 5 MB, checked by magic bytes); the admin
// downloads and verifies/rejects them. Approval requires every document kind
// in VERIFICATION.requiredDocuments to be verified.
import mongoose from "mongoose";
import { z } from "zod";

import User from "../models/user.model.js";
import { DOCUMENT_KINDS, VERIFICATION } from "../config/pricing.js";
import { recordAudit } from "../services/audit.service.js";
import { sendAdminNotificationEmail, trySend } from "../services/email.service.js";
import { decodeCv } from "./worker-application.controller.js";

export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_DOCUMENTS = 10;

const uploadSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
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
});

/** Every required document kind has at least one verified file */
export const requiredDocumentsVerified = (user) =>
  VERIFICATION.requiredDocuments.every((kind) => (user?.documents ?? []).some((d) => d.kind === kind && d.status === "verified"));

/** Required kinds that are still missing a verified document */
export const missingRequiredDocuments = (user) =>
  VERIFICATION.requiredDocuments.filter((kind) => !(user?.documents ?? []).some((d) => d.kind === kind && d.status === "verified"));

export const documentsView = (user) => ({
  documents: (user?.documents ?? []).map(toDocument),
  required: [...VERIFICATION.requiredDocuments],
  missing: missingRequiredDocuments(user),
  verified: requiredDocumentsVerified(user),
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
    const user = await User.findById(req.user._id);
    if ((user.documents?.length ?? 0) >= MAX_DOCUMENTS) {
      return res.status(409).json({ success: false, message: "You have reached the maximum number of documents. Please delete one first." });
    }
    user.documents.push({
      kind: data.kind,
      name: data.name.replace(/[^\w.\- ()äöüÄÖÜß]/g, "_"),
      type: decoded.kind.type,
      size: decoded.buffer.length,
      data: decoded.buffer,
      uploadedAt: new Date(),
      status: "pending",
    });
    await user.save();
    const doc = user.documents[user.documents.length - 1];
    await recordAudit({ actor: req.user._id, action: "worker.document.uploaded", entityType: "User", entityId: user._id, after: { documentId: doc._id, kind: doc.kind, size: doc.size } });
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

// GET /api/v1/admin/workers/:id/documents/:docId – download (attachment only)
export const downloadWorkerDocument = async (req, res, next) => {
  try {
    const found = await loadWorkerDoc(req, res, { withData: true });
    if (!found) return;
    const { doc } = found;
    if (!doc.data) return res.status(404).json({ success: false, message: "Document not found." });
    res.setHeader("Content-Type", doc.type);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.name)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(doc.data);
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/workers/:id/documents/:docId  { status: verified|rejected|pending, note? }
export const reviewWorkerDocument = async (req, res, next) => {
  try {
    const data = z.object({ status: z.enum(["verified", "rejected", "pending"]), note: z.string().trim().max(500).optional().default("") }).parse(req.body);
    const found = await loadWorkerDoc(req, res);
    if (!found) return;
    const { worker, doc } = found;
    if (data.status === "rejected" && !data.note) {
      return res.status(422).json({ success: false, message: "Please add a note explaining why the document was rejected." });
    }
    const before = { status: doc.status, note: doc.note };
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
