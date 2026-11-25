import mongoose from "mongoose";
import { z } from "zod";

import WorkerApplication, {
  APPLICATION_STATUSES,
  EXPERIENCE_OPTIONS,
  EXPERIENCE_PLACES,
  HOURS_OPTIONS,
  SOURCES,
  VEHICLES,
  WORK_PERMITS,
} from "../models/worker-application.model.js";
import Review from "../models/review.model.js";
import { OPERATIONS, WORKER_PAY } from "../config/pricing.js";
import { recordAudit } from "../services/audit.service.js";
import { sendAdminNotificationEmail, sendApplicationReceivedEmail, trySend } from "../services/email.service.js";
import { createWorkerInvitation } from "./worker-admin.controller.js";
import { escapeRegex, getPagination, paginationMeta } from "../utils/helpers.js";
import { hasBytes, keys, removeStoredKeys, sendStoredFile, storeBytes } from "../services/file-store.service.js";

const CV_MAX_BYTES = 5 * 1024 * 1024;
const RETENTION_DAYS = 180;

// Accept only real document/image files – checked by content, not by name
const CV_TYPES = [
  { type: "application/pdf", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  { type: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx", magic: [0x50, 0x4b, 0x03, 0x04] },
  { type: "application/msword", ext: "doc", magic: [0xd0, 0xcf, 0x11, 0xe0] },
];

// Exported: the cleaner document upload (package E) reuses the same check
export const decodeCv = (dataUrl) => {
  const m = /^data:([\w.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) return null;
  const buffer = Buffer.from(m[2], "base64");
  const kind = CV_TYPES.find((t) => t.magic.every((b, i) => buffer[i] === b));
  if (!kind || buffer.length === 0) return null;
  return { buffer, kind };
};

const applicationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(30),
  postcode: z.string().trim().regex(/^\d{5}$/, "Please enter a valid 5-digit postcode."),
  languages: z.array(z.string().trim().min(2).max(10)).max(12).optional().default([]),
  permit: z.enum(WORK_PERMITS),
  hoursPerWeek: z.enum(HOURS_OPTIONS),
  experience: z.enum(EXPERIENCE_OPTIONS),
  experiencePlaces: z.array(z.enum(EXPERIENCE_PLACES)).max(EXPERIENCE_PLACES.length).optional().default([]),
  vehicle: z.enum(VEHICLES),
  source: z.enum(SOURCES),
  message: z.string().trim().max(1000).optional().default(""),
  locale: z.enum(["de", "en", "pl"]).optional().default("de"),
  privacyAccepted: z.literal(true, { message: "Please accept the privacy notice." }),
  cv: z
    .object({ name: z.string().trim().min(1).max(200), dataUrl: z.string().max(Math.ceil((CV_MAX_BYTES * 4) / 3) + 200) })
    .optional(),
  // Honeypot – real people never fill this hidden field
  website: z.string().max(0).optional().default(""),
});

// POST /api/v1/jobs/applications (public, rate limited)
export const submitApplication = async (req, res, next) => {
  try {
    const parsed = applicationSchema.safeParse(req.body);
    if (!parsed.success) {
      // Bots filling the honeypot get a quiet success (nothing stored)
      if (parsed.error.issues.some((i) => i.path[0] === "website")) return res.status(201).json({ success: true });
      throw parsed.error;
    }
    const data = parsed.data;
    const email = data.email.toLowerCase();

    const recent = await WorkerApplication.findOne({
      email,
      status: { $in: ["new", "contacted"] },
      createdAt: { $gte: new Date(Date.now() - 30 * 86400e3) },
    }).select("_id");
    if (recent) {
      return res.status(409).json({ success: false, message: "We already have your application and will get back to you soon." });
    }

    let cv;
    const appId = new mongoose.Types.ObjectId();
    if (data.cv) {
      const decoded = decodeCv(data.cv.dataUrl);
      if (!decoded) {
        return res.status(422).json({ success: false, message: "Please upload your CV as PDF, Word, JPG or PNG." });
      }
      if (decoded.buffer.length > CV_MAX_BYTES) {
        return res.status(422).json({ success: false, message: "The CV file may be at most 5 MB." });
      }
      const stored = await storeBytes(keys.applicationCv(appId, decoded.kind.type), decoded.buffer, decoded.kind.type);
      cv = { ...stored, name: data.cv.name.replace(/[^\w.\- ()äöüÄÖÜß]/g, "_"), type: decoded.kind.type };
    }

    let application;
    try {
      application = await WorkerApplication.create({
        _id: appId,
        ...data,
        email,
        cv,
        privacyAcceptedAt: new Date(),
      });
    } catch (error) {
      await removeStoredKeys([cv?.storageKey], "application.create-failed");
      throw error;
    }

    await trySend("Application received", () => sendApplicationReceivedEmail({ to: email, name: data.name, locale: data.locale }));
    await trySend("Admin notification", () =>
      sendAdminNotificationEmail({
        subject: `Neue Bewerbung als Reinigungskraft: ${data.name}`,
        lines: [
          `PLZ: ${data.postcode} · Stunden/Woche: ${data.hoursPerWeek} · Erfahrung: ${data.experience}`,
          `Lebenslauf: ${cv ? "ja" : "nein"}`,
          "Im Adminbereich unter „Bewerbungen“ prüfen.",
        ],
      })
    );

    return res.status(201).json({ success: true, message: "Thank you! We have received your application.", id: application._id });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
const toListItem = (a) => ({
  _id: a._id,
  name: a.name,
  email: a.email,
  phone: a.phone,
  postcode: a.postcode,
  permit: a.permit,
  hoursPerWeek: a.hoursPerWeek,
  experience: a.experience,
  vehicle: a.vehicle,
  status: a.status,
  hasCv: Boolean(a.cv?.size),
  createdAt: a.createdAt,
});

// GET /api/v1/admin/applications?status=&search=&page=
export const listApplications = async (req, res, next) => {
  try {
    const pagination = getPagination(req.query, { defaultLimit: 20 });
    const filter = {};
    if (APPLICATION_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(String(req.query.search).trim()), "i");
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { postcode: rx }];
    }
    const [items, total, counts] = await Promise.all([
      WorkerApplication.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
      WorkerApplication.countDocuments(filter),
      WorkerApplication.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);
    return res.json({
      success: true,
      applications: items.map(toListItem),
      pagination: paginationMeta(pagination, total),
      counts: Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.n ?? 0])),
    });
  } catch (error) {
    next(error);
  }
};

