// E2E: customer complaints against a cleaner – create (own completed bookings
// only, photos), admin review, every resolution action (refund, voucher,
// warning, suspension, block, re-clean / other, reject), statuses, emails
// (admin notification, customer outcome, cleaner restriction), permissions
// (customer only own bookings, cleaner only own neutral view, admin only) and
// the privacy hook. Fake Stripe API + throwaway MongoDB (27999). NO real money.
import http from "node:http";

import { ROOT, prepareEnv, createChecker, apiClient } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_complaints");
process.env.EMAIL_TRANSPORT = "json";
process.env.ADMIN_NOTIFICATION_EMAIL = "office@t.local";

// ---- Fake Stripe API ----
const stripeCalls = [];
const fakeStripe = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    stripeCalls.push({ method: req.method, url: req.url, body });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/v1/checkout/sessions") {
      const id = "cs_test_" + Math.random().toString(36).slice(2, 10);
      return res.end(JSON.stringify({ id, object: "checkout.session", url: `https://checkout.stripe.test/${id}` }));
    }
    if (req.method === "POST" && /\/v1\/checkout\/sessions\/[^/]+\/expire/.test(req.url)) {
      return res.end(JSON.stringify({ id: "x", object: "checkout.session", status: "expired" }));
    }
    if (req.method === "POST" && req.url === "/v1/refunds") {
      return res.end(JSON.stringify({ id: "re_test_" + Math.random().toString(36).slice(2, 8), object: "refund" }));
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: { type: "invalid_request_error", message: "not mocked" } }));
  });
});
await new Promise((r) => fakeStripe.listen(0, "127.0.0.1", r));
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.STRIPE_API_BASE = `http://127.0.0.1:${fakeStripe.address().port}`;

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");
const Stripe = require("stripe");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: Payment } = await import(ROOT + "/src/models/payment.model.js");
const { default: Complaint } = await import(ROOT + "/src/models/complaint.model.js");
const { default: GiftCard } = await import(ROOT + "/src/models/gift-card.model.js");
const { default: EmailMessage } = await import(ROOT + "/src/models/email.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { anonymiseUser } = await import(ROOT + "/src/services/account-privacy.service.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
// Card payments are switched off by the owner; re-enabled for this test DB only (fake Stripe)
await (await import(ROOT + "/src/models/settings.model.js")).default.updateOne({ key: "platform" }, { $set: { "policies.paymentMethods.enabled": ["paypal", "stripe"] } }, { upsert: true });
await loadSettings();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);
const mails = (template, to) => EmailMessage.countDocuments({ template, ...(to && { to }) });

