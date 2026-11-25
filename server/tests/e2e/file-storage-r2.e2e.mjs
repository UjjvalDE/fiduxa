// E2E: file bytes in object storage (R2) instead of MongoDB – exercised with
// the in-memory fake bucket (STORAGE_DRIVER=memory, never the real R2).
// Cleaner documents, CVs, complaint photos, avatars, invoice PDFs and outbox
// attachments: Mongo keeps key + sha256 + size only, downloads stream through
// the authenticated API with unchanged permissions, deletions remove the
// objects (failures queued and retried), legacy inline records still work.
import { ROOT, prepareEnv, createChecker, apiClient, ALWAYS_AVAILABLE, BERLIN_WIDE } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_file_storage");
process.env.STORAGE_DRIVER = "memory";
process.env.EMAIL_TRANSPORT = "json";
process.env.DISABLE_RATE_LIMIT = "1";

const { createRequire } = await import("node:module");
const { createHash } = await import("node:crypto");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: Complaint } = await import(ROOT + "/src/models/complaint.model.js");
const { default: WorkerApplication } = await import(ROOT + "/src/models/worker-application.model.js");
const { default: EmailMessage } = await import(ROOT + "/src/models/email.model.js");
const { default: PendingDelete } = await import(ROOT + "/src/models/pending-delete.model.js");
const { memoryBucket } = await import(ROOT + "/src/services/storage.service.js");
const { processPendingDeletes } = await import(ROOT + "/src/services/file-store.service.js");
const { deliverEmail } = await import(ROOT + "/src/services/email.service.js");
const { anonymiseUser } = await import(ROOT + "/src/services/account-privacy.service.js");
const { purgeOldApplications } = await import(ROOT + "/src/controllers/worker-application.controller.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
await (await import(ROOT + "/src/models/settings.model.js")).default.updateOne(
  { key: "platform" },
  { $set: { "policies.cash.minTier": "new", "policies.paymentMethods.enabled": ["paypal", "stripe", "cash"] } },
  { upsert: true }
);
await loadSettings();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);
const raw = (p, token) => fetch(base + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const sha = (b) => createHash("sha256").update(b).digest("hex");

const pdfBuf = (fill = 65, n = 1500) => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(n, fill)]);
const dataUrl = (type, buf) => `data:${type};base64,${buf.toString("base64")}`;
const pngBuf = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
const jpgBuf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 3)]);

