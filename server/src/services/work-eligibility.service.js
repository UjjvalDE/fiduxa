// Work eligibility (identity + work permit) for cleaners.
//
// Required documents: the kinds in VERIFICATION.requiredDocuments (package E,
// admin-configurable) plus always an identity document ("id": passport or
// national ID) and – unless the cleaner is an EU/EEA/Swiss citizen – a work
// permit / residence title with work permission ("permit"). ID and permit
// carry an expiry date (set by the admin on approval).
//
// A cleaner may only see / accept / be assigned a job while every required
// document is verified and still valid ON THE JOB DATE (not only today).
import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import { VERIFICATION } from "../config/pricing.js";
import { DAY_MS, escapeHtml, formatGermanDate, todayInBerlin } from "../utils/helpers.js";
import { recordAudit } from "./audit.service.js";
import { emailButton, emailGreeting, emailLayout, sendAdminNotificationEmail, sendRawEmail, trySend } from "./email.service.js";
import { getSiteUrl } from "../utils/site-url.js";

/** EU + EEA (IS, LI, NO) + Switzerland: free movement, no work permit needed */
export const FREE_MOVEMENT_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO",
  "SK", "SI", "ES", "SE", "IS", "LI", "NO", "CH",
];
export const isFreeMovementCountry = (code) => FREE_MOVEMENT_COUNTRIES.includes(String(code ?? "").toUpperCase());

/** Kinds that expire (the admin stores the expiry date) */
export const EXPIRING_KINDS = ["id", "permit"];
export const EXPIRY_REMINDER_DAYS = [30, 7];
export const EXPIRING_SOON_DAYS = 30;

/**
 * Job gate switch. On by default; the e2e suites written before this feature
 * create approved cleaners directly in the DB without documents, so under
 * NODE_ENV=test it is off unless ENFORCE_WORK_ELIGIBILITY=true.
 */
export const eligibilityEnforced = () =>
  process.env.ENFORCE_WORK_ELIGIBILITY === "true" || (process.env.ENFORCE_WORK_ELIGIBILITY !== "false" && process.env.NODE_ENV !== "test");

/** EU/EEA/CH citizen? null = not answered yet */
export const isFreeMovement = (user) => (user?.workEligibility?.euCitizen === true ? true : user?.workEligibility?.euCitizen === false ? false : null);

/** Required document kinds for THIS cleaner (EU citizens skip the permit) */
export const requiredKindsFor = (user) => {
  const kinds = new Set(["id", ...VERIFICATION.requiredDocuments]);
  if (isFreeMovement(user) !== true) kinds.add("permit");
  else kinds.delete("permit");
  return [...kinds];
};

const dayStart = (d) => {
  const date = new Date(d);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

/** Valid through the expiry day (inclusive) */
const validOn = (doc, date) => !EXPIRING_KINDS.includes(doc.kind) || (doc.expiresAt && dayStart(doc.expiresAt).getTime() >= dayStart(date).getTime());

/** Verified document of a kind with the latest expiry (or latest check) */
const bestVerified = (user, kind) =>
  (user?.documents ?? [])
    .filter((d) => d.kind === kind && d.status === "verified")
    .sort((a, b) => (b.expiresAt ? new Date(b.expiresAt).getTime() : 0) - (a.expiresAt ? new Date(a.expiresAt).getTime() : 0) || new Date(b.checkedAt ?? 0) - new Date(a.checkedAt ?? 0))[0] ?? null;

const latest = (user, kind, status) =>
  (user?.documents ?? []).filter((d) => d.kind === kind && d.status === status).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0] ?? null;

/**
 * Status of one required kind:
 * missing | pending | rejected | approved | expiring_soon | expired | expiry_missing
 */
export const kindStatus = (user, kind, now = todayInBerlin()) => {
  const verified = bestVerified(user, kind);
  const pending = latest(user, kind, "pending");
  if (verified) {
    const needsExpiry = EXPIRING_KINDS.includes(kind);
    if (needsExpiry && !verified.expiresAt) return { kind, status: "expiry_missing", document: verified, renewal: pending };
    if (!validOn(verified, now)) {
      if (pending) return { kind, status: "pending", document: pending, expired: verified };
      return { kind, status: "expired", document: verified, expiresAt: verified.expiresAt };
    }
    if (needsExpiry && dayStart(verified.expiresAt).getTime() - dayStart(now).getTime() <= EXPIRING_SOON_DAYS * DAY_MS) {
      return { kind, status: "expiring_soon", document: verified, expiresAt: verified.expiresAt, renewal: pending };
    }
    return { kind, status: "approved", document: verified, expiresAt: verified.expiresAt ?? null, renewal: pending };
  }
  if (pending) return { kind, status: "pending", document: pending };
  const rejected = latest(user, kind, "rejected");
  if (rejected) return { kind, status: "rejected", document: rejected, note: rejected.note };
  return { kind, status: "missing", document: null };
};

