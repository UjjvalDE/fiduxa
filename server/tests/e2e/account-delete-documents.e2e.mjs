// E2E: self-service account deletion (customer, cleaner, social-login user)
// with upcoming-booking rules + retained payout records, and cleaner work
// eligibility: ID / work permit documents with expiry, EU skip, job gate on
// the JOB date, expiry reminders and document access control.
import { ROOT, apiClient, createChecker, prepareEnv, ALWAYS_AVAILABLE, BERLIN_WIDE } from "../helpers/harness.mjs";
prepareEnv("fiduxa_e2e_account_docs");
// Legacy job board (assignmentMode "board"): this suite tests cleaners accepting /
// handing back jobs from the open-job board. Automatic assignment is covered by
// auto-assignment.e2e.mjs; the board stays reachable for a rollback.
process.env.ASSIGNMENT_MODE = "board";
process.env.EMAIL_TRANSPORT = "json";
process.env.DISABLE_RATE_LIMIT = "1";
process.env.ADMIN_NOTIFICATION_EMAIL = "office@t.local";
process.env.ENFORCE_WORK_ELIGIBILITY = "true"; // job gate on (off by default under NODE_ENV=test)

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: Payout } = await import(ROOT + "/src/models/payout.model.js");
const { default: AuditLog } = await import(ROOT + "/src/models/audit-log.model.js");
const { default: EmailMessage } = await import(ROOT + "/src/models/email.model.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { findEligibleWorkers } = await import(ROOT + "/src/services/job-dispatch.service.js");
const { processDocumentExpiries } = await import(ROOT + "/src/services/work-eligibility.service.js");
const { purgeSettledPayoutDetails } = await import(ROOT + "/src/services/account-privacy.service.js");
const { settleWorker } = await import(ROOT + "/src/services/payout.service.js");
const { findJob } = await import(ROOT + "/src/jobs/index.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
await loadSettings();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);
const pdf = () => `data:application/pdf;base64,${Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(1500, 65)]).toString("base64")}`;
const jpg = () => `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(800, 3)]).toString("base64")}`;
const raw = (p, token) => fetch(base + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

const pw = await bcrypt.hash("Password12345", 10);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const mkWorker = (name, email, extra = {}) =>
  User.create({
    name, email, password: pw, role: "worker", availability: ALWAYS_AVAILABLE, workerStatus: "approved", emailVerified: true,
    workerProfile: { ...BERLIN_WIDE, address: "Invalidenstr. 5, 10115 Berlin", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: name, ...extra,
  });
const tara = await mkWorker("Tara Third", "tara@t.local"); // non-EU, needs permit
const eva = await mkWorker("Eva EU", "eva@t.local"); // EU citizen, no permit
const dora = await mkWorker("Dora Delete", "dora@t.local"); // cleaner who deletes her account
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const adminT = await login("admin@t.local");
const taraT = await login("tara@t.local");
const evaT = await login("eva@t.local");
const doraT = await login("dora@t.local");

let r = await call("POST", "/admin/slots", { from: day(1), to: day(14), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00" }, { startTime: "13:00" }], capacity: 5 }, adminT);
check("slots created", r.status === 201 || r.status === 200, r.body);
r = await call("POST", "/auth/register", { name: "Kunde Karl", email: "karl@t.local", password: "Password12345" });
const karlT = r.body.token;
const karlId = r.body.user.id;
const book = async (d, startTime = "08:00", token = karlT, email = "karl@t.local") => {
  const slot = (await call("GET", `/bookings/availability?date=${d}`)).body.data.find((s) => s.startTime === startTime);
  const res = await call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, extras: [], name: "Kunde", email, phone: "030123456", postcode: "10115",
    address: "Teststr. 1", preferredDate: d, slotId: slot.id, earlyStartConsent: true,
  }, token);
  return res.body.booking?.id;
};

// ---------------------------------------------------------------------------
// 1. Document checklist: nationality, EU skip, upload, review with expiry
// ---------------------------------------------------------------------------
r = await call("GET", "/worker/documents", null, taraT);
check("checklist lists id + permit as missing (nationality not answered)", r.body.checklist?.map((c) => `${c.kind}:${c.status}`).join() === "id:missing,permit:missing" && r.body.workEligibility?.permitRequired === true, r.body);
check("not eligible: DOCUMENTS_MISSING", r.body.eligibility?.eligible === false && r.body.eligibility.code === "DOCUMENTS_MISSING", r.body.eligibility);
r = await call("PUT", "/worker/documents/eligibility", { nationality: "XX1" }, taraT);
check("invalid nationality → 400/422", r.status === 400 || r.status === 422, r.status);
r = await call("PUT", "/worker/documents/eligibility", { nationality: "ua" }, taraT);
check("non-EU nationality → permit required", r.status === 200 && r.body.workEligibility.nationality === "UA" && r.body.workEligibility.euCitizen === false && r.body.required.includes("permit"), r.body);
r = await call("PUT", "/worker/documents/eligibility", { nationality: "PL" }, evaT);
check("EU nationality → permit step skipped", r.status === 200 && r.body.workEligibility.euCitizen === true && !r.body.required.includes("permit") && r.body.checklist.length === 1, r.body);
r = await call("PUT", "/worker/documents/eligibility", { nationality: "CH" }, doraT);
check("Swiss counts as free movement", r.body.workEligibility?.euCitizen === true, r.body.workEligibility);

r = await call("POST", "/worker/documents", { kind: "id", idType: "passport", name: "Pass.jpg", dataUrl: jpg() }, taraT);
const taraId = r.body.document?.id;
check("phone photo (JPEG) upload of passport → pending, idType stored", r.status === 201 && r.body.document.idType === "passport" && r.body.checklist[0].status === "pending", r.body);
r = await call("POST", "/worker/documents", { kind: "permit", name: "Titel.txt", dataUrl: `data:text/plain;base64,${Buffer.from("hello").toString("base64")}` }, taraT);
check("wrong file type → 422", r.status === 422, r.body);
r = await call("POST", "/worker/documents", { kind: "permit", name: "Aufenthaltstitel.pdf", dataUrl: pdf() }, taraT);
const taraPermit1 = r.body.document?.id;
check("permit upload (PDF) → pending", r.status === 201, r.body);

r = await call("GET", "/admin/documents/queue", null, adminT);
check("admin queue lists both pending docs of Tara with nationality", r.status === 200 && r.body.items.filter((i) => String(i.worker.id) === String(tara._id)).length === 2 && r.body.items[0].worker.nationality === "UA", r.body);
r = await call("GET", "/admin/documents/queue", null, taraT);
check("cleaner cannot open the admin queue → 403", r.status === 403, r.status);

r = await call("PATCH", `/admin/workers/${tara._id}/documents/${taraPermit1}`, { status: "rejected", note: "Unleserlich" }, adminT);
check("admin rejects permit with reason", r.status === 200 && r.body.checklist.find((c) => c.kind === "permit")?.status === "rejected" && r.body.checklist.find((c) => c.kind === "permit").note === "Unleserlich", r.body.checklist);
r = await call("POST", "/worker/documents", { kind: "permit", name: "Aufenthaltstitel-neu.pdf", dataUrl: pdf() }, taraT);
const taraPermit = r.body.document?.id;
check("re-upload of the rejected item replaces it", r.status === 201 && r.body.documents.filter((d) => d.kind === "permit").length === 1 && r.body.checklist.find((c) => c.kind === "permit").status === "pending", r.body.documents);
r = await call("PATCH", `/admin/workers/${tara._id}/documents/${taraPermit}`, { status: "verified", expiresAt: day(-1) }, adminT);
check("approving an already expired document → 422", r.status === 422 && r.body.code === "DOCUMENT_ALREADY_EXPIRED", r.body);
r = await call("PATCH", `/admin/workers/${tara._id}/documents/${taraId}`, { status: "verified", expiresAt: day(400), idType: "passport" }, adminT);
check("passport approved with expiry", r.status === 200 && r.body.document.expiresAt?.startsWith(day(400)), r.body.document);
r = await call("PATCH", `/admin/workers/${tara._id}/documents/${taraPermit}`, { status: "verified", expiresAt: day(10) }, adminT);
check("permit approved, expiring soon (10 days)", r.status === 200 && r.body.checklist.find((c) => c.kind === "permit").status === "expiring_soon" && r.body.eligibility.eligible === true && r.body.eligibility.eligibleUntil?.startsWith(day(10)), r.body);
check("audit log has upload + verify entries", (await AuditLog.countDocuments({ entityId: tara._id, action: { $in: ["worker.document.uploaded", "worker.document.verified", "worker.document.rejected"] } })) >= 5);

// Eva (EU): ID only
r = await call("POST", "/worker/documents", { kind: "id", idType: "national_id", name: "Dowod.pdf", dataUrl: pdf() }, evaT);
const evaId = r.body.document?.id;
r = await call("PATCH", `/admin/workers/${eva._id}/documents/${evaId}`, { status: "verified", expiresAt: day(900) }, adminT);
check("EU cleaner eligible with national ID only", r.status === 200 && r.body.verified === true && r.body.eligibility.eligible === true, r.body.eligibility);

// ---------------------------------------------------------------------------
// 2. Access control on document download
// ---------------------------------------------------------------------------
let res = await raw(`/worker/documents/${taraId}/file`, taraT);
let bytes = Buffer.from(await res.arrayBuffer());
check("owner downloads own document (attachment, nosniff, no-store)", res.status === 200 && /attachment/.test(res.headers.get("content-disposition") ?? "") && res.headers.get("x-content-type-options") === "nosniff" && /no-store/.test(res.headers.get("cache-control") ?? "") && bytes[0] === 0xff, res.status);
res = await raw(`/worker/documents/${taraId}/file`, evaT);
check("other cleaner cannot download it → 404", res.status === 404, res.status);
res = await raw(`/worker/documents/${taraId}/file`, karlT);
check("customer cannot download → 403", res.status === 403, res.status);
res = await raw(`/worker/documents/${taraId}/file`);
check("anonymous → 401", res.status === 401, res.status);
res = await raw(`/admin/workers/${tara._id}/documents/${taraId}`, evaT);
check("cleaner cannot use the admin download → 403", res.status === 403, res.status);
res = await raw(`/admin/workers/${tara._id}/documents/${taraId}?inline=1`, adminT);
check("admin preview inline with sandbox CSP", res.status === 200 && /inline/.test(res.headers.get("content-disposition") ?? "") && /sandbox/.test(res.headers.get("content-security-policy") ?? ""), res.status);
r = await call("GET", "/worker/documents", null, taraT);
check("document listing never contains file bytes", r.status === 200 && !JSON.stringify(r.body).includes("\"data\""), Object.keys(r.body.documents?.[0] ?? {}));

// ---------------------------------------------------------------------------
// 3. Eligibility on the JOB date
// ---------------------------------------------------------------------------
const jSoon = await book(day(5));
const jLate = await book(day(12));
const jLate2 = await book(day(13));
check("bookings created", Boolean(jSoon && jLate && jLate2));
r = await call("GET", "/worker/jobs/open", null, taraT);
const openIds = (r.body.jobs ?? []).map((j) => String(j._id));
check("open jobs: job before permit expiry shown, after expiry hidden", openIds.includes(jSoon) && !openIds.includes(jLate), openIds);
r = await call("POST", `/worker/jobs/${jLate}/accept`, null, taraT);
check("accept job after permit expiry → 409 WORK_PERMIT_EXPIRES_BEFORE_JOB", r.status === 409 && r.body.code === "WORK_PERMIT_EXPIRES_BEFORE_JOB", r.body);
const eligibleLate = await findEligibleWorkers(await Booking.findById(jLate));
check("dispatch does not offer the late job to Tara (but to Eva)", !eligibleLate.some((w) => String(w._id) === String(tara._id)) && eligibleLate.some((w) => String(w._id) === String(eva._id)));
r = await call("PATCH", `/admin/bookings/${jLate}/assign`, { workerId: String(tara._id) }, adminT);
check("admin cannot assign Tara to a job after her permit expiry → 409", r.status === 409 && r.body.code === "WORK_PERMIT_EXPIRES_BEFORE_JOB", r.body);
r = await call("POST", `/worker/jobs/${jSoon}/accept`, null, taraT);
check("Tara accepts the job before expiry", r.status === 200, r.body);
r = await call("POST", `/worker/jobs/${jLate}/accept`, null, evaT);
check("Eva (EU, ID only) accepts the late job", r.status === 200, r.body);

// ---------------------------------------------------------------------------
// 4. Reminders (30 / 7 days) + expiry: no new jobs, admin flagged
// ---------------------------------------------------------------------------
const mails = (template, to) => EmailMessage.countDocuments({ template, ...(to && { to }) });
let out = await processDocumentExpiries();
check("30-day reminder sent once to the cleaner", out.reminders === 1 && (await mails("documentExpiryReminder", "tara@t.local")) === 1, out);
out = await processDocumentExpiries();
check("no duplicate reminder on the next run", out.reminders === 0 && (await mails("documentExpiryReminder", "tara@t.local")) === 1, out);
await call("PATCH", `/admin/workers/${tara._id}/documents/${taraPermit}`, { status: "verified", expiresAt: day(6) }, adminT);
out = await processDocumentExpiries();
check("7-day reminder after the expiry date moved closer", out.reminders === 1 && (await mails("documentExpiryReminder", "tara@t.local")) === 2, out);
const job = findJob("documentExpiryWatch");
check("documentExpiryWatch registered in the worker job registry (lock-guarded scheduler)", Boolean(job) && job.everyMs > 0);

// Tara now has jSoon on day 5 (still OK with expiry day 6). Give her a job beyond expiry
// directly (legacy assignment) and then let the permit expire.
await Booking.updateOne({ _id: jLate2 }, { $set: { assignedWorker: tara._id, assignedAt: new Date() } });
await User.updateOne({ _id: tara._id, "documents._id": taraPermit }, { $set: { "documents.$.expiresAt": new Date(todayInBerlin().getTime() - DAY_MS) } });
const adminMailsBefore = await mails("adminNotification");
out = await processDocumentExpiries();
const expiryMail = await EmailMessage.findOne({ template: "adminNotification", subject: /Dokument abgelaufen/ }).sort({ createdAt: -1 });
check("on expiry the admin is emailed with jobs to reassign", out.expired === 1 && (await mails("adminNotification")) === adminMailsBefore + 1 && expiryMail?.text.includes((await Booking.findById(jLate2)).reference), expiryMail?.text);
out = await processDocumentExpiries();
check("expiry alert only once", out.expired === 0, out);
r = await call("GET", "/admin/documents/queue", null, adminT);
check("admin queue flags future jobs beyond expiry", r.body.flagged?.some((f) => String(f.worker.id) === String(tara._id) && f.jobs.some((j) => String(j.id) === jLate2) && f.jobs.some((j) => String(j.id) === jSoon)), r.body.flagged);
r = await call("GET", "/worker/jobs/open", null, taraT);
check("expired permit → no open jobs, eligibility code returned", r.body.count === 0 && r.body.eligibility?.code === "DOCUMENTS_EXPIRED", r.body);
const jNew = await book(day(3), "13:00");
r = await call("POST", `/worker/jobs/${jNew}/accept`, null, taraT);
check("accept with expired permit → 409 DOCUMENTS_EXPIRED", r.status === 409 && r.body.code === "DOCUMENTS_EXPIRED", r.body);
r = await call("GET", "/worker/documents", null, taraT);
check("checklist shows permit expired", r.body.checklist.find((c) => c.kind === "permit")?.status === "expired" && r.body.eligibility.code === "DOCUMENTS_EXPIRED", r.body.checklist);
check("expiry + reminders audited", (await AuditLog.countDocuments({ entityId: tara._id, action: { $in: ["worker.document.expired", "worker.document.expiry_reminder"] } })) === 3);

// ---------------------------------------------------------------------------
// 5. Account deletion: customer
// ---------------------------------------------------------------------------
r = await call("GET", "/users/me/deletion-check", null, karlT);
check("deletion check: customer with upcoming bookings is blocked, confirm with password", r.body.canDelete === false && r.body.blockedBy === "OPEN_BOOKINGS" && r.body.confirmWith === "password" && r.body.openBookings.length >= 3, r.body);
r = await call("DELETE", "/users/me", { password: "Password12345" }, karlT);
check("delete with upcoming bookings → 409 OPEN_BOOKINGS + list", r.status === 409 && r.body.code === "OPEN_BOOKINGS" && r.body.bookings.length >= 3, r.body);
check("blocked attempt audited", (await AuditLog.countDocuments({ entityId: karlId, action: "account.delete.blocked" })) === 1);
// Second customer without bookings deletes right away
r = await call("POST", "/auth/register", { name: "Kunde Lena", email: "lena@t.local", password: "Password12345" });
const lenaT = r.body.token;
const lenaId = r.body.user.id;
r = await call("DELETE", "/users/me", { password: "wrong-password" }, lenaT);
check("wrong password → 400", r.status === 400, r.body);
r = await call("DELETE", "/users/me", { password: "Password12345" }, lenaT);
const lena = await User.findById(lenaId);
check("customer deletes account → anonymised + inactive", r.status === 200 && lena.isActive === false && lena.anonymisedAt && lena.email.endsWith("@anonymised.invalid"), r.body);
r = await call("GET", "/users/me", null, lenaT);
check("old session no longer works", r.status === 401, r.status);
check("self-delete audited", (await AuditLog.countDocuments({ entityId: lenaId, action: "account.deleted.self" })) === 1);

// ---------------------------------------------------------------------------
// 6. Account deletion: social-login (OAuth-only) user
// ---------------------------------------------------------------------------
const gUser = await User.create({ name: "Gina Google", email: "gina@t.local", role: "consumer", emailVerified: true, oauth: { googleSub: "g-123", googleLinkedAt: new Date() } });
const { default: generateToken } = await import(ROOT + "/src/utils/generate-token.js");
const ginaT = generateToken(gUser);
r = await call("GET", "/users/me/deletion-check", null, ginaT);
check("OAuth-only user confirms with email", r.status === 200 && r.body.confirmWith === "email" && r.body.canDelete === true, r.body);
r = await call("DELETE", "/users/me", { confirmEmail: "wrong@t.local" }, ginaT);
check("wrong confirmation email → 400 CONFIRM_EMAIL_REQUIRED", r.status === 400 && r.body.code === "CONFIRM_EMAIL_REQUIRED", r.body);
r = await call("DELETE", "/users/me", { confirmEmail: "GINA@t.local" }, ginaT);
const gina = await User.findById(gUser._id);
check("OAuth user deleted; Google login unlinked", r.status === 200 && !gina.oauth?.googleSub && gina.isActive === false, gina?.oauth);

// ---------------------------------------------------------------------------
// 7. Account deletion: cleaner (upcoming jobs, unpaid earnings retained)
// ---------------------------------------------------------------------------
r = await call("POST", "/worker/documents", { kind: "id", idType: "national_id", name: "Dora-ID.pdf", dataUrl: pdf() }, doraT);
const doraDoc = r.body.document?.id;
await call("PATCH", `/admin/workers/${dora._id}/documents/${doraDoc}`, { status: "verified", expiresAt: day(500) }, adminT);
const jDora = await book(day(4), "13:00");
r = await call("POST", `/worker/jobs/${jDora}/accept`, null, doraT);
check("Dora accepts a job", r.status === 200, r.body);
r = await call("DELETE", "/users/me", { password: "Password12345" }, doraT);
check("cleaner with upcoming job → 409 OPEN_JOBS", r.status === 409 && r.body.code === "OPEN_JOBS" && r.body.bookings.some((b) => String(b.id) === jDora), r.body);
r = await call("POST", `/worker/jobs/${jDora}/release`, { reason: "Ich höre auf" }, doraT);
check("cleaner releases the job", r.status === 200, r.body);
// A completed earlier job with pending (unpaid) earnings – mocked directly
const pastJob = await Booking.findById(jSoon).lean();
const { _id: _ignored, reference: _r, ...rest } = pastJob;
const earned = await Booking.create({
  ...rest, reference: "FX-TEST-PAST1", assignedWorker: dora._id, status: "completed", preferredDate: new Date(todayInBerlin().getTime() - 10 * DAY_MS),
  workerPayout: { amountCents: 4200, status: "pending", earnedAt: new Date(), dueAt: new Date(Date.now() - DAY_MS) },
});
r = await call("GET", "/users/me/deletion-check", null, doraT);
check("deletion check shows unpaid earnings", r.body.canDelete === true && r.body.unpaidEarnings?.cents === 4200, r.body);
r = await call("DELETE", "/users/me", { password: "Password12345" }, doraT);
let doraNow = await User.findById(dora._id).select("+documents.data");
check("cleaner deleted: payout details retained while earnings unpaid", r.status === 200 && r.body.payoutDetailsRetained === true && doraNow.payoutRetainedUntilSettled === true && doraNow.bankAccountLast4 === "1234" && doraNow.isActive === false && doraNow.workerStatus === "suspended", r.body);
check("cleaner's document files erased, metadata kept", doraNow.documents.length === 1 && !doraNow.documents[0].data && doraNow.documents[0].purgedAt && doraNow.documents[0].status === "verified");
check("cleaner deletion audited with retention info", (await AuditLog.countDocuments({ entityId: dora._id, action: "account.deleted.self", "after.payoutDetailsRetained": true })) === 1);
check("job record kept for accounting", Boolean(await Booking.findById(earned._id)));
const payout = await settleWorker({ workerId: dora._id, includeNotYetDue: true, method: "bank" });
check("payout still settles after deletion (bank)", payout?.status === "paid" && payout.amountCents === 4200, payout?.status);
check("payout record retained", (await Payout.countDocuments({ worker: dora._id })) === 1);
const purged = await purgeSettledPayoutDetails();
doraNow = await User.findById(dora._id);
check("bank details purged once settled", purged === 1 && doraNow.bankAccountLast4 === "" && doraNow.payoutRetainedUntilSettled === false, doraNow.bankAccountLast4);
check("payout record still there after purge", (await Payout.countDocuments({ worker: dora._id })) === 1);
r = await call("GET", "/users/me/export", null, evaT);
check("data export available for cleaners", r.status === 200 && r.body.profile?.email === "eva@t.local", r.status);

const { failures, passes } = summary();
console.log(`\n${failures === 0 ? `ALL PASSED (${passes})` : `${failures} FAILED (${passes} passed)`}`);
await User.db.dropDatabase();
server.close();
process.exit(failures ? 1 : 0);
