// E2E (package E): cleaner documents + verification gate, reliability strikes
// (late hand-back, admin no-show, automatic pause, unpause), distance-aware
// open jobs, sliding sessions (admin 24 h absolute) and admin 2FA (TOTP).
import { ROOT, apiClient, createChecker, prepareEnv } from "../helpers/harness.mjs";
prepareEnv("fiduxa_e2e_trust");
process.env.EMAIL_TRANSPORT = "json";
process.env.DISABLE_RATE_LIMIT = "1";

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { generateSync } = require("otplib");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { findEligibleWorkers } = await import(ROOT + "/src/services/job-dispatch.service.js");
const { trustScore } = await import(ROOT + "/src/services/commission.service.js");
const { distanceKm, postcodeFromAddress } = await import(ROOT + "/src/data/berlin-postcodes.js");
const { SECURITY } = await import(ROOT + "/src/config/pricing.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
await loadSettings();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);
const pdf = (bytes = 2000) => `data:application/pdf;base64,${Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(bytes, 65)]).toString("base64")}`;
const png = () => `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 1)]).toString("base64")}`;
const decode = (token) => jwt.decode(token);

const pw = await bcrypt.hash("Password12345", 12);
const admin = await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const anna = await User.create({
  name: "Anna Nowak", email: "anna@t.local", password: pw, role: "worker", workerStatus: "pending_review", emailVerified: true,
  workerProfile: { address: "Invalidenstr. 5, 10115 Berlin", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: "Anna",
});
const ben = await User.create({
  name: "Ben Weber", email: "ben@t.local", password: pw, role: "worker", workerStatus: "approved", emailVerified: true,
  workerProfile: { address: "Teltower Damm 1, 14163 Berlin", serviceAreas: ["Zehlendorf"], petsOk: true }, bankAccountLast4: "4321", bankAccountHolder: "Ben",
});
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body;
let adminT = (await login("admin@t.local")).token;
const annaT = (await login("anna@t.local")).token;
const benT = (await login("ben@t.local")).token;
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;
const klaraId = r.body.user.id;

// ---------------------------------------------------------------------------
// 1. Documents + verification gate
// ---------------------------------------------------------------------------
r = await call("POST", "/worker/documents", { kind: "id", name: "Ausweis.pdf", dataUrl: pdf() }, annaT);
check("document upload (PDF) → 201 pending", r.status === 201 && r.body.document?.status === "pending" && r.body.missing?.includes("permit"), r.body);
const idDocId = r.body.document?.id;
r = await call("POST", "/worker/documents", { kind: "permit", name: "virus.pdf", dataUrl: `data:application/pdf;base64,${Buffer.from("MZ fake exe").toString("base64")}` }, annaT);
check("fake file (wrong magic bytes) → 422", r.status === 422, r.body);
r = await call("GET", "/worker/documents", null, annaT);
check("GET /worker/documents lists the upload, not verified yet", r.body.documents?.length === 1 && r.body.verified === false && !("data" in (r.body.documents[0] ?? {})), r.body);

r = await call("PATCH", `/admin/workers/${anna._id}/review`, { status: "approved", note: "ok" }, adminT);
check("approval refused while required documents are not verified → 409", r.status === 409 && Array.isArray(r.body.missingDocuments), r.body);

r = await call("PATCH", `/admin/workers/${anna._id}/documents/${idDocId}`, { status: "verified" }, adminT);
check("admin verifies the ID document", r.status === 200 && r.body.document?.status === "verified" && r.body.missing?.join() === "permit", r.body);
r = await call("POST", "/worker/documents", { kind: "permit", name: "Aufenthaltstitel.png", dataUrl: png() }, annaT);
const permitDocId = r.body.document?.id;
check("PNG permit upload accepted", r.status === 201 && r.body.document?.type === "image/png", r.body);
const dl = await fetch(`${base}/admin/workers/${anna._id}/documents/${idDocId}`, { headers: { Authorization: `Bearer ${adminT}` } });
const bytes = Buffer.from(await dl.arrayBuffer());
check("admin downloads the document (attachment, nosniff, %PDF)",
  dl.status === 200 && /attachment/.test(dl.headers.get("content-disposition") ?? "") && dl.headers.get("x-content-type-options") === "nosniff" && bytes.subarray(0, 4).toString() === "%PDF", dl.status);
r = await call("DELETE", `/worker/documents/${idDocId}`, null, annaT);
check("verified document cannot be deleted by the cleaner → 409", r.status === 409, r.body);
r = await call("PATCH", `/admin/workers/${anna._id}/documents/${permitDocId}`, { status: "rejected" }, adminT);
check("rejecting without a note → 422", r.status === 422, r.body);
r = await call("PATCH", `/admin/workers/${anna._id}/documents/${permitDocId}`, { status: "verified", note: "gültig bis 2030" }, adminT);
check("permit verified → all required documents verified", r.body.verified === true, r.body);
r = await call("GET", "/worker/me", null, annaT);
check("checklist.documentsVerified true", r.body.checklist?.documentsVerified === true, r.body.checklist);
r = await call("PATCH", `/admin/workers/${anna._id}/review`, { status: "approved", note: "ok" }, adminT);
check("approval allowed once documents are verified", r.status === 200 && r.body.worker?.workerStatus === "approved", r.body);
r = await call("GET", `/admin/workers/${anna._id}/review`, null, adminT);
check("admin review page lists documents + reliability", r.body.worker?.documents?.documents?.length === 2 && r.body.worker.reliability?.rules?.strikeLimit === 3, r.body.worker?.documents);

// ---------------------------------------------------------------------------
// 2. Distance-aware open jobs
// ---------------------------------------------------------------------------
check("distanceKm helper: same postcode 0.5, Mitte→Zehlendorf ≈ 10–15 km, unknown → null",
  distanceKm("10115", "10115") === 0.5 && distanceKm("10115", "14163") > 8 && distanceKm("10115", "14163") < 18 && distanceKm("10115", "99999") === null && postcodeFromAddress("Invalidenstr. 5, 10115 Berlin") === "10115",
  distanceKm("10115", "14163"));
r = await call("POST", "/admin/slots", { from: day(1), to: day(6), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00" }, { startTime: "13:00" }], capacity: 3 }, adminT);
check("slots created", r.body.created === 12, r.body);
const slotsOf = async (d) => (await call("GET", `/bookings/availability?date=${d}`)).body.data;
const book = async (d, startTime, postcode) => {
  const slot = (await slotsOf(d)).find((s) => s.startTime === startTime);
  const res = await call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, extras: [], name: "Kunde Klara", email: "klara@t.local", phone: "030123456", postcode,
    address: "Teststr. 1", preferredDate: d, slotId: slot.id, earlyStartConsent: true,
  }, custT);
  return res.body.booking?.id;
};
const jFar = await book(day(2), "08:00", "14163"); // earlier date, far away
const jNear = await book(day(3), "08:00", "10115"); // later date, next door
const jNoShow = await book(day(4), "13:00", "10405");
r = await call("GET", "/worker/jobs/open", null, annaT);
check("open jobs carry distanceKm and are sorted nearest first (before date)",
  r.body.count === 3 && r.body.jobs[0]._id === jNear && r.body.jobs[0].distanceKm === 0.5 && r.body.jobs.at(-1)._id === jFar && r.body.jobs.every((j) => typeof j.distanceKm === "number"),
  r.body.jobs?.map((j) => [j.postcode, j.distanceKm]));

// ---------------------------------------------------------------------------
// 3. Reliability: late hand-back, no-show, automatic pause, unpause
// ---------------------------------------------------------------------------
r = await call("PUT", "/admin/settings", { reliability: { lateReleaseHours: 100, strikeLimit: 3, strikeWindowDays: 90 } }, adminT);
check("reliability settings saved via slot", r.status === 200 && r.body.settings?.reliability?.lateReleaseHours === 100, r.body.settings?.reliability);
r = await call("POST", `/worker/jobs/${jNear}/accept`, null, annaT);
check("Anna accepts the near job", r.status === 200, r.body);
r = await call("POST", `/worker/jobs/${jNear}/release`, { reason: "Krank" }, annaT);
check("late hand-back (inside lateReleaseHours) → 1 strike", r.status === 200 && r.body.strike?.strikes === 1 && r.body.strike.paused === false, r.body);
r = await call("GET", "/worker/reliability", null, annaT);
check("cleaner sees rules + own strike", r.body.reliability?.activeCount === 1 && r.body.reliability.strikes[0].kind === "late_release" && r.body.reliability.rules.lateReleaseHours === 100, r.body.reliability);

r = await call("POST", `/worker/jobs/${jNoShow}/accept`, null, annaT);
r = await call("POST", `/admin/bookings/${jNoShow}/no-show`, { note: "Kunde wartete vergeblich" }, adminT);
let b = await Booking.findById(jNoShow);
check("admin no-show → 2 strikes, job re-opened (unassigned, offered again)",
  r.status === 200 && r.body.strike?.strikes === 2 && b.assignedWorker === null && b.jobOffer.notifiedAt && !b.jobOffer.unassignedAlertSentAt && b.jobOffer.releasedBy.map(String).includes(String(anna._id)), r.body);
check("3 strikes in 90 days → cleaner paused automatically", r.body.strike?.paused === true && r.body.strike.justPaused === true, r.body.strike);
r = await call("GET", "/worker/jobs/open", null, annaT);
check("paused cleaner sees an empty board", r.body.count === 0 && r.body.paused === true, r.body);
r = await call("GET", "/worker/jobs/open", null, benT);
check("re-opened job is on Ben's board", r.body.jobs?.some((j) => j._id === jNoShow), r.body.jobs?.map((j) => j._id));
const eligible = await findEligibleWorkers(await Booking.findById(jFar));
check("paused cleaner is not notified about new jobs", !eligible.some((w) => String(w._id) === String(anna._id)) && eligible.some((w) => String(w._id) === String(ben._id)), eligible.map((w) => w.name));
r = await call("GET", "/worker/performance", null, annaT);
const base0 = trustScore({ jobsCompleted: 0, verifiedReviews: 0, ratingAvg: null, reliabilityPct: null });
check("trust score: −5 per active strike, never below 0",
  trustScore({ jobsCompleted: 50, verifiedReviews: 35, ratingAvg: 4.7, reliabilityPct: 95 }, { activeStrikes: 3 }) === trustScore({ jobsCompleted: 50, verifiedReviews: 35, ratingAvg: 4.7, reliabilityPct: 95 }) - 15 &&
    trustScore({ jobsCompleted: 0, verifiedReviews: 0, ratingAvg: null, reliabilityPct: null }, { activeStrikes: 3 }) === Math.max(0, base0 - 15) && r.body.reliability?.activeCount === 3,
  r.body.trustScore);
r = await call("GET", `/admin/workers/${anna._id}/review`, null, adminT);
check("admin sees pause state + strikes", Boolean(r.body.worker?.reliability?.pausedAt) && r.body.worker.reliability.activeCount === 3 && r.body.worker.workerStatus === "approved", r.body.worker?.reliability);
r = await call("POST", `/admin/workers/${anna._id}/unpause`, { note: "Gespräch geführt" }, adminT);
check("admin lifts the pause", r.status === 200 && r.body.reliability?.pausedAt === null, r.body);
r = await call("GET", "/worker/jobs/open", null, annaT);
check("unpaused cleaner sees open jobs again", r.body.count >= 1 && !r.body.paused, r.body);
r = await call("POST", `/admin/workers/${anna._id}/unpause`, {}, adminT);
check("unpause twice → 409", r.status === 409, r.body);

// ---------------------------------------------------------------------------
// 4. Sliding sessions
// ---------------------------------------------------------------------------
{
  const res = await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "klara@t.local", password: "Password12345" }) });
  const sc = res.headers.get("set-cookie") ?? "";
  const body = await res.json();
  check("customer login: 7-day cookie + token", /Max-Age=604800/.test(sc) && decode(body.token).exp - Math.floor(Date.now() / 1000) > 6 * 86400, sc.slice(0, 80));
  const res2 = await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@t.local", password: "Password12345" }) });
  const sc2 = res2.headers.get("set-cookie") ?? "";
  const body2 = await res2.json();
  check("admin login: 24-hour cookie, token carries abs cap", /Max-Age=86400/.test(sc2) && decode(body2.token).abs === decode(body2.token).exp, sc2.slice(0, 80));

  const now = Math.floor(Date.now() / 1000);
  const nearExpiry = jwt.sign({ userId: klaraId, tv: 0 }, process.env.JWT_SECRET, { expiresIn: "1h" });
  let res3 = await fetch(base + "/auth/me", { headers: { Authorization: `Bearer ${nearExpiry}` } });
  const renewed = res3.headers.get("x-session-token");
  check("consumer token with < 1 day left is renewed (x-session-token, 7 days, cookie refreshed)",
    res3.status === 200 && renewed && decode(renewed).exp - now > 6 * 86400 && /fiduxa_session=/.test(res3.headers.get("set-cookie") ?? "") && /x-session-token/i.test(res3.headers.get("access-control-expose-headers") ?? ""), renewed && decode(renewed));
  res3 = await fetch(base + "/auth/me", { headers: { Authorization: `Bearer ${renewed}` } });
  check("renewed token works and is not renewed again (plenty of time left)", res3.status === 200 && !res3.headers.get("x-session-token"), res3.status);

  const adminOld = jwt.sign({ userId: String(admin._id), tv: 0, iat: now - 23 * 3600, abs: now + 3600 }, process.env.JWT_SECRET, { expiresIn: 3600 + 23 * 3600 });
  res3 = await fetch(base + "/admin/dashboard/stats", { headers: { Authorization: `Bearer ${adminOld}` } });
  check("admin token near its 24 h absolute cap is NOT extended", res3.status === 200 && !res3.headers.get("x-session-token"), res3.status);
  const adminPastAbs = jwt.sign({ userId: String(admin._id), tv: 0, iat: now - 25 * 3600, abs: now - 3600 }, process.env.JWT_SECRET, { expiresIn: 26 * 3600 });
  res3 = await fetch(base + "/admin/dashboard/stats", { headers: { Authorization: `Bearer ${adminPastAbs}` } });
  check("admin token past its absolute cap → 401", res3.status === 401, res3.status);
  const adminNoAbs = jwt.sign({ userId: String(admin._id), tv: 0, iat: now - 25 * 3600 }, process.env.JWT_SECRET, { expiresIn: 26 * 3600 });
  res3 = await fetch(base + "/admin/dashboard/stats", { headers: { Authorization: `Bearer ${adminNoAbs}` } });
  check("legacy admin token older than 24 h (iat) → 401", res3.status === 401, res3.status);
}