/** Earliest expiry over the required expiring documents (null = none / unknown) */
export const eligibleUntil = (user) => {
  const dates = requiredKindsFor(user)
    .filter((k) => EXPIRING_KINDS.includes(k))
    .map((k) => bestVerified(user, k)?.expiresAt)
    .filter(Boolean)
    .map((d) => dayStart(d).getTime());
  return dates.length ? new Date(Math.min(...dates)) : null;
};

/**
 * Why this cleaner may not work on `jobDate` (null = eligible).
 * Codes: DOCUMENTS_MISSING, DOCUMENTS_EXPIRED, WORK_PERMIT_EXPIRES_BEFORE_JOB, ID_EXPIRES_BEFORE_JOB
 */
export const eligibilityProblem = (user, jobDate, { enforce = eligibilityEnforced() } = {}) => {
  if (!enforce || user?.role !== "worker") return null;
  const today = todayInBerlin();
  for (const kind of requiredKindsFor(user)) {
    const doc = bestVerified(user, kind);
    if (!doc || (EXPIRING_KINDS.includes(kind) && !doc.expiresAt)) return { code: "DOCUMENTS_MISSING", kind };
    if (!validOn(doc, today)) return { code: "DOCUMENTS_EXPIRED", kind, expiresAt: doc.expiresAt };
    if (jobDate && !validOn(doc, jobDate)) {
      return { code: kind === "permit" ? "WORK_PERMIT_EXPIRES_BEFORE_JOB" : "ID_EXPIRES_BEFORE_JOB", kind, expiresAt: doc.expiresAt };
    }
  }
  return null;
};

export const ELIGIBILITY_MESSAGES = {
  DOCUMENTS_MISSING: "Your identity / work permit documents are not verified yet. Please complete your verification first.",
  DOCUMENTS_EXPIRED: "One of your documents has expired. Please upload a valid document before taking new jobs.",
  WORK_PERMIT_EXPIRES_BEFORE_JOB: "Your work permit expires before this job date. Please upload your renewed permit first.",
  ID_EXPIRES_BEFORE_JOB: "Your identity document expires before this job date. Please upload your new document first.",
};
export const ADMIN_ELIGIBILITY_MESSAGES = {
  DOCUMENTS_MISSING: "This cleaner's identity / work permit documents are not verified (or have no expiry date).",
  DOCUMENTS_EXPIRED: "One of this cleaner's documents has expired.",
  WORK_PERMIT_EXPIRES_BEFORE_JOB: "This cleaner's work permit expires before the job date.",
  ID_EXPIRES_BEFORE_JOB: "This cleaner's identity document expires before the job date.",
};

/** Throw-free response helper: sends 409 and returns true when blocked */
export const rejectIfIneligible = (res, user, jobDate, { admin = false } = {}) => {
  const problem = eligibilityProblem(user, jobDate);
  if (!problem) return false;
  res.status(409).json({
    success: false,
    code: problem.code,
    message: (admin ? ADMIN_ELIGIBILITY_MESSAGES : ELIGIBILITY_MESSAGES)[problem.code],
    documentKind: problem.kind,
    expiresAt: problem.expiresAt ?? null,
  });
  return true;
};

// ---------------------------------------------------------------------------
// Admin: future jobs that are assigned beyond the cleaner's document expiry
// ---------------------------------------------------------------------------
export const findJobsBeyondExpiry = async ({ workerIds } = {}) => {
  const workers = await User.find({
    role: "worker",
    anonymisedAt: null,
    "documents.expiresAt": { $ne: null },
    ...(workerIds && { _id: { $in: workerIds } }),
  }).select("name email documents workEligibility role");
  const rows = [];
  for (const worker of workers) {
    const until = eligibleUntil(worker);
    if (!until) continue;
    const jobs = await Booking.find({
      assignedWorker: worker._id,
      status: { $in: ["confirmed", "in_progress"] },
      preferredDate: { $gt: until, $gte: todayInBerlin() },
    })
      .select("reference preferredDate slot status")
      .sort({ preferredDate: 1 })
      .lean();
    if (jobs.length) {
      rows.push({
        worker: { id: worker._id, name: worker.name, email: worker.email },
        eligibleUntil: until,
        jobs: jobs.map((j) => ({ id: j._id, reference: j.reference, preferredDate: j.preferredDate, slot: j.slot, status: j.status })),
      });
    }
  }
  return rows;
};

// ---------------------------------------------------------------------------
// Expiry reminders (worker process job, lock via scheduler/tryWithLock)
// ---------------------------------------------------------------------------
const KIND_LABEL = { id: "Ausweis / Reisepass (ID / passport)", permit: "Aufenthaltstitel / Arbeitserlaubnis (work permit)" };

