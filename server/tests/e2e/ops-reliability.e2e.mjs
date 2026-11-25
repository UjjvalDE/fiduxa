// E2E: reliability & operations – e-mail outbox (queue, immediate delivery,
// retry with backoff, permanent failure, admin log + resend), job scheduler
// lock, no-show watch, PayPal webhook (verified, idempotent), readiness probe.
import { ROOT, prepareEnv, createChecker, apiClient, startPayPalMock, flushEmails, ALWAYS_AVAILABLE, BERLIN_WIDE } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_ops");
const paypal = await startPayPalMock();
process.env.PAYPALAPIKEY = "mock-client";
process.env.PAYPALSECRET_KEY = "mock-secret";
process.env.PAYPAL_API_BASE = paypal.url;
process.env.PAYPAL_WEBHOOK_ID = "WH-TEST-1";
process.env.EMAIL_TRANSPORT = "json";
process.env.ADMIN_NOTIFICATION_EMAIL = "office@t.local";

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: Payment } = await import(ROOT + "/src/models/payment.model.js");
const { default: EmailMessage } = await import(ROOT + "/src/models/email.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { todayInBerlin, DAY_MS, slotStartInstant } = await import(ROOT + "/src/utils/helpers.js");
const { processEmailOutbox, sendAdminNotificationEmail, trySend } = await import(ROOT + "/src/services/email.service.js");
const { detectNoShows } = await import(ROOT + "/src/services/no-show.service.js");
const { JOBS, findJob } = await import(ROOT + "/src/jobs/index.js");
const { runJob } = await import(ROOT + "/src/jobs/scheduler.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
// Fixture: this suite exercises the card (Stripe) and cash flows that the owner switched off
// for now (POLICIES.paymentMethods.enabled = ["paypal"]); they are re-enabled for this test DB only.
await (await import(ROOT + "/src/models/settings.model.js")).default.updateOne({ key: "platform" }, { $set: { "policies.paymentMethods.enabled": ["paypal", "stripe", "cash"] } }, { upsert: true });
await loadSettings();
const server = app.listen(0);
const origin = `http://127.0.0.1:${server.address().port}`;
const base = `${origin}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const anna = await User.create({
  name: "Anna Nowak", email: "anna@t.local", phone: "0170 1234567", password: pw, role: "worker", availability: ALWAYS_AVAILABLE, workerStatus: "approved", emailVerified: true,
  workerProfile: { ...BERLIN_WIDE, address: "Strasse 1", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: "Anna",
});
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const adminT = await login("admin@t.local");
await call("POST", "/admin/slots", { from: day(1), to: day(20), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 5 }, adminT);

// ---------- Readiness / health ----------
{
  const ready = await fetch(`${origin}/ready`);
  const body = await ready.json();
  check("/ready → 200 when MongoDB answers a ping", ready.status === 200 && body.ready === true && body.database === "connected", body);
  const health = await fetch(`${origin}/health`);
  check("/health still answers 200", health.status === 200, health.status);
}

// ---------- Outbox: request only enqueues, the outbox job delivers ----------
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345", phone: "030 123456" });
const custT = r.body.token;
const pending = await EmailMessage.findOne({ to: "klara@t.local" }).lean();
check("request does not wait for SMTP: registration mail is queued (0 attempts)", pending?.status === "queued" && pending.attempts === 0, pending && { s: pending.status, a: pending.attempts });
await flushEmails();
let verifyMail = await EmailMessage.findOne({ to: "klara@t.local" }).lean();
check("registration mail is delivered by the outbox job",
  r.status === 201 && verifyMail?.status === "sent" && verifyMail.attempts === 1 && !!verifyMail.sentAt && verifyMail.template === "emailVerification",
  verifyMail && { s: verifyMail.status, a: verifyMail.attempts, t: verifyMail.template });

// A process that runs the scheduler (API with RUN_JOBS_IN_API, or worker.js) kicks the outbox right after enqueueing
{
  const { enableOutboxKick } = await import(ROOT + "/src/services/email.service.js");
  enableOutboxKick(true);
  await sendAdminNotificationEmail({ subject: "Kick-Test", lines: ["x"] });
  await sleep(800);
  const kicked = await EmailMessage.findOne({ subject: /Kick-Test/ }).lean();
  check("scheduler process: queued mail is delivered in the background within a second", kicked?.status === "sent", kicked && { s: kicked.status });
  enableOutboxKick(false);
}

// ---------- Outbox: transport down → queued with backoff, retried later ----------
process.env.EMAIL_TRANSPORT = ""; // SMTP vars are stripped by the harness → transporter cannot be created
const outcome = await trySend("Ops test", () => sendAdminNotificationEmail({ subject: "Outbox-Test FID-2026-00042", lines: ["Zeile 1"] }));
await flushEmails();
let queued = await EmailMessage.findOne({ subject: /Outbox-Test/ });
check("failed delivery keeps the mail queued (attempt 1, error recorded, retry in ~1 min, trySend never throws)",
  outcome === "sent" && queued?.status === "queued" && queued.attempts === 1 && /Missing email configuration/.test(queued.lastError) &&
    queued.nextAttemptAt - Date.now() > 30_000 && queued.nextAttemptAt - Date.now() <= 60_000 && queued.bookingRef === "FID-2026-00042",
  queued && { s: queued.status, a: queued.attempts, e: queued.lastError, next: queued.nextAttemptAt });

let run = await processEmailOutbox();
check("outbox job does not touch mails whose retry time has not come", run.sent === 0 && run.queued === 0 && (await EmailMessage.findById(queued._id)).status === "queued", run);

await EmailMessage.updateOne({ _id: queued._id }, { nextAttemptAt: new Date(Date.now() - 1000) });
run = await processEmailOutbox();
let retriedDown = await EmailMessage.findById(queued._id);
check("second failure → backoff grows to 5 min (attempt 2)",
  run.queued === 1 && retriedDown.attempts === 2 && retriedDown.nextAttemptAt - Date.now() > 4 * 60_000, { run, a: retriedDown.attempts });

process.env.EMAIL_TRANSPORT = "json"; // transport fixed
await EmailMessage.updateOne({ _id: queued._id }, { nextAttemptAt: new Date(Date.now() - 1000) });
run = await processEmailOutbox();
const recovered = await EmailMessage.findById(queued._id);
check("once the transport works the queued mail is delivered (attempt 3 → sent)",
  run.sent === 1 && recovered.status === "sent" && recovered.attempts === 3 && recovered.lastError === "", { run, s: recovered.status, a: recovered.attempts });

// permanent failure after 5 attempts
process.env.EMAIL_TRANSPORT = "";
const doomed = await EmailMessage.create({ to: "nobody@t.local", subject: "Gibt auf", text: "x", html: "<p>x</p>", template: "test", attempts: 4, nextAttemptAt: new Date(Date.now() - 1000) });
run = await processEmailOutbox();
const dead = await EmailMessage.findById(doomed._id);
check("5th failed attempt marks the mail as failed (no endless retries)", run.failed === 1 && dead.status === "failed" && dead.attempts === 5, { run, s: dead.status, a: dead.attempts });
process.env.EMAIL_TRANSPORT = "json";

// ---------- Admin API: list / search / resend ----------
r = await call("GET", "/admin/emails?status=failed", null, adminT);
check("admin lists failed mails with counts + pagination",
  r.status === 200 && r.body.emails.length === 1 && String(r.body.emails[0]._id) === String(doomed._id) && r.body.counts.failed === 1 && r.body.counts.sent >= 2 && r.body.pagination.total === 1,
  { s: r.status, n: r.body.emails?.length, counts: r.body.counts });
r = await call("GET", "/admin/emails?search=FID-2026-00042", null, adminT);
check("search by booking reference / subject / recipient", r.status === 200 && r.body.emails.length === 1 && r.body.emails[0].bookingRef === "FID-2026-00042", r.body.emails?.length);
r = await call("GET", "/admin/emails", null, custT);
check("customer cannot read the e-mail log → 403", r.status === 403, r.status);
r = await call("POST", `/admin/emails/${doomed._id}/resend`, {}, custT);
check("customer cannot resend → 403", r.status === 403, r.status);
r = await call("POST", `/admin/emails/${doomed._id}/resend`, {}, adminT);
check("admin resend delivers the failed mail (fresh attempt budget)",
  r.status === 200 && r.body.email.status === "sent" && r.body.email.attempts === 1 && !!r.body.email.resentAt, { s: r.status, e: r.body.email });
r = await call("POST", `/admin/emails/000000000000000000000000/resend`, {}, adminT);
check("resend of unknown mail → 404", r.status === 404, r.status);

// ---------- Job lock: same job twice concurrently → one execution ----------
{
  let runs = 0;
  const job = { name: "opsTestJob", everyMs: 60_000, run: async () => { runs += 1; await sleep(400); return "done"; } };
  const [a, b] = await Promise.all([runJob(job), runJob(job)]);
  check("job lock: two concurrent runs → exactly one executes, the other skips", runs === 1 && [a.ran, b.ran].filter(Boolean).length === 1, { runs, a: a.ran, b: b.ran });
  const c = await runJob(job);
  check("lock is released afterwards → next run executes", c.ran === true && runs === 2, { ran: c.ran, runs });
  check("registry contains housekeeping, dailyMaintenance, emailOutbox (10 s) and noShowWatch (5 min)",
    !!findJob("housekeeping") && !!findJob("dailyMaintenance") && findJob("emailOutbox")?.everyMs === 10_000 && findJob("noShowWatch")?.everyMs === 300_000,
    JOBS.map((j) => j.name));
  const outboxRun = await runJob(findJob("emailOutbox"));
  check("emailOutbox job runs through the scheduler", outboxRun.ran === true && typeof outboxRun.result?.sent === "number", outboxRun);
}

// ---------- No-show watch ----------
const book = async (d, startTime, extra = {}) => {
  const slots = (await call("GET", `/bookings/availability?date=${d}&duration=120`)).body.data;
  const slot = slots.find((s) => s.startTime === startTime) ?? slots[0];
  return call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, name: "Kunde Klara", email: "klara@t.local", phone: "030123456",
    postcode: "10115", address: "Invalidenstr. 5", preferredDate: d, slotId: slot.windowId, startTime: slot.startTime,
    earlyStartConsent: true, paymentMethod: "cash", ...extra,
  }, custT);
};
r = await book(day(2), "09:00");
const late = r.body.booking.id;
r = await book(day(2), "13:00");
const onTime = r.body.booking.id;
check("two cash bookings created for the no-show scenario", !!late && !!onTime, r.status);
const today = todayInBerlin();
// Both moved to today 00:00 (start instant always in the past); the second cleaner already reported "on the way"
await Booking.updateOne({ _id: late }, { $set: { status: "confirmed", assignedWorker: anna._id, preferredDate: today, slot: "00:00", slotEnd: "02:00" } });
await Booking.updateOne({ _id: onTime }, { $set: { status: "confirmed", assignedWorker: anna._id, preferredDate: today, slot: "00:00", slotEnd: "02:00", "job.onTheWayAt": new Date() } });
const now = new Date(slotStartInstant(today, "00:00").getTime() + 20 * 60_000); // 20 min after start

const mailsBefore = await EmailMessage.countDocuments({ template: "cleanerDelayed" });
let flagged = await detectNoShows({ now });
await flushEmails();
let lateDoc = await Booking.findById(late);
let okDoc = await Booking.findById(onTime);
const delayedMail = await EmailMessage.findOne({ template: "cleanerDelayed", bookingRef: lateDoc.reference }).lean();
const officeMail = await EmailMessage.findOne({ to: "office@t.local", subject: new RegExp(`verspätet: ${lateDoc.reference}`) }).lean();
check("no-show watch flags the late job once (15 min grace) and leaves the 'on the way' job alone",
  flagged === 1 && !!lateDoc.job.noShowAlertAt && !okDoc.job.noShowAlertAt && lateDoc.assignedWorker?.equals(anna._id), { flagged, late: lateDoc.job, ok: okDoc.job });
check("customer gets the 'wir prüfen, wo deine Reinigungskraft bleibt' notice (de) and it is delivered",
  delayedMail?.status === "sent" && /Wir prüfen, wo deine Reinigungskraft bleibt/.test(delayedMail.subject) && delayedMail.to === "klara@t.local", delayedMail?.subject);
check("office is alerted with cleaner name + phone", officeMail?.status === "sent" && /Anna Nowak/.test(officeMail.text) && /0170 1234567/.test(officeMail.text), officeMail?.text);

flagged = await detectNoShows({ now: new Date(now.getTime() + 60_000) });
const mailsAfter = await EmailMessage.countDocuments({ template: "cleanerDelayed" });
check("second run: nothing new flagged, customer not mailed twice", flagged === 0 && mailsAfter === mailsBefore + 1, { flagged, mailsBefore, mailsAfter });

r = await call("GET", "/admin/dashboard/stats", null, adminT);
check("dashboard stats expose lateToday = 1", r.status === 200 && r.body.stats.lateToday === 1, r.body.stats?.lateToday);
r = await call("GET", `/admin/bookings/${late}`, null, adminT);
check("admin booking detail shows job.noShowAlertAt", r.status === 200 && !!(r.body.booking ?? r.body.data ?? r.body)?.job?.noShowAlertAt, Object.keys(r.body));

// ---------- PayPal webhook ----------
r = await book(day(5), "10:00", { paymentMethod: "paypal" });
const ppBooking = r.body.booking;
const orderId = r.body.checkoutUrl ? new URL(r.body.checkoutUrl).searchParams.get("token") : null;
check("PayPal booking is pending with an order", r.status === 201 && ppBooking.status === "payment_pending" && !!orderId && paypal.orders.has(orderId), { s: r.status, orderId });

const webhook = (event, headers = {}) =>
  fetch(`${base}/payments/paypal/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "paypal-transmission-id": "tx-1", "paypal-transmission-time": new Date().toISOString(), "paypal-transmission-sig": "sig", "paypal-cert-url": "https://api.sandbox.paypal.com/cert", "paypal-auth-algo": "SHA256withRSA",
      ...headers,
    },
    body: typeof event === "string" ? event : JSON.stringify(event),
  }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) }));