const pw = await bcrypt.hash("Password12345", 10);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const mkWorker = (name, email) =>
  User.create({
    name, email, password: pw, role: "worker", availability: ALWAYS_AVAILABLE, workerStatus: "approved", emailVerified: true,
    workerProfile: { ...BERLIN_WIDE, address: "Invalidenstr. 5, 10115 Berlin", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: name,
  });
const anna = await mkWorker("Anna Nowak", "anna@t.local");
const ben = await mkWorker("Ben Weber", "ben@t.local");
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
const benT = await login("ben@t.local");
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;
const klaraId = r.body.user?.id ?? r.body.user?._id;
r = await call("POST", "/auth/register", { name: "Fremde Franka", email: "franka@t.local", password: "Password12345" });
const otherT = r.body.token;

// ---------------------------------------------------------------------------
// 1. Cleaner documents
// ---------------------------------------------------------------------------
const idPdf = pdfBuf(66);
r = await call("POST", "/worker/documents", { kind: "id", name: "Ausweis.pdf", dataUrl: dataUrl("application/pdf", idPdf) }, annaT);
check("1. document upload → 201", r.status === 201, r.body);
const docId = r.body.document?.id;
let u = await User.findById(anna._id).select("+documents.data").lean();
let d = u.documents.find((x) => String(x._id) === String(docId));
check("1a. Mongo keeps key + sha256 + size, NO bytes",
  d?.storageKey === `documents/${anna._id}/${docId}.pdf` && d.sha256 === sha(idPdf) && d.size === idPdf.length && !d.data, d);
check("1b. bytes are in the bucket", memoryBucket.get(d?.storageKey)?.body.equals(idPdf) && memoryBucket.get(d.storageKey).contentType === "application/pdf");
check("1c. no storage key in the API response", r.body.document && !("storageKey" in r.body.document) && !JSON.stringify(r.body).includes("documents/"), r.body.document);

let res = await raw(`/worker/documents/${docId}/file`, annaT);
let bytes = Buffer.from(await res.arrayBuffer());
check("1d. owner downloads own document from storage (attachment, nosniff, no-store)",
  res.status === 200 && bytes.equals(idPdf) && /attachment/.test(res.headers.get("content-disposition") ?? "") && res.headers.get("x-content-type-options") === "nosniff" && res.headers.get("cache-control") === "private, no-store", res.status);
res = await raw(`/admin/workers/${anna._id}/documents/${docId}?inline=1`, adminT);
bytes = Buffer.from(await res.arrayBuffer());
check("1e. admin preview streams from storage (inline, CSP sandbox)", res.status === 200 && bytes.equals(idPdf) && /inline/.test(res.headers.get("content-disposition") ?? "") && /sandbox/.test(res.headers.get("content-security-policy") ?? ""), res.status);
res = await raw(`/worker/documents/${docId}/file`, benT);
check("1f. another cleaner cannot download it → 404", res.status === 404, res.status);
res = await raw(`/admin/workers/${anna._id}/documents/${docId}`, benT);
check("1g. cleaner cannot use the admin route → 403", res.status === 403, res.status);
res = await raw(`/admin/workers/${anna._id}/documents/${docId}`, custT);
check("1h. customer cannot use the admin route → 403", res.status === 403, res.status);
res = await raw(`/worker/documents/${docId}/file`);
check("1i. no token → 401", res.status === 401, res.status);

// Magic-byte validation is unchanged
r = await call("POST", "/worker/documents", { kind: "other", name: "fake.pdf", dataUrl: dataUrl("application/pdf", Buffer.from("MZ not a pdf at all")) }, annaT);
check("1j. fake PDF (wrong magic bytes) → 422, nothing stored", r.status === 422 && memoryBucket.size === 1, { s: r.status, n: memoryBucket.size });
r = await call("POST", "/worker/documents", { kind: "other", name: "big.png", dataUrl: dataUrl("image/png", Buffer.concat([pngBuf, Buffer.alloc(5 * 1024 * 1024)])) }, annaT);
check("1k. > 5 MB → 413/422, nothing stored", [413, 422].includes(r.status) && memoryBucket.size === 1, { s: r.status, n: memoryBucket.size });

// Rejected → re-upload replaces the file AND its object
r = await call("PATCH", `/admin/workers/${anna._id}/documents/${docId}`, { status: "rejected", note: "Unscharf" }, adminT);
check("1l. admin rejects document", r.status === 200, r.body);
const oldKey = d.storageKey;
r = await call("POST", "/worker/documents", { kind: "id", name: "Ausweis2.pdf", dataUrl: dataUrl("application/pdf", pdfBuf(67)) }, annaT);
u = await User.findById(anna._id).lean();
check("1m. re-upload after rejection deletes the old object", r.status === 201 && !memoryBucket.has(oldKey) && u.documents.length === 1 && memoryBucket.has(u.documents[0].storageKey), { s: r.status, n: u.documents.length });

// Pending document deleted by the cleaner → object deleted
r = await call("POST", "/worker/documents", { kind: "other", name: "Foto.jpg", dataUrl: dataUrl("image/jpeg", jpgBuf) }, annaT);
const otherDoc = r.body.document?.id;
const otherKey = `documents/${anna._id}/${otherDoc}.jpg`;
check("1n. JPG document stored under documents/<user>/<doc>.jpg", r.status === 201 && memoryBucket.has(otherKey), r.status);
r = await call("DELETE", `/worker/documents/${otherDoc}`, null, annaT);
check("1o. deleting a pending document deletes the object", r.status === 200 && !memoryBucket.has(otherKey), r.status);

// Failed delete → queued in PendingDelete → retried by the housekeeping job
r = await call("POST", "/worker/documents", { kind: "other", name: "Noch.png", dataUrl: dataUrl("image/png", pngBuf) }, annaT);
const failDoc = r.body.document?.id;
const failKey = `documents/${anna._id}/${failDoc}.png`;
process.env.STORAGE_FAIL_DELETES = "1";
r = await call("DELETE", `/worker/documents/${failDoc}`, null, annaT);
const pending = await PendingDelete.findOne({ key: failKey }).lean();
check("1p. delete failure does not break the request, key is queued", r.status === 200 && memoryBucket.has(failKey) && pending?.attempts === 1, { s: r.status, pending });
delete process.env.STORAGE_FAIL_DELETES;
await PendingDelete.updateOne({ key: failKey }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
const retried = await processPendingDeletes();
check("1q. retry job deletes the object and clears the queue", retried.deleted === 1 && !memoryBucket.has(failKey) && (await PendingDelete.countDocuments()) === 0, retried);

// Legacy record: inline bytes, no key → still served from Mongo
const legacyBytes = pdfBuf(70);
await User.updateOne({ _id: ben._id }, { $push: { documents: { kind: "other", name: "alt.pdf", type: "application/pdf", size: legacyBytes.length, data: legacyBytes, status: "pending" } } });
const legacyId = (await User.findById(ben._id).lean()).documents[0]._id;
res = await raw(`/admin/workers/${ben._id}/documents/${legacyId}`, adminT);
bytes = Buffer.from(await res.arrayBuffer());
check("1r. legacy inline document (no storageKey) still downloads", res.status === 200 && bytes.equals(legacyBytes), res.status);

// Missing object → 404 (not a crash)
const lost = (await User.findById(anna._id).lean()).documents[0];
const lostBody = memoryBucket.get(lost.storageKey);
memoryBucket.delete(lost.storageKey);
res = await raw(`/admin/workers/${anna._id}/documents/${lost._id}`, adminT);
check("1s. object missing in storage → 404 JSON", res.status === 404 && /json/.test(res.headers.get("content-type") ?? ""), res.status);
memoryBucket.set(lost.storageKey, lostBody);

// ---------------------------------------------------------------------------
// 2. Avatar
// ---------------------------------------------------------------------------
r = await call("PUT", "/worker/avatar", { image: dataUrl("image/png", pngBuf) }, annaT);
u = await User.findById(anna._id).select("+avatarData").lean();
check("2. avatar stored in the bucket, not in Mongo", r.status === 200 && /^avatars\//.test(u.avatarKey) && !u.avatarData && memoryBucket.has(u.avatarKey), { s: r.status, k: u.avatarKey });
res = await raw(`/cleaners/${anna._id}/avatar`);
bytes = Buffer.from(await res.arrayBuffer());
check("2a. public avatar route streams it", res.status === 200 && bytes.equals(pngBuf) && res.headers.get("content-type") === "image/png", res.status);
const firstAvatar = u.avatarKey;
await new Promise((ok) => setTimeout(ok, 5));
r = await call("PUT", "/worker/avatar", { image: dataUrl("image/jpeg", jpgBuf) }, annaT);
u = await User.findById(anna._id).lean();
check("2b. new avatar replaces the old object", r.status === 200 && u.avatarKey !== firstAvatar && !memoryBucket.has(firstAvatar) && memoryBucket.has(u.avatarKey), u.avatarKey);

// ---------------------------------------------------------------------------
// 3. Cleaner application CV
// ---------------------------------------------------------------------------
const valid = {
  name: "Marta Kowalska", email: "marta@t.local", phone: "+49 30 23125900", postcode: "10115", languages: ["de", "pl"],
  permit: "eu", hoursPerWeek: "15-30", experience: "gt2", experiencePlaces: ["homes"], vehicle: "bicycle",
  source: "friends", message: "", locale: "de", privacyAccepted: true,
};
const cvPdf = pdfBuf(71, 2500);
r = await call("POST", "/jobs/applications", { ...valid, cv: { name: "Lebenslauf.pdf", dataUrl: dataUrl("application/pdf", cvPdf) } });
const appId = r.body.id;
let a = await WorkerApplication.findById(appId).select("+cv.data").lean();
check("3. CV stored under applications/<id>/cv.pdf, no bytes in Mongo",
  r.status === 201 && a.cv.storageKey === `applications/${appId}/cv.pdf` && !a.cv.data && a.cv.sha256 === sha(cvPdf) && memoryBucket.has(a.cv.storageKey), a?.cv);
res = await raw(`/admin/applications/${appId}/cv`, adminT);
bytes = Buffer.from(await res.arrayBuffer());
check("3a. admin downloads the CV from storage", res.status === 200 && bytes.equals(cvPdf) && /attachment/.test(res.headers.get("content-disposition") ?? ""), res.status);
res = await raw(`/admin/applications/${appId}/cv`, custT);
check("3b. customer cannot download the CV → 403", res.status === 403, res.status);
r = await call("GET", `/admin/applications/${appId}`, null, adminT);
check("3c. application detail does not expose the key", r.status === 200 && !JSON.stringify(r.body).includes("applications/"), r.body.application?.cv);
await WorkerApplication.collection.updateOne({ _id: WorkerApplication.castObject({ _id: appId })._id }, { $set: { createdAt: new Date(Date.now() - 200 * DAY_MS) } });
const purge = await purgeOldApplications();
check("3d. 6-month retention deletes the record AND the CV object", purge.removed === 1 && purge.filesDeleted === 1 && !memoryBucket.has(`applications/${appId}/cv.pdf`), purge);

// ---------------------------------------------------------------------------
// 4. Invoice PDF (cash booking) + outbox attachment
// ---------------------------------------------------------------------------
await call("POST", "/admin/slots", { from: day(0), to: day(30), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 5 }, adminT);
const slots = (await call("GET", `/bookings/availability?date=${day(2)}&duration=120`)).body.data;
r = await call("POST", "/bookings", {
  serviceId: "home-cleaning", areaM2: 60, name: "Kunde Klara", email: "klara@t.local", phone: "030123456",
  postcode: "10115", address: "Invalidenstr. 5", preferredDate: day(2), slotId: slots[0].windowId, startTime: slots[0].startTime,
  earlyStartConsent: true, paymentMethod: "cash",
}, custT);
const b1 = r.body.booking?.id;
await call("PATCH", `/admin/bookings/${b1}/assign`, { workerId: String(anna._id) }, adminT);
await Booking.updateOne({ _id: b1 }, { preferredDate: todayInBerlin() });
await call("POST", `/worker/jobs/${b1}/start`, null, annaT);
r = await call("POST", `/worker/jobs/${b1}/complete`, { note: "ok", cashCollectedCents: r.body.booking?.pricing?.totalCents ?? 5000 }, annaT);
let bk = await Booking.findById(b1).select("+invoice.pdf").lean();
const invKey = `invoices/${new Date().getFullYear()}/${bk?.invoice?.number}.pdf`;
check("4. invoice PDF in storage (invoices/<year>/<number>.pdf), not in Mongo",
  Boolean(bk?.invoice?.number) && bk.invoice.storageKey === invKey && !bk.invoice.pdf && memoryBucket.get(invKey)?.body.subarray(0, 4).toString() === "%PDF" && bk.invoice.size > 1000, bk?.invoice);
const mail = await EmailMessage.findOne({ template: "invoice", to: "klara@t.local" }).lean();
check("4a. outbox attachment references the key (no PDF copy in Mongo)", mail?.attachments?.[0]?.storageKey === invKey && !mail.attachments[0].content, mail?.attachments);
await EmailMessage.updateOne({ _id: mail._id }, { $set: { status: "queued", nextAttemptAt: new Date(Date.now() - 1000) } });
const delivered = await deliverEmail(mail);
check("4b. outbox delivers the mail with the attachment fetched from storage", delivered === "sent", delivered);
res = await raw(`/customer/bookings/${b1}/invoice`, custT);
bytes = Buffer.from(await res.arrayBuffer());
check("4c. customer downloads own invoice from storage", res.status === 200 && bytes.equals(memoryBucket.get(invKey).body) && res.headers.get("content-type") === "application/pdf", res.status);
res = await raw(`/customer/bookings/${b1}/invoice`, otherT);
check("4d. other customer → 404", res.status === 404, res.status);
res = await raw(`/admin/bookings/${b1}/invoice`, adminT);
check("4e. admin downloads the invoice", res.status === 200, res.status);
memoryBucket.delete(invKey);
res = await raw(`/admin/bookings/${b1}/invoice`, adminT);
bytes = Buffer.from(await res.arrayBuffer());
check("4f. object missing → re-rendered from stored figures and saved again", res.status === 200 && bytes.subarray(0, 4).toString() === "%PDF" && memoryBucket.has(invKey), res.status);
// Legacy inline invoice → served from Mongo
const legacyPdf = memoryBucket.get(invKey).body;
await Booking.updateOne({ _id: b1 }, { $set: { "invoice.pdf": legacyPdf }, $unset: { "invoice.storageKey": "" } });
memoryBucket.delete(invKey);
res = await raw(`/customer/bookings/${b1}/invoice`, custT);
bytes = Buffer.from(await res.arrayBuffer());
check("4g. legacy inline invoice PDF still downloads", res.status === 200 && bytes.equals(legacyPdf), res.status);

// ---------------------------------------------------------------------------
// 5. Complaint photos + erasure on account deletion
// ---------------------------------------------------------------------------
r = await call("POST", `/customer/bookings/${b1}/complaints`, { category: "quality", description: "Das Bad wurde nicht gereinigt.", photos: [{ name: "bad.png", dataUrl: dataUrl("image/png", pngBuf) }, { name: "k.jpg", dataUrl: dataUrl("image/jpeg", jpgBuf) }] }, custT);
const cId = r.body.complaint?._id;
let c = await Complaint.findById(cId).select("+photos.data").lean();
check("5. complaint photos stored as complaints/<id>/<n>.<ext>, no bytes in Mongo",
  r.status === 201 && c.photos.length === 2 && c.photos[0].storageKey === `complaints/${cId}/1.png` && c.photos[1].storageKey === `complaints/${cId}/2.jpg` && !c.photos[0].data && memoryBucket.has(c.photos[1].storageKey), { s: r.status, p: c?.photos });
res = await raw(`/admin/complaints/${cId}/photos/${c.photos[0]._id}?inline=1`, adminT);
bytes = Buffer.from(await res.arrayBuffer());
check("5a. admin views the photo (streamed)", res.status === 200 && bytes.equals(pngBuf) && res.headers.get("content-type") === "image/png", res.status);
res = await raw(`/admin/complaints/${cId}/photos/${c.photos[0]._id}`, annaT);
check("5b. cleaner cannot view complaint photos → 403", res.status === 403, res.status);
res = await raw(`/admin/complaints/${cId}/photos/${c.photos[0]._id}`, custT);
check("5c. customer cannot use the admin photo route → 403", res.status === 403, res.status);
r = await call("POST", `/customer/bookings/${b1}/complaints`, { category: "quality", description: "Noch eine Beschwerde hier.", photos: [{ name: "x.png", dataUrl: "data:image/png;base64,JVBERi0=" }] }, custT);
check("5d. photo with wrong magic bytes → 409/422 (no object)", [409, 422].includes(r.status), r.status);

const klara = await User.findById(klaraId);
const photoKeys = c.photos.map((p) => p.storageKey);
await anonymiseUser(klara, { self: true });
c = await Complaint.findById(cId).lean();
check("5e. customer deletion erases the complaint photos in storage", c.photos.length === 0 && photoKeys.every((k) => !memoryBucket.has(k)), { p: c.photos.length, left: photoKeys.filter((k) => memoryBucket.has(k)) });
bk = await Booking.findById(b1).lean();
check("5f. invoice is retained (§ 147 AO) – record keeps its number", Boolean(bk.invoice?.number), bk.invoice);

// ---------------------------------------------------------------------------
// 6. Cleaner account deletion → documents + avatar deleted from storage
// ---------------------------------------------------------------------------
u = await User.findById(anna._id).lean();
const annaKeys = [...u.documents.map((x) => x.storageKey), u.avatarKey].filter(Boolean);
check("6. fixture: Anna has stored files", annaKeys.length >= 2 && annaKeys.every((k) => memoryBucket.has(k)), annaKeys);
const result = await anonymiseUser(await User.findById(anna._id), { self: true });
u = await User.findById(anna._id).select("+documents.data").lean();
check("6a. cleaner deletion removes documents + avatar objects; metadata kept without key",
  annaKeys.every((k) => !memoryBucket.has(k)) && u.documents.every((x) => !x.storageKey && !x.data && x.purgedAt) && !u.avatarKey && result.filesDeleted === annaKeys.length, { result, left: annaKeys.filter((k) => memoryBucket.has(k)) });

// ---------------------------------------------------------------------------
// 7. Fallback: storage not configured → bytes stay in MongoDB as before
// ---------------------------------------------------------------------------
delete process.env.STORAGE_DRIVER;
const before = memoryBucket.size;
const fbPdf = pdfBuf(72);
r = await call("POST", "/worker/documents", { kind: "other", name: "ohne-r2.pdf", dataUrl: dataUrl("application/pdf", fbPdf) }, benT);
u = await User.findById(ben._id).select("+documents.data").lean();
d = u.documents.find((x) => String(x._id) === String(r.body.document?.id));
check("7. without storage: bytes inline in Mongo, no key", r.status === 201 && d?.data && !d.storageKey && memoryBucket.size === before, d && { k: d.storageKey, s: d.size });
res = await raw(`/admin/workers/${ben._id}/documents/${d?._id}`, adminT);
bytes = Buffer.from(await res.arrayBuffer());
check("7a. inline fallback document downloads", res.status === 200 && bytes.equals(fbPdf), res.status);
process.env.STORAGE_DRIVER = "memory";

server.close();
const { failures } = summary();
console.log(failures ? `${failures} check(s) FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