// ---------------------------------------------------------------------------
// 5. Admin 2FA (TOTP)
// ---------------------------------------------------------------------------
r = await call("POST", "/users/me/2fa/setup", {}, benT);
check("non-admin cannot set up 2FA → 403", r.status === 403, r.body);
r = await call("GET", "/users/me/2fa", null, adminT);
check("2FA status: available, not enabled, not required", r.body.available === true && r.body.enabled === false && r.body.required === false, r.body);
r = await call("POST", "/users/me/2fa/setup", {}, adminT);
const secret = r.body.secret;
check("2FA setup returns secret, otpauth URL and QR data URL", r.status === 200 && /^[A-Z2-7]{16,}$/.test(secret ?? "") && /^otpauth:\/\/totp\//.test(r.body.otpauthUrl ?? "") && /^data:image\/png;base64,/.test(r.body.qrDataUrl ?? ""), r.body.otpauthUrl);
r = await call("POST", "/users/me/2fa/enable", { code: "000000" }, adminT);
check("enable with wrong code → 401", r.status === 401, r.body);
r = await call("POST", "/users/me/2fa/enable", { code: generateSync({ secret }) }, adminT);
check("enable with a valid code", r.status === 200 && r.body.enabled === true, r.body);
r = await login("admin@t.local");
check("login with 2FA enabled → requires2fa + challenge, no session", r.requires2fa === true && typeof r.challenge === "string" && !r.token, r);
const challenge = r.challenge;
let res = await fetch(base + "/admin/dashboard/stats", { headers: { Authorization: `Bearer ${challenge}` } });
check("challenge token is not a session → 401", res.status === 401, res.status);
r = await call("POST", "/auth/2fa/verify", { challenge, code: "123456" });
check("verify with wrong code → 401", r.status === 401, r.body);
r = await call("POST", "/auth/2fa/verify", { challenge, code: generateSync({ secret }) });
check("verify completes the login (token + user)", r.status === 200 && r.body.token && r.body.user?.role === "admin", r.body);
adminT = r.body.token;
r = await call("GET", "/admin/dashboard/stats", null, adminT);
check("session from 2FA verify works", r.status === 200, r.status);
r = await call("POST", "/auth/2fa/verify", { challenge: "not-a-token-at-all", code: generateSync({ secret }) });
check("invalid challenge → 401", r.status === 401, r.body);

r = await call("PUT", "/admin/settings", { security: { customerSessionDays: 7, adminSessionHours: 24, requireAdmin2fa: true } }, adminT);
check("security settings saved via slot", r.status === 200 && r.body.settings?.security?.requireAdmin2fa === true && SECURITY.requireAdmin2fa === true, r.body.settings?.security);
await User.create({ name: "Admin Two", email: "admin2@t.local", password: pw, role: "admin" });
r = await call("POST", "/auth/login", { email: "admin2@t.local", password: "Password12345" });
check("requireAdmin2fa: admin without 2FA cannot log in → 403", r.status === 403 && r.body.code === "2FA_SETUP_REQUIRED", r.body);
r = await call("POST", "/users/me/2fa/disable", { code: generateSync({ secret }) }, adminT);
check("2FA cannot be disabled while required → 409", r.status === 409, r.body);
await call("PUT", "/admin/settings", { security: { customerSessionDays: 7, adminSessionHours: 24, requireAdmin2fa: false } }, adminT);
r = await call("POST", "/users/me/2fa/disable", { code: generateSync({ secret }) }, adminT);
check("2FA disabled with a valid code", r.status === 200 && r.body.enabled === false, r.body);
r = await login("admin@t.local");
check("login works directly again after disabling 2FA", Boolean(r.token) && !r.requires2fa, r);

const { failures, passes } = summary();
console.log(`\n${failures === 0 ? `ALL PASSED (${passes})` : `${failures} FAILED (${passes} passed)`}`);
await User.db.dropDatabase();
server.close();
process.exit(failures ? 1 : 0);
