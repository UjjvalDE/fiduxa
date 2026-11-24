// E2E: job lifecycle after the job day – customer list split by DATE,
// cleaner late confirmation ("Job erledigt bestätigen", grace window, time
// validation, invoice + feedback exactly once, idempotent), "did not happen"
// report + admin decision, evening reminder / admin alert watch, admin
// override with reason + audit. PayPal is a local mock, separate test DB.
import { ROOT, prepareEnv, createChecker, apiClient, startPayPalMock } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_job_lifecycle");
const paypal = await startPayPalMock();
process.env.PAYPALAPIKEY = "mock-client";
process.env.PAYPALSECRET_KEY = "mock-secret";
process.env.PAYPAL_API_BASE = paypal.url;
process.env.ADMIN_NOTIFICATION_EMAIL = "office@t.local";

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: Email } = await import(ROOT + "/src/models/email.model.js");
const { default: AuditLog } = await import(ROOT + "/src/models/audit-log.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { processJobConfirmations } = await import(ROOT + "/src/services/job-completion.service.js");
const { todayInBerlin, slotStartInstant, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
await loadSettings();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);
const dateOf = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS);

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
await User.create({
  name: "Anna Nowak", email: "anna@t.local", password: pw, role: "worker", workerStatus: "approved", emailVerified: true,
  workerProfile: { address: "Str 1", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: "Anna",
});
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;
await call("POST", "/admin/slots", { from: day(1), to: day(12), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00" }, { startTime: "13:00" }], capacity: 10 }, adminT);

let n = 0;
// Paid booking, accepted by Anna, then moved to `offset` days from today
const job = async (offset) => {
  const d = day(1 + (n++ % 10));
  const slot = (await call("GET", `/bookings/availability?date=${d}`)).body.data.find((s) => s.startTime === "08:00");
  const res = await call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, name: "Kunde Klara", email: "klara@t.local", phone: "030123456", postcode: "10115",
    address: "Invalidenstr. 5", preferredDate: d, slotId: slot.id, earlyStartConsent: true, paymentMethod: "paypal",
  }, custT);
  const id = res.body.booking.id;
  const orderId = new URL(res.body.checkoutUrl).searchParams.get("token");
  await call("POST", "/payments/paypal/capture", { bookingId: id, orderId }, custT);
  const acc = await call("POST", `/worker/jobs/${id}/accept`, null, annaT);
  if (acc.status !== 200) console.log("accept failed", acc.body);
  await Booking.updateOne({ _id: id }, { preferredDate: dateOf(offset) });
  return id;
};

// ---------- Customer list split by date ----------
const yesterday = await job(-1);
const todayJob = await job(0);
const future = await job(3);
r = await call("GET", "/bookings/my-bookings?scope=upcoming", null, custT);
const up = r.body.bookings.map((b) => String(b._id));
check("upcoming: today + future, NOT yesterday's confirmed job", up.includes(todayJob) && up.includes(future) && !up.includes(yesterday), up);
r = await call("GET", "/bookings/my-bookings?scope=past", null, custT);
const pastY = r.body.bookings.find((b) => String(b._id) === yesterday);
check("past: yesterday's confirmed job with awaitingConfirmation", pastY?.status === "confirmed" && pastY.awaitingConfirmation === true, pastY);
check("past: today's/future jobs not listed", !r.body.bookings.some((b) => [todayJob, future].includes(String(b._id))));
await Booking.updateOne({ _id: yesterday }, { status: "in_progress" });
r = await call("GET", "/bookings/my-bookings?scope=past", null, custT);
check("past-dated in_progress (never finished) is past + awaiting", r.body.bookings.find((b) => String(b._id) === yesterday)?.awaitingConfirmation === true);
await Booking.updateOne({ _id: yesterday }, { status: "confirmed" });

// ---------- Cleaner: confirmation list ----------
r = await call("GET", "/worker/jobs?scope=confirm", null, annaT);
const conf = r.body.jobs.find((j) => String(j._id) === yesterday);
check("worker scope=confirm lists yesterday's job, confirmable, booked defaults", conf?.confirmation?.needed && conf.confirmation.possible && conf.confirmation.defaults.startTime === "08:00", conf?.confirmation);
check("worker scope=confirm excludes today/future", !r.body.jobs.some((j) => [todayJob, future].includes(String(j._id))));
r = await call("GET", "/worker/jobs?scope=past", null, annaT);
check("worker past list flags the job as needing confirmation", r.body.jobs.find((j) => String(j._id) === yesterday)?.confirmation?.needed === true);
r = await call("POST", `/worker/jobs/${yesterday}/start`, null, annaT);
check("normal Start on a past job still refused (409)", r.status === 409, r.body);

// ---------- Late confirmation: validation ----------
r = await call("POST", `/worker/jobs/${yesterday}/confirm-late`, { startTime: "11:00", endTime: "09:00" }, annaT);
check("end before start → 422 END_BEFORE_START", r.status === 422 && r.body.code === "END_BEFORE_START", r.body);
r = await call("POST", `/worker/jobs/${yesterday}/confirm-late`, { startTime: "06:00", endTime: "19:30" }, annaT);
check("13.5 h → 422 DURATION_OUT_OF_RANGE", r.status === 422 && r.body.code === "DURATION_OUT_OF_RANGE", r.body);
r = await call("POST", `/worker/jobs/${yesterday}/confirm-late`, { startTime: "8 Uhr", endTime: "10:00" }, annaT);
check("bad time format → 422 INVALID_TIME", r.status === 422 && r.body.code === "INVALID_TIME", r.body);
r = await call("POST", `/worker/jobs/${future}/confirm-late`, {}, annaT);
check("future job → 409 LATE_CONFIRM_NOT_YET", r.status === 409 && r.body.code === "LATE_CONFIRM_NOT_YET", r.body);
const old = await job(-8);
r = await call("POST", `/worker/jobs/${old}/confirm-late`, {}, annaT);
check("8 days after the date → 409 LATE_CONFIRM_WINDOW_CLOSED", r.status === 409 && r.body.code === "LATE_CONFIRM_WINDOW_CLOSED", r.body);
const edge = await job(-7);
r = await call("GET", `/worker/jobs/${edge}`, null, annaT);
check("7 days after the date still confirmable", r.body.job?.confirmation?.possible === true, r.body.job?.confirmation);
const otherWorker = await User.create({ name: "Bob", email: "bob@t.local", password: pw, role: "worker", workerStatus: "approved", emailVerified: true, workerProfile: { address: "x" } });
const bobT = await login("bob@t.local");
r = await call("POST", `/worker/jobs/${yesterday}/confirm-late`, {}, bobT);
check("other cleaner cannot confirm → 404", r.status === 404 && otherWorker, r.status);
check("nothing changed by failed attempts", (await Booking.findById(yesterday)).status === "confirmed");

// ---------- Late confirmation: success, pipeline once ----------
r = await call("POST", `/worker/jobs/${yesterday}/confirm-late`, { startTime: "08:15", endTime: "10:45", note: "Vergessen zu tippen" }, annaT);
let b = await Booking.findById(yesterday);
check("late confirm → 200 + feedbackPending", r.status === 200 && r.body.feedbackPending === true, r.body);
check("status completed, lateConfirmation flag, 150 min", b.status === "completed" && b.job.lateConfirmation === true && b.job.actualDurationMinutes === 150, b.job);
check("startedAt/completedAt = given times on the job date",
  b.job.startedAt.getTime() === slotStartInstant(dateOf(-1), "08:15").getTime() && b.job.completedAt.getTime() === slotStartInstant(dateOf(-1), "10:45").getTime(), b.job);
check("invoice issued, cleaner earning recorded", Boolean(b.invoice?.number) && b.workerPayout?.status === "pending", { inv: b.invoice, p: b.workerPayout });
check("status history notes late confirmation", b.statusHistory.at(-1).note === "Confirmed late by worker");
const invoiceNo = b.invoice.number;
const feedbackMails = () => Email.countDocuments({ template: /feedback/i, to: "klara@t.local", bookingRef: b.reference });
const fb1 = await feedbackMails();
check("feedback request emailed once", fb1 === 1, fb1);
r = await call("GET", "/worker/jobs/feedback/pending", null, annaT);
check("cleaner feedback pop-up pending for the job", JSON.stringify(r.body).includes(yesterday), r.body);
r = await call("POST", `/worker/jobs/${yesterday}/confirm-late`, { startTime: "08:15", endTime: "10:45" }, annaT);
b = await Booking.findById(yesterday);
check("repeat → 200 alreadyCompleted (idempotent)", r.status === 200 && r.body.alreadyCompleted === true, r.body);
check("no second invoice / feedback mail", b.invoice.number === invoiceNo && (await feedbackMails()) === 1);
r = await call("POST", `/worker/jobs/${yesterday}/complete`, {}, annaT);
check("/complete after late confirmation → 409", r.status === 409, r.status);
const [c1, c2] = await Promise.all([
  call("POST", `/worker/jobs/${edge}/confirm-late`, {}, annaT),
  call("POST", `/worker/jobs/${edge}/confirm-late`, {}, annaT),
]);
const edgeB = await Booking.findById(edge);
check("parallel double tap: one completion, the other 409/alreadyCompleted", [c1.status, c2.status].includes(200) && (c1.status !== c2.status || c1.body.alreadyCompleted || c2.body.alreadyCompleted), [c1.body, c2.body]);
check("parallel: one completed history entry, one feedback mail", edgeB.statusHistory.filter((h) => h.status === "completed").length === 1 && (await Email.countDocuments({ template: /feedback/i, bookingRef: edgeB.reference })) === 1);
r = await call("GET", "/bookings/my-bookings?scope=past", null, custT);
check("customer past list: confirmed job now completed, not awaiting", r.body.bookings.find((x) => String(x._id) === yesterday)?.awaitingConfirmation === false);

// ---------- Normal flow unchanged (today: Start + Done) ----------
r = await call("POST", `/worker/jobs/${todayJob}/start`, null, annaT);
check("today: start works", r.status === 200, r.body);
r = await call("GET", "/bookings/my-bookings?scope=upcoming", null, custT);
check("today's running job stays upcoming for the customer", r.body.bookings.some((x) => String(x._id) === todayJob));
r = await call("POST", `/worker/jobs/${todayJob}/complete`, { actualDurationMinutes: 120 }, annaT);
b = await Booking.findById(todayJob);
check("today: complete via shared pipeline → invoice + feedbackPending", r.status === 200 && r.body.feedbackPending && b.invoice?.number && !b.job.lateConfirmation, r.body);

// ---------- Not happened ----------
const nh = await job(-2);
r = await call("POST", `/worker/jobs/${nh}/not-happened`, { reason: "other" }, annaT);
check("reason other without note → 400/422", r.status === 400 || r.status === 422, r.status);
r = await call("POST", `/worker/jobs/${future}/not-happened`, { reason: "customer_absent" }, annaT);
check("future job cannot be reported → 409", r.status === 409, r.body);
r = await call("POST", `/worker/jobs/${nh}/not-happened`, { reason: "customer_absent", note: "Niemand öffnete" }, annaT);
b = await Booking.findById(nh);
check("report → 201, pending decision, status unchanged, no fee", r.status === 201 && b.job.notHappened.decision === "pending" && b.status === "confirmed" && !b.cancellation?.feeCents, b.job.notHappened);
check("admin notified about not-happened", (await Email.countDocuments({ to: "office@t.local", subject: /nicht stattgefunden/ })) === 1);
r = await call("POST", `/worker/jobs/${nh}/not-happened`, { reason: "customer_absent" }, annaT);
check("second report → idempotent", r.status === 200 && r.body.alreadyReported, r.body);
r = await call("POST", `/worker/jobs/${nh}/confirm-late`, {}, annaT);
check("confirm after report → 409 REPORTED_NOT_HAPPENED", r.status === 409 && r.body.code === "LATE_CONFIRM_REPORTED_NOT_HAPPENED", r.body);
r = await call("GET", "/worker/jobs?scope=confirm", null, annaT);
check("reported job leaves the cleaner's confirm list", !r.body.jobs.some((j) => String(j._id) === nh));
r = await call("GET", "/admin/bookings/stuck", null, adminT);
check("admin stuck list shows the report", r.body.jobs?.find((j) => String(j.id) === nh)?.notHappened?.reason === "customer_absent", r.body);
r = await call("PATCH", `/admin/bookings/${nh}/not-happened`, { decision: "no_access_fee" }, adminT);
check("admin decision needs a reason", r.status === 400 || r.status === 422, r.status);
r = await call("PATCH", `/admin/bookings/${nh}/not-happened`, { decision: "no_access_fee", note: "Kunde nicht erreichbar, Gebühr laut AGB" }, adminT);
b = await Booking.findById(nh);
check("no_access_fee → cancelled with policy fee", r.status === 200 && b.status === "cancelled" && b.cancellation.feeCents > 0 && b.job.notHappened.decision === "no_access_fee", { s: r.status, c: b.cancellation });
check("decision audited", (await AuditLog.countDocuments({ action: "booking.not_happened.decided", entityId: b._id })) === 1);
const nh2 = await job(-1);
await call("POST", `/worker/jobs/${nh2}/not-happened`, { reason: "no_access", note: "Schlüssel fehlte" }, annaT);
r = await call("PATCH", `/admin/bookings/${nh2}/not-happened`, { decision: "dismissed", note: "Kunde sagt, es wurde geputzt" }, adminT);
r = await call("POST", `/worker/jobs/${nh2}/confirm-late`, {}, annaT);
check("dismissed report → cleaner can confirm again", r.status === 200 && (await Booking.findById(nh2)).status === "completed", r.body);

// ---------- Reminders + admin alert ----------
const remToday = await job(0);
const remPast = await job(-3);
const evening = slotStartInstant(todayInBerlin(), "20:00");
const morning = slotStartInstant(todayInBerlin(), "07:00");
const remindersFor = (id) => Booking.findById(id).then((x) => Email.countDocuments({ template: "jobConfirmReminder", bookingRef: x.reference }));
let run = await processJobConfirmations({ now: morning });
check("morning: past job reminded, today's job not yet", (await remindersFor(remPast)) === 1 && (await remindersFor(remToday)) === 0, run);
run = await processJobConfirmations({ now: evening });
check("evening: today's job reminded", (await remindersFor(remToday)) === 1, run);
run = await processJobConfirmations({ now: evening });
check("reminders sent only once", run.reminders === 0 && (await remindersFor(remToday)) === 1 && (await remindersFor(remPast)) === 1, run);
const reminder = await Email.findOne({ template: "jobConfirmReminder" });
check("reminder goes to the cleaner", reminder?.to === "anna@t.local");
check("completed jobs never reminded", (await remindersFor(yesterday)) === 0);
check("old job (window closed) → admin alert once", (await Email.countDocuments({ to: "office@t.local", subject: /nicht bestätigt/ })) === 1 && (await Booking.findById(old)).job.stuckAlertAt, run);
const { findJob } = await import(ROOT + "/src/jobs/index.js");
const sweep = await findJob("noShowWatch").run();
check("noShowWatch job runs the confirmation watch too", sweep && typeof sweep.jobConfirmations === "object", sweep);

// ---------- Admin override ----------
r = await call("PATCH", `/admin/bookings/${old}/status`, { status: "completed" }, adminT);
check("admin completion without reason → 422 CORRECTION_REASON_REQUIRED", r.status === 422 && r.body.code === "CORRECTION_REASON_REQUIRED", r.body);
r = await call("PATCH", `/admin/bookings/${old}/status`, { status: "completed", note: "Kundin bestätigt telefonisch", startTime: "08:00", endTime: "10:00" }, adminT);
b = await Booking.findById(old);
check("Admin-Korrektur → completed, reason stored, same pipeline (invoice, pay)", r.status === 200 && b.status === "completed" && b.job.adminCorrection.reason === "Kundin bestätigt telefonisch" && b.invoice?.number && b.workerPayout?.status, { s: r.status, j: b.job });
check("admin correction audited", (await AuditLog.countDocuments({ action: "booking.status.admin_correction", entityId: b._id })) === 1);
check("history labelled Admin-Korrektur", b.statusHistory.at(-1).note.startsWith("Admin-Korrektur"));
r = await call("PATCH", `/admin/bookings/${old}/status`, { status: "completed", note: "nochmal" }, adminT);
check("admin cannot complete twice → 409", r.status === 409, r.status);
r = await call("GET", "/admin/dashboard/stats", null, adminT);
check("dashboard exposes stuck job count + list", typeof r.body.stats?.stuckJobs === "number" && Array.isArray(r.body.stats.stuckJobList), r.body.stats?.stuckJobs);

const { failures, passes } = summary();
console.log(`\n${passes} passed, ${failures} failed`);
server.close();
await paypal.close?.();
await User.db.dropDatabase();
await User.db.close();
process.exit(failures ? 1 : 0);