const stripe = new Stripe("sk_test_dummy");
const sendWebhook = async (sessionId, amount) => {
  const payload = JSON.stringify({
    id: "evt_" + Math.random(),
    type: "checkout.session.completed",
    data: { object: { id: sessionId, object: "checkout.session", amount_total: amount, currency: "eur", payment_status: "paid", payment_intent: "pi_" + sessionId } },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
  await fetch(base + "/payments/webhook", { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": header }, body: payload });
};

// ---------- Fixtures ----------
const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const mkWorker = (name, email) =>
  User.create({
    name, email, password: pw, role: "worker", workerStatus: "approved", emailVerified: true,
    workerProfile: { address: "Str 1", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: name,
  });
const anna = await mkWorker("Anna Nowak", "anna@t.local");
const ben = await mkWorker("Ben Weber", "ben@t.local");
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
const benT = await login("ben@t.local");
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const klaraT = r.body.token;
const klaraId = r.body.user?.id ?? r.body.user?._id;
r = await call("POST", "/auth/register", { name: "Kunde Otto", email: "otto@t.local", password: "Password12345" });
const ottoT = r.body.token;
const ottoId = r.body.user?.id ?? r.body.user?._id;
await call("POST", "/admin/slots", { from: day(1), to: day(20), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 5 }, adminT);

// 3 h × hourly rate, paid by (fake) card
const bookPaid = async (token, name, email, d) => {
  const slots = (await call("GET", `/bookings/availability?date=${d}&duration=180`)).body.data;
  const t = slots[0];
  const res = await call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, durationMinutes: 180, name, email, phone: "030123456", postcode: "10115", address: "Invalidenstr. 5",
    preferredDate: d, slotId: t.windowId, startTime: t.startTime, earlyStartConsent: true, paymentMethod: "stripe",
  }, token);
  const id = res.body.booking.id;
  const payment = await Payment.findOne({ booking: id, status: "created" });
  await sendWebhook(payment.checkoutSessionId, payment.amountCents);
  return id;
};
const complete = async (id, worker, workerT) => {
  await call("PATCH", `/admin/bookings/${id}/assign`, { workerId: String(worker._id) }, adminT);
  await Booking.updateOne({ _id: id }, { preferredDate: todayInBerlin() });
  await call("POST", `/worker/jobs/${id}/start`, null, workerT);
  return call("POST", `/worker/jobs/${id}/complete`, { note: "ok" }, workerT);
};

const jobA = await bookPaid(klaraT, "Kunde Klara", "klara@t.local", day(3));
r = await complete(jobA, anna, annaT);
let b = await Booking.findById(jobA);
check("0. fixture: Klara's paid booking completed by Anna", r.status === 200 && b.status === "completed" && b.payment.status === "paid", { s: b.status, p: b.payment?.status });
const priceCents = b.payment.amountCents;
const upcoming = await bookPaid(klaraT, "Kunde Klara", "klara@t.local", day(8));
const jobOtto = await bookPaid(ottoT, "Kunde Otto", "otto@t.local", day(4));
await complete(jobOtto, ben, benT);

// ---------- 1. Create ----------
const tinyPng = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64");
r = await call("GET", `/customer/bookings/${jobA}/complaints`, null, klaraT);
check("1. customer: completed booking → canComplain, no complaints yet", r.status === 200 && r.body.canComplain === true && r.body.complaints.length === 0, r.body);
r = await call("GET", `/customer/bookings/${upcoming}/complaints`, null, klaraT);
check("1a. upcoming booking → canComplain false", r.status === 200 && r.body.canComplain === false, r.body);
r = await call("POST", `/customer/bookings/${upcoming}/complaints`, { category: "quality", description: "Noch gar nicht stattgefunden." }, klaraT);
check("1b. complaint on a future booking → 409 COMPLAINT_NOT_ALLOWED", r.status === 409 && r.body.code === "COMPLAINT_NOT_ALLOWED", r.body);
r = await call("POST", `/customer/bookings/${jobA}/complaints`, { category: "nonsense", description: "Bad bad bad bad" }, klaraT);
check("1c. invalid category → 422", r.status === 422, r.status);
r = await call("POST", `/customer/bookings/${jobA}/complaints`, { category: "quality", description: "Kurz" }, klaraT);
check("1d. too short description → 422", r.status === 422, r.status);
r = await call("POST", `/customer/bookings/${jobA}/complaints`, { category: "damage", description: "Die Vase wurde beschädigt.", photos: [{ name: "x.pdf", dataUrl: "data:application/pdf;base64,JVBERi0=" }] }, klaraT);
check("1e. photo that is not JPG/PNG → 422", r.status === 422 && r.body.code === "COMPLAINT_PHOTO_TYPE", r.body);
const adminMailsBefore = await mails("adminNotification", "office@t.local");
r = await call("POST", `/customer/bookings/${jobA}/complaints`, { category: "quality", description: "Das Bad wurde nicht gereinigt, Küche nur halb.", photos: [{ name: "bad.png", dataUrl: tinyPng }] }, klaraT);
const cA = r.body.complaint?._id;
check("1f. customer files a complaint (with photo) → 201 open", r.status === 201 && r.body.complaint.status === "open" && r.body.complaint.photoCount === 1 && r.body.complaint.bookingRef === b.reference, r.body);
let c = await Complaint.findById(cA);
check("1g. complaint linked to booking, customer and cleaner; photo stored", String(c.worker) === String(anna._id) && String(c.customer) === String(klaraId) && c.photos.length === 1 && c.history[0].status === "open", c);
check("1h. admin notification email sent (ADMIN_NOTIFICATION_EMAIL)", (await mails("adminNotification", "office@t.local")) === adminMailsBefore + 1);
r = await call("POST", `/customer/bookings/${jobA}/complaints`, { category: "other", description: "Noch eine Beschwerde zum selben Termin." }, klaraT);
check("1i. second open complaint for the same booking → 409 COMPLAINT_OPEN", r.status === 409 && r.body.code === "COMPLAINT_OPEN", r.body);
r = await call("GET", `/customer/bookings/${jobA}/complaints`, null, klaraT);
check("1j. customer sees own complaint (no internal fields), canComplain false while open", r.body.complaints.length === 1 && r.body.canComplain === false && r.body.complaints[0].internalNotes === undefined && r.body.complaints[0].worker === undefined, r.body);

// ---------- 2. Permissions ----------
r = await call("POST", `/customer/bookings/${jobA}/complaints`, { category: "quality", description: "Fremde Buchung, das darf nicht gehen." }, ottoT);
check("2a. other customer cannot complain about Klara's booking → 404", r.status === 404, r.status);
r = await call("GET", `/customer/bookings/${jobA}/complaints`, null, ottoT);
check("2b. other customer cannot read Klara's complaints → 404", r.status === 404, r.status);
r = await call("GET", `/customer/bookings/${jobA}/complaints`);
check("2c. anonymous → 401", r.status === 401, r.status);
r = await call("GET", "/admin/complaints", null, klaraT);
check("2d. customer cannot use the admin list → 403", r.status === 403, r.status);
r = await call("GET", `/admin/complaints/${cA}`, null, annaT);
check("2e. cleaner cannot open the admin detail → 403", r.status === 403, r.status);
r = await call("POST", `/admin/complaints/${cA}/actions`, { type: "block" }, annaT);
check("2f. cleaner cannot take admin actions → 403", r.status === 403, r.status);
r = await call("GET", "/worker/jobs/complaints", null, annaT);
check("2g. cleaner sees the complaint neutrally (category/status, no customer text)", r.status === 200 && r.body.complaints.length === 1 && r.body.complaints[0].category === "quality" && r.body.complaints[0].description === undefined && !JSON.stringify(r.body).includes("Bad wurde") && r.body.counts.total === 1, r.body);
r = await call("GET", "/worker/jobs/complaints", null, benT);
check("2h. another cleaner does not see Anna's complaint", r.status === 200 && r.body.complaints.length === 0, r.body);
r = await call("GET", "/worker/jobs/complaints", null, klaraT);
check("2i. customer cannot use the cleaner endpoint → 403", r.status === 403, r.status);

// ---------- 3. Admin list / detail / review / notes ----------
r = await call("GET", "/admin/complaints?status=open", null, adminT);
check("3a. admin list filtered by status open", r.status === 200 && r.body.complaints.length === 1 && r.body.counts.open === 1 && r.body.workers.some((w) => String(w._id) === String(anna._id)), r.body);
r = await call("GET", `/admin/complaints?worker=${ben._id}`, null, adminT);
check("3b. admin list filtered by cleaner (Ben: none)", r.status === 200 && r.body.complaints.length === 0 && r.body.counts.total === 0, r.body);
r = await call("GET", `/admin/complaints/${cA}`, null, adminT);
check("3c. admin detail: booking, customer, cleaner, refundable amount, photo metadata, cleaner counts",
  r.status === 200 && r.body.complaint.booking?.reference === b.reference && r.body.complaint.customer?.email === "klara@t.local" && r.body.complaint.worker?.name === "Anna Nowak" &&
  r.body.complaint.refundableCents === priceCents && r.body.complaint.photos.length === 1 && r.body.complaint.photos[0].data === undefined && r.body.complaint.workerCounts?.total === 1,
  r.body);
const photoId = r.body.complaint.photos[0]._id;
const photoRes = await fetch(`${base}/admin/complaints/${cA}/photos/${photoId}`, { headers: { Authorization: `Bearer ${adminT}` } });
check("3d. admin downloads the photo (image/png)", photoRes.status === 200 && photoRes.headers.get("content-type") === "image/png");
const photoAnna = await fetch(`${base}/admin/complaints/${cA}/photos/${photoId}`, { headers: { Authorization: `Bearer ${annaT}` } });
check("3e. cleaner cannot download the photo → 403", photoAnna.status === 403);
r = await call("POST", `/admin/complaints/${cA}/review`, null, adminT);
check("3f. admin starts the review → in_review", r.status === 200 && r.body.complaint.status === "in_review" && r.body.complaint.history.length === 2, r.body);
r = await call("POST", `/admin/complaints/${cA}/notes`, { body: "Kundin angerufen, Fotos plausibel." }, adminT);
check("3g. internal note recorded", r.status === 201 && r.body.complaint.internalNotes.length === 1 && r.body.complaint.internalNotes[0].by?.name === "Admin", r.body);
r = await call("GET", `/customer/bookings/${jobA}/complaints`, null, klaraT);
check("3h. internal note is never shown to the customer", r.body.complaints[0].status === "in_review" && !JSON.stringify(r.body).includes("Kundin angerufen"), r.body);

// ---------- 4. Actions ----------
// (a) refund – partial, through the existing provider refund
const refundsBefore = stripeCalls.filter((x) => x.url === "/v1/refunds").length;
r = await call("POST", `/admin/complaints/${cA}/actions`, { type: "refund", amountCents: priceCents + 1 }, adminT);
check("4a. refund above the paid amount → 422 REFUND_TOO_HIGH", r.status === 422 && r.body.code === "REFUND_TOO_HIGH" && r.body.remainingCents === priceCents, r.body);
r = await call("POST", `/admin/complaints/${cA}/actions`, { type: "refund", amountCents: 2000, note: "Bad nicht gereinigt" }, adminT);
const refundCall = stripeCalls.filter((x) => x.url === "/v1/refunds").slice(refundsBefore)[0];
const payA = await Payment.findOne({ booking: jobA, purpose: "booking" });
b = await Booking.findById(jobA);
check("4b. partial refund 20 € → provider called with 2000, payment partially_refunded, logged",
  r.status === 201 && refundCall && /(^|&)amount=2000(&|$)/.test(refundCall.body) && payA.refundedCents === 2000 && payA.status === "partially_refunded" && b.payment.status === "partially_refunded" &&
  r.body.complaint.actions.some((a) => a.type === "refund" && a.amountCents === 2000 && a.refundId),
  { s: r.status, body: refundCall?.body, p: payA.status });
check("4c. cleaner's unpaid earning is put on hold after the refund", b.workerPayout?.status === "on_hold", b.workerPayout);
// (b) voucher – gift card for the customer
r = await call("POST", `/admin/complaints/${cA}/actions`, { type: "voucher", amountCents: 1500, note: "Entschuldigung" }, adminT);
const voucherAction = r.body.complaint?.actions?.find((a) => a.type === "voucher");
const card = voucherAction ? await GiftCard.findById(voucherAction.giftCard) : null;
check("4d. voucher 15 € → active gift card for Klara, emailed, logged", r.status === 201 && card?.status === "active" && card.balanceCents === 1500 && card.recipientEmail === "klara@t.local" && card.payment.method === "admin", { s: r.status, card });
r = await call("POST", `/admin/complaints/${cA}/actions`, { type: "voucher", amountCents: 100 }, adminT);
check("4e. voucher below 5 € → 422", r.status === 422, r.status);
// (c) restrictions – warning, suspension for N days, block
const restrictionMails = await mails("complaint_restriction", "anna@t.local");
r = await call("POST", `/admin/complaints/${cA}/actions`, { type: "warning", note: "Qualitätsregeln" }, adminT);
check("4f. warning recorded + cleaner email", r.status === 201 && (await mails("complaint_restriction", "anna@t.local")) === restrictionMails + 1, r.status);
r = await call("POST", `/admin/complaints/${cA}/actions`, { type: "suspend" }, adminT);
check("4g. suspension without days → 422", r.status === 422, r.status);
r = await call("POST", `/admin/complaints/${cA}/actions`, { type: "suspend", days: 7 }, adminT);
let annaDoc = await User.findById(anna._id);
const until = annaDoc.reliability?.pausedUntil;
check("4h. suspension 7 days → reliability pause until now + 7 days", r.status === 201 && annaDoc.reliability.pausedAt && until && Math.round((new Date(until) - Date.now()) / DAY_MS) === 7, annaDoc.reliability);
r = await call("GET", "/worker/jobs/open", null, annaT);
check("4i. suspended cleaner sees no open jobs", r.status === 200 && r.body.paused === true && r.body.jobs.length === 0, r.body);
r = await call("GET", "/worker/jobs/complaints", null, annaT);
check("4j. cleaner sees the restriction they received (suspend, 7 days)", r.body.complaints[0].restriction?.type === "suspend" && r.body.complaints[0].restriction.days === 7, r.body);
// suspension runs out by itself
await User.updateOne({ _id: anna._id }, { "reliability.pausedUntil": new Date(Date.now() - 1000) });
r = await call("GET", "/worker/jobs/open", null, annaT);
check("4k. after the suspension period the cleaner sees open jobs again", r.status === 200 && !r.body.paused, r.body);
// (d) re-clean / other need a note
r = await call("POST", `/admin/complaints/${cA}/actions`, { type: "reclean" }, adminT);
check("4l. re-clean without note → 422", r.status === 422, r.status);
r = await call("POST", `/admin/complaints/${cA}/actions`, { type: "reclean", note: "Nachreinigung am Freitag, kostenlos" }, adminT);
check("4m. free re-clean recorded", r.status === 201 && r.body.complaint.actions.some((a) => a.type === "reclean"), r.body);
r = await call("POST", `/admin/complaints/${cA}/actions`, { type: "other", note: "Blumen geschickt" }, adminT);
check("4n. other action with note recorded", r.status === 201 && r.body.complaint.actions.length === 6, r.body.complaint?.actions?.length);

// ---------- 5. Resolve → customer email ----------
const outcomeBefore = await mails("complaint_resolved", "klara@t.local");
r = await call("POST", `/admin/complaints/${cA}/resolve`, { message: "Wir haben dir 20 € erstattet, einen Gutschein geschickt und eine Nachreinigung eingeplant." }, adminT);
check("5a. resolve → status resolved, resolution message, customer notified", r.status === 200 && r.body.complaint.status === "resolved" && r.body.complaint.resolution.message.includes("erstattet") && r.body.complaint.customerNotifiedAt, r.body);
const outcomeMail = await EmailMessage.findOne({ template: "complaint_resolved", to: "klara@t.local" }).sort({ createdAt: -1 });
check("5b. customer email sent (mentions refund within 7 working days and the voucher code)", (await mails("complaint_resolved", "klara@t.local")) === outcomeBefore + 1 && /7 Werktagen/.test(outcomeMail.text) && outcomeMail.text.includes(card.code), outcomeMail?.text);
r = await call("POST", `/admin/complaints/${cA}/actions`, { type: "warning" }, adminT);
check("5c. no actions after closing → 409 COMPLAINT_CLOSED", r.status === 409 && r.body.code === "COMPLAINT_CLOSED", r.body);
r = await call("GET", `/customer/bookings/${jobA}/complaints`, null, klaraT);
const mine = r.body.complaints[0];
check("5d. customer sees status, resolution and remedies (refund/voucher/re-clean) but no restriction",
  mine.status === "resolved" && mine.resolution?.message.includes("erstattet") && mine.remedies.length === 3 && mine.remedies.some((x) => x.type === "voucher" && x.giftCardCode === card.code) && !mine.remedies.some((x) => ["warning", "suspend", "block"].includes(x.type)) && r.body.canComplain === true,
  r.body);

// ---------- 6. Reject + block (second complaint, other customer / cleaner) ----------
r = await call("POST", `/customer/bookings/${jobOtto}/complaints`, { category: "behaviour", description: "Die Reinigungskraft war sehr unfreundlich." }, ottoT);
const cB = r.body.complaint?._id;
check("6a. Otto files a complaint about Ben", r.status === 201, r.body);
r = await call("POST", `/admin/complaints/${cB}/reject`, { reason: "" }, adminT);
check("6b. reject without reason → 422", r.status === 422, r.status);
r = await call("POST", `/admin/complaints/${cB}/actions`, { type: "block", note: "Wiederholt" }, adminT);
const benDoc = await User.findById(ben._id);
check("6c. block → cleaner suspended and deactivated", r.status === 201 && benDoc.workerStatus === "suspended" && benDoc.isActive === false, { st: benDoc.workerStatus, a: benDoc.isActive });
const rejectBefore = await mails("complaint_rejected", "otto@t.local");
r = await call("POST", `/admin/complaints/${cB}/reject`, { reason: "Nach Rücksprache nicht nachvollziehbar." }, adminT);
check("6d. reject with reason → rejected + customer email", r.status === 200 && r.body.complaint.status === "rejected" && (await mails("complaint_rejected", "otto@t.local")) === rejectBefore + 1, r.body);
r = await call("GET", `/customer/bookings/${jobOtto}/complaints`, null, ottoT);
check("6e. customer sees the rejection reason", r.body.complaints[0].status === "rejected" && r.body.complaints[0].resolution.message.includes("nicht nachvollziehbar"), r.body);
r = await call("GET", "/admin/complaints", null, adminT);
check("6f. admin list counts (1 resolved, 1 rejected)", r.body.counts.resolved === 1 && r.body.counts.rejected === 1 && r.body.counts.total === 2, r.body.counts);

// ---------- 7. Privacy hook ----------
await anonymiseUser(await User.findById(ottoId), { actorId: null, reason: "test" });
c = await Complaint.findById(cB).select("+photos.data");
check("7. customer deletion anonymises the complaint text / resolution, keeps status and actions", c.description === "[gelöscht]" && c.resolution.message === "" && c.anonymisedAt && c.status === "rejected" && c.actions.length === 1, c);

const { failures, passes } = summary();
console.log(`\n${passes} passed, ${failures} failed`);
server.close();
fakeStripe.close();
await User.db.dropDatabase();
await User.db.close();
process.exit(failures ? 1 : 0);