const approved = { id: "WH-EVT-1", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: orderId, status: "APPROVED" } };

paypal.nextWebhookVerification = "FAILURE";
r = await webhook(approved);
check("webhook with a bad signature → 400, nothing captured", r.status === 400 && paypal.captures === 0, { s: r.status, c: paypal.captures });

r = await webhook(approved);
const ppDoc = await Booking.findById(ppBooking.id);
const ppPay = await Payment.findOne({ checkoutSessionId: orderId });
check("verified CHECKOUT.ORDER.APPROVED captures the order and confirms the booking",
  r.status === 200 && r.body.outcome === "paid" && paypal.captures === 1 && ppDoc.status === "confirmed" && ppDoc.payment.status === "paid" && ppPay.status === "paid" &&
    paypal.lastWebhookVerification?.webhook_id === "WH-TEST-1",
  { s: r.status, b: r.body, status: ppDoc.status, pay: ppPay.status, captures: paypal.captures });

r = await webhook(approved);
check("duplicate webhook is ignored (no second capture)", r.status === 200 && r.body.duplicate === true && paypal.captures === 1, { s: r.status, b: r.body, c: paypal.captures });

r = await webhook({ id: "WH-EVT-2", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "UNKNOWN123" } });
check("unknown order → acknowledged, nothing happens", r.status === 200 && r.body.ignored === "unknown_order", r.body);
r = await webhook("not json {");
check("malformed payload → 400", r.status === 400, r.status);

// Test shortcut: skip verification (only NODE_ENV=test + flag)
process.env.PAYPAL_WEBHOOK_SKIP_VERIFY = "1";
const verificationsBefore = paypal.webhookVerifications;
r = await webhook({ id: "WH-EVT-3", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "X" } });
check("other event types are acknowledged; skip-verify flag does not call PayPal", r.status === 200 && paypal.webhookVerifications === verificationsBefore, r.body);
delete process.env.PAYPAL_WEBHOOK_SKIP_VERIFY;
const savedId = process.env.PAYPAL_WEBHOOK_ID;
delete process.env.PAYPAL_WEBHOOK_ID;
r = await webhook(approved);
check("without PAYPAL_WEBHOOK_ID the webhook answers 503", r.status === 503, r.status);
process.env.PAYPAL_WEBHOOK_ID = savedId;

// ---------- Done ----------
const { failures, passes } = summary();
console.log(`\n${passes} passed, ${failures} failed`);
paypal.close();
server.close();
await User.db.dropDatabase();
await User.db.close();
process.exit(failures ? 1 : 0);