const findApplication = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid application ID." });
    return null;
  }
  const a = await WorkerApplication.findById(req.params.id);
  if (!a) res.status(404).json({ success: false, message: "Application not found." });
  return a;
};

// GET /api/v1/admin/applications/:id
export const getApplication = async (req, res, next) => {
  try {
    const a = await findApplication(req, res);
    if (!a) return;
    const { cv, ...rest } = a.toObject();
    return res.json({ success: true, application: { ...rest, cv: cv?.size ? { name: cv.name, type: cv.type, size: cv.size } : null } });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/applications/:id/cv – download (attachment only)
export const downloadApplicationCv = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid application ID." });
    const a = await WorkerApplication.findById(req.params.id).select("+cv.data cv.name cv.type cv.storageKey");
    if (!hasBytes(a?.cv)) return res.status(404).json({ success: false, message: "No CV uploaded." });
    res.setHeader("Content-Type", a.cv.type);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(a.cv.name)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    if (await sendStoredFile(res, a.cv)) return;
    res.removeHeader("Content-Disposition");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(404).json({ success: false, message: "No CV uploaded." });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/applications/:id  { status?, adminNote? }
export const updateApplication = async (req, res, next) => {
  try {
    const data = z
      .object({ status: z.enum(["new", "contacted", "rejected"]).optional(), adminNote: z.string().trim().max(1000).optional() })
      .parse(req.body);
    const a = await findApplication(req, res);
    if (!a) return;
    if (a.status === "invited" && data.status) {
      return res.status(409).json({ success: false, message: "This applicant has already been invited." });
    }
    const before = { status: a.status, adminNote: a.adminNote };
    if (data.status && data.status !== a.status) {
      a.status = data.status;
      a.statusChangedAt = new Date();
    }
    if (data.adminNote !== undefined) a.adminNote = data.adminNote;
    await a.save();
    await recordAudit({ actor: req.user._id, action: "application.updated", entityType: "WorkerApplication", entityId: a._id, before, after: data });
    return res.json({ success: true, application: toListItem(a) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/admin/applications/:id/invite – sends the normal worker invitation
export const inviteApplicant = async (req, res, next) => {
  try {
    const a = await findApplication(req, res);
    if (!a) return;
    if (a.status === "invited") return res.status(409).json({ success: false, message: "This applicant has already been invited." });
    let worker;
    try {
      worker = await createWorkerInvitation({ name: a.name, email: a.email, phone: a.phone, locale: a.locale });
    } catch (error) {
      if (error.statusCode === 409 || error.statusCode === 500) return res.status(error.statusCode).json({ success: false, message: error.message });
      throw error;
    }
    // Carry over the application facts so the cleaner starts with a profile
    worker.set("workerProfile.languages", a.languages);
    await worker.save();
    a.status = "invited";
    a.statusChangedAt = new Date();
    a.invitedWorker = worker._id;
    await a.save();
    await recordAudit({ actor: req.user._id, action: "application.invited", entityType: "WorkerApplication", entityId: a._id, after: { worker: worker._id } });
    return res.status(201).json({ success: true, message: "Worker invitation sent.", workerId: worker._id });
  } catch (error) {
    next(error);
  }
};

/** Daily GDPR cleanup: drop old applications; invited ones keep no CV. */
export const purgeOldApplications = async () => {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400e3);
  // Collect the stored CV keys first: the files go with the records
  const withFiles = await WorkerApplication.find({ createdAt: { $lt: cutoff }, "cv.storageKey": { $exists: true, $ne: null } }).select("status cv.storageKey").lean();
  const removed = await WorkerApplication.deleteMany({ status: { $ne: "invited" }, createdAt: { $lt: cutoff } });
  const stripped = await WorkerApplication.updateMany({ status: "invited", createdAt: { $lt: cutoff }, "cv.size": { $gt: 0 } }, { $unset: { cv: 1 } });
  const files = await removeStoredKeys(withFiles.map((a) => a.cv?.storageKey), "application.retention");
  return { removed: removed.deletedCount, stripped: stripped.modifiedCount, filesDeleted: files.deleted, filesQueued: files.queued };
};

// ---------------------------------------------------------------------------
// GET /api/v1/home/trust – public homepage trust facts (cached 5 min)
// ---------------------------------------------------------------------------
let trustCache = { at: 0, body: null };
export const getHomeTrust = async (req, res, next) => {
  try {
    if (trustCache.body && Date.now() - trustCache.at < 5 * 60 * 1000) return res.json(trustCache.body);
    const [agg] = await Review.aggregate([{ $match: { hidden: false } }, { $group: { _id: null, avg: { $avg: "$rating" }, n: { $sum: 1 } } }]);
    const latest = await Review.find({ hidden: false, rating: { $gte: 4 }, comment: { $ne: "" } })
      .sort({ createdAt: -1 })
      .limit(9)
      .populate("customer", "name")
      .populate("booking", "serviceId")
      .lean();
    const tiers = WORKER_PAY.commissionTiers;
    const pcts = Object.values(tiers).map((t) => t.commissionPct);
    const body = {
      success: true,
      rating: agg ? { average: Math.round(agg.avg * 10) / 10, count: agg.n } : { average: null, count: 0 },
      reviews: latest.map((r) => {
        const parts = String(r.customer?.name ?? "").trim().split(/\s+/);
        return {
          _id: r._id,
          rating: r.rating,
          comment: r.comment,
          author: parts[0] ? `${parts[0]}${parts[1] ? ` ${parts[1][0]}.` : ""}` : "",
          serviceId: r.booking?.serviceId ?? null,
          createdAt: r.createdAt,
        };
      }),
      cleanerShare: WORKER_PAY.payModel === "commission" ? { minPct: 100 - Math.max(...pcts), maxPct: 100 - Math.min(...pcts) } : null,
      cancellationCutoffHours: OPERATIONS.cancellationCutoffHours,
    };
    trustCache = { at: Date.now(), body };
    return res.json(body);
  } catch (error) {
    next(error);
  }
};
