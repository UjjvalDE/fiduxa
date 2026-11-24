// E2E: "Become a cleaner" applications (validation, honeypot, CV file checks,
// duplicates, admin review, CV download, invite → worker account, GDPR purge)
// and the public homepage trust endpoint (rating, reviews, cleaner share).
import { ROOT, prepareEnv, createChecker, apiClient } from "../helpers/harness.mjs";
import { Types } from "mongoose";

prepareEnv("fiduxa_e2e_applications");
process.env.DISABLE_RATE_LIMIT = "1";
process.env.EMAIL_TRANSPORT = "json";
process.env.WORKER_INVITATION_URL = "http://localhost:3000/einladung";

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");
const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Review } = await import(ROOT + "/src/models/review.model.js");
const { default: WorkerApplication } = await import(ROOT + "/src/models/worker-application.model.js");
const { purgeOldApplications } = await import(ROOT + "/src/controllers/worker-application.controller.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
await loadSettings();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const adminT = (await call("POST", "/auth/login", { email: "admin@t.local", password: "Password12345" })).body.token;
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;
const klara = await User.findOne({ email: "klara@t.local" });

const pdf = (bytes = 2000) => `data:application/pdf;base64,${Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(bytes, 65)]).toString("base64")}`;
const valid = {
  name: "Marta Kowalska", email: "marta@t.local", phone: "+49 30 23125900", postcode: "10115", languages: ["de", "pl"],
  permit: "eu", hoursPerWeek: "15-30", experience: "gt2", experiencePlaces: ["homes", "hotels"], vehicle: "bicycle",
  source: "friends", message: "Ich arbeite gern gründlich.", locale: "de", privacyAccepted: true,
};

// ---------- submission ----------
r = await call("POST", "/jobs/applications", { ...valid, cv: { name: "Lebenslauf Marta.pdf", dataUrl: pdf() } });
check("valid application with PDF CV → 201", r.status === 201 && r.body.id, r.body);
const appId = r.body.id;
r = await call("POST", "/jobs/applications", { ...valid });
check("duplicate within 30 days → 409 (friendly)", r.status === 409, r.status);
r = await call("POST", "/jobs/applications", { ...valid, email: "x1@t.local", privacyAccepted: false });
check("privacy consent required → 422", r.status === 422, r.status);
r = await call("POST", "/jobs/applications", { ...valid, email: "x2@t.local", permit: "martian" });
check("unknown permit type → 422", r.status === 422, r.status);
r = await call("POST", "/jobs/applications", { ...valid, email: "x3@t.local", cv: { name: "virus.pdf", dataUrl: `data:application/pdf;base64,${Buffer.from("MZ fake exe").toString("base64")}` } });
check("file that is not really a PDF/Word/image → 422", r.status === 422, r.status);
r = await call("POST", "/jobs/applications", { ...valid, email: "x4@t.local", cv: { name: "big.pdf", dataUrl: pdf(5 * 1024 * 1024 + 10) } });
check("CV over 5 MB → rejected", r.status === 422 || r.status === 413, r.status);
r = await call("POST", "/jobs/applications", { ...valid, email: "bot@t.local", website: "http://spam" });
const botStored = await WorkerApplication.countDocuments({ email: "bot@t.local" });
check("honeypot: bot gets 201 but nothing is stored", r.status === 201 && botStored === 0, botStored);
await call("POST", "/jobs/applications", { ...valid, email: "ohne-cv@t.local", name: "Ohne Lebenslauf" });

// ---------- admin ----------
r = await call("GET", "/admin/applications", null, adminT);
check("admin list with status counts", r.status === 200 && r.body.applications.length === 2 && r.body.counts.new === 2, r.body.counts);
r = await call("GET", `/admin/applications/${appId}`, null, adminT);
check("detail: answers + CV meta, no CV bytes in JSON", r.status === 200 && r.body.application.permit === "eu" && r.body.application.cv?.size > 0 && !r.body.application.cv.data, r.body.application?.cv);
let res = await fetch(`${base}/admin/applications/${appId}/cv`, { headers: { Authorization: `Bearer ${adminT}` } });
const cvBytes = Buffer.from(await res.arrayBuffer());
check("CV download: attachment, nosniff, real PDF bytes",
  res.status === 200 && /attachment/.test(res.headers.get("content-disposition") ?? "") && res.headers.get("x-content-type-options") === "nosniff" && cvBytes.subarray(0, 4).toString() === "%PDF",
  res.status);
r = await call("PATCH", `/admin/applications/${appId}`, { status: "contacted", adminNote: "Telefoniert, sehr motiviert" }, adminT);
check("admin marks as contacted with note", r.status === 200 && r.body.application.status === "contacted", r.status);
r = await call("POST", `/admin/applications/${appId}/invite`, null, adminT);
const worker = await User.findOne({ email: "marta@t.local" }).lean();
check("invite creates an invited worker account (languages carried over)",
  r.status === 201 && worker?.role === "worker" && worker.workerStatus === "invited" && worker.workerProfile.languages.includes("pl"), worker?.workerStatus);
r = await call("POST", `/admin/applications/${appId}/invite`, null, adminT);
check("second invite → 409", r.status === 409, r.status);
r = await call("GET", "/admin/applications", null, custT);
check("customer cannot read applications → 403", r.status === 403, r.status);
res = await fetch(`${base}/admin/applications/${appId}/cv`);
check("CV download without login → 401", res.status === 401, res.status);

// ---------- GDPR purge ----------
await WorkerApplication.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 200 * 86400e3) } }); // createdAt is immutable in Mongoose
const purge = await purgeOldApplications();
const left = await WorkerApplication.find({}).select("+cv.data status").lean();
check("GDPR purge: old applications deleted, invited one kept without CV",
  purge.removed === 1 && left.length === 1 && left[0].status === "invited" && !left[0].cv?.data, { purge, left: left.length });

// ---------- homepage trust ----------
const mkReview = (rating, comment) => ({ booking: new Types.ObjectId(), customer: klara._id, worker: new Types.ObjectId(), rating, comment, hidden: false, createdAt: new Date(), updatedAt: new Date() });
await Review.collection.insertMany([mkReview(5, "Super gründlich!"), mkReview(4, "Sehr gut."), mkReview(3, "Okay."), mkReview(5, ""), { ...mkReview(1, "versteckt"), hidden: true }]);
r = await call("GET", "/home/trust");
check("trust: average over ALL visible reviews (5,4,3,5 → 4.3), hidden excluded", r.status === 200 && r.body.rating.average === 4.3 && r.body.rating.count === 4, r.body.rating);
check("trust: showcase only ≥ 4 stars with text, author as 'Kunde K.'",
  r.body.reviews.length === 2 && r.body.reviews.every((x) => x.rating >= 4 && x.comment && x.author === "Kunde K."), r.body.reviews);
check("trust: cleaner share follows the live commission ladder (75–90 %)", r.body.cleanerShare?.minPct === 75 && r.body.cleanerShare?.maxPct === 90, r.body.cleanerShare);

server.close();
const { failures } = summary();
console.log(failures ? `${failures} check(s) FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