const sendCleanerExpiryReminder = async ({ worker, doc, days }) => {
  const g = emailGreeting("de");
  const url = `${getSiteUrl()}/worker/dokumente`;
  const date = formatGermanDate(doc.expiresAt);
  const subject = `Dein Dokument läuft in ${days} Tagen ab – Your document expires in ${days} days`;
  const text = [
    `${g.hello} ${worker.name},`,
    `dein Dokument „${KIND_LABEL[doc.kind]}“ läuft am ${date} ab. Bitte lade rechtzeitig ein gültiges Dokument hoch – nach Ablauf kannst du keine neuen Aufträge annehmen, und Aufträge nach diesem Datum werden neu vergeben.`,
    `Your document "${KIND_LABEL[doc.kind]}" expires on ${date}. Please upload a valid document in time – after expiry you cannot take new jobs.`,
    url,
  ].join("\n\n");
  return sendRawEmail({
    to: worker.email,
    template: "documentExpiryReminder",
    subject,
    text,
    html: emailLayout(
      "Dokument läuft bald ab",
      `<p>${g.hello} ${escapeHtml(worker.name)},</p><p>dein Dokument „${KIND_LABEL[doc.kind]}“ läuft am <strong>${date}</strong> ab. Bitte lade rechtzeitig ein gültiges Dokument hoch – nach Ablauf kannst du keine neuen Aufträge annehmen.</p><p style="color:#65736B">Your document expires on ${date}. Please upload a valid one in time.</p>${emailButton(url, "Dokument hochladen")}`,
      g.regardsHtml
    ),
  });
};

/**
 * 30 / 7 days before expiry → cleaner; on expiry → admin (+ future jobs
 * beyond the expiry listed for reassignment). Each mail once per document.
 */
export const processDocumentExpiries = async () => {
  const today = todayInBerlin();
  const horizon = new Date(today.getTime() + Math.max(...EXPIRY_REMINDER_DAYS) * DAY_MS);
  const workers = await User.find({
    role: "worker",
    isActive: true,
    anonymisedAt: null,
    documents: { $elemMatch: { status: "verified", kind: { $in: EXPIRING_KINDS }, expiresAt: { $ne: null, $lte: horizon } } },
  }).limit(500);

  const result = { reminders: 0, expired: 0 };
  for (const worker of workers) {
    const required = requiredKindsFor(worker);
    let changed = false;
    for (const kind of EXPIRING_KINDS.filter((k) => required.includes(k))) {
      const doc = bestVerified(worker, kind);
      if (!doc?.expiresAt) continue;
      const daysLeft = Math.round((dayStart(doc.expiresAt).getTime() - today.getTime()) / DAY_MS);
      if (daysLeft < 0) {
        if (doc.reminders?.expiredAt) continue;
        doc.set("reminders.expiredAt", new Date());
        changed = true;
        const flagged = await findJobsBeyondExpiry({ workerIds: [worker._id] });
        const refs = flagged[0]?.jobs.map((j) => `${j.reference} (${formatGermanDate(j.preferredDate)})`) ?? [];
        // Jobs after the expiry: automatic replacement (auto mode) instead of a manual list
        const { replaceAssignment } = await import("./auto-assign.service.js");
        const { isAutoMode } = await import("./assignment-mode.js");
        const replacedRefs = [];
        for (const j of isAutoMode() ? flagged[0]?.jobs ?? [] : []) {
          const r = await replaceAssignment(j._id ?? j.id, { workerId: worker._id, kind: "documents", reason: `${KIND_LABEL[kind]} abgelaufen` });
          if (r.state === "assigned") replacedRefs.push(j.reference);
        }
        await trySend("Admin notification", () =>
          sendAdminNotificationEmail({
            subject: `Dokument abgelaufen: ${worker.name}`,
            lines: [
              `Reinigungskraft: ${worker.name} (${worker.email})`,
              `Dokument: ${KIND_LABEL[kind]} – abgelaufen am ${formatGermanDate(doc.expiresAt)}`,
              "Keine neuen Aufträge mehr möglich, bis ein gültiges Dokument geprüft ist.",
              refs.length ? `Betroffene Aufträge: ${refs.join(", ")}` : "Keine zugewiesenen Aufträge nach dem Ablaufdatum.",
              ...(refs.length ? [replacedRefs.length ? `Automatisch neu vergeben: ${replacedRefs.join(", ")}` : "Bitte unter Admin → Disposition prüfen."] : []),
            ],
          })
        );
        await recordAudit({ actor: null, action: "worker.document.expired", entityType: "User", entityId: worker._id, after: { documentId: doc._id, kind, expiresAt: doc.expiresAt, jobsToReassign: refs } });
        result.expired += 1;
        continue;
      }
      // Most urgent threshold reached (7 before 30); each threshold mails once
      const due = EXPIRY_REMINDER_DAYS.filter((d) => daysLeft <= d).sort((a, b) => a - b)[0];
      if (due === undefined || doc.get(`reminders.d${due}At`)) continue;
      for (const d of EXPIRY_REMINDER_DAYS) if (d >= due && !doc.get(`reminders.d${d}At`)) doc.set(`reminders.d${d}At`, new Date());
      changed = true;
      await trySend("Document expiry reminder", () => sendCleanerExpiryReminder({ worker, doc, days: daysLeft }));
      await recordAudit({ actor: null, action: "worker.document.expiry_reminder", entityType: "User", entityId: worker._id, after: { documentId: doc._id, kind, threshold: due, daysLeft } });
      result.reminders += 1;
    }
    if (changed) await worker.save();
  }
  return result;
};
