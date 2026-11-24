// E2E: invoices on completion, post-service feedback pop-ups (customer +
// cleaner, cleaner answers internal only, admin averages + CSV), cleaner
// extra-time requests (approve → duration/price/pay link/cleaner pay,
// decline, expiry) and the PayPal-only payment-method policy.
// PayPal is a local mock; no real payments, separate test DB.
import { ROOT, prepareEnv, createChecker, apiClient, startPayPalMock } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_feedback_extratime");
const paypal = await startPayPalMock();
process.env.PAYPALAPIKEY = "mock-client";
process.env.PAYPALSECRET_KEY = "mock-secret";
process.env.PAYPAL_API_BASE = paypal.url;

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: JobFeedback } = await import(ROOT + "/src/models/job-feedback.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { expireStaleExtraTimeRequests } = await import(ROOT + "/src/services/extra-time.service.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
await loadSettings(); // defaults: PayPal only
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);

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
r = await call("POST", "/auth/register", { name: "Other Otto", email: "otto@t.local", password: "Password12345" });
const ottoT = r.body.token;
await call("POST", "/admin/slots", { from: day(1), to: day(10), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00" }, { startTime: "13:00" }], capacity: 5 }, adminT);

const slotsOf = async (d) => (await call("GET", `/bookings/availability?date=${d}`)).body.data;
const book = async (d, startTime, extra = {}) => {
  const slot = (await slotsOf(d)).find((s) => s.startTime === startTime);
  return call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, name: "Kunde Klara", email: "klara@t.local", phone: "030123456", postcode: "10115",
    address: "Invalidenstr. 5", preferredDate: d, slotId: slot.id, earlyStartConsent: true, ...extra,
  }, custT);
};
const paidBooking = async (d, startTime) => {
  const res = await book(d, startTime, { paymentMethod: "paypal" });
  const id = res.body.booking?.id;
  const orderId = new URL(res.body.checkoutUrl).searchParams.get("token");
  await call("POST", "/payments/paypal/capture", { bookingId: id, orderId }, custT);
  return id;
};
// Accept + move to today + start (job in progress)
const runJob = async (id) => {
  await call("POST", `/worker/jobs/${id}/accept`, null, annaT);
  await Booking.updateOne({ _id: id }, { preferredDate: todayInBerlin() });
  return call("POST", `/worker/jobs/${id}/start`, null, annaT);
};

// ---------- PayPal-only policy ----------
r = await call("GET", "/payments/config");
check("payment config: only PayPal selectable, cash hidden", JSON.stringify(r.body.methods) === '["paypal"]' && JSON.stringify(r.body.bookingMethods) === '["paypal"]' && r.body.cashEnabled === false, r.body);
r = await call("GET", "/admin/settings", null, adminT);
check("admin settings expose policies.paymentMethods.enabled = [paypal]", JSON.stringify(r.body.settings?.policies?.paymentMethods?.enabled ?? r.body.policies?.paymentMethods?.enabled) === '["paypal"]', r.body.settings?.policies ?? r.body.policies);
r = await book(day(2), "08:00", { paymentMethod: "cash" });
check("cash booking rejected → 422 PAYMENT_METHOD_DISABLED", r.status === 422 && r.body.code === "PAYMENT_METHOD_DISABLED", r.body);
r = await book(day(2), "08:00", { paymentMethod: "stripe" });
check("card/Stripe booking rejected → 422 PAYMENT_METHOD_DISABLED", r.status === 422 && r.body.code === "PAYMENT_METHOD_DISABLED", r.body);
r = await call("POST", "/gift-cards", { amountCents: 5000, recipientName: "Rita", recipientEmail: "rita@t.local", senderName: "Klara", method: "stripe" }, custT);
check("gift card with Stripe rejected → 422 PAYMENT_METHOD_DISABLED", r.status === 422 && r.body.code === "PAYMENT_METHOD_DISABLED", r.body);
const custId = (await User.findOne({ email: "klara@t.local" }))._id;
r = await call("POST", "/admin/bookings", {
  customerId: String(custId), serviceId: "home-cleaning", areaM2: 60, frequency: "one-time", preferredDate: day(3), startTime: "08:00",
  slotId: (await slotsOf(day(3))).find((s) => s.startTime === "08:00").id,
  customerDetails: { phone: "030123456", postcode: "10115", address: "Invalidenstr. 5" }, paymentMethod: "cash",
}, adminT);
check("admin manual cash booking rejected → 422 PAYMENT_METHOD_DISABLED", r.status === 422 && r.body.code === "PAYMENT_METHOD_DISABLED", r.body);
r = await book(day(2), "08:00", { paymentMethod: "paypal" });
check("PayPal booking accepted → payment_pending + PayPal link", r.status === 201 && /paypal\.com/.test(r.body.checkoutUrl ?? ""), r.body);
const ppId = r.body.booking.id;
const ppOrder = new URL(r.body.checkoutUrl).searchParams.get("token");
r = await call("POST", "/payments/checkout", { bookingId: ppId, method: "stripe" }, custT);
check("checkout retry with Stripe rejected → 422", r.status === 422 && r.body.code === "PAYMENT_METHOD_DISABLED", r.body);
r = await call("POST", "/payments/paypal/capture", { bookingId: ppId, orderId: ppOrder }, custT);
check("PayPal capture → confirmed + paid", r.status === 200 && (await Booking.findById(ppId)).payment.status === "paid", r.body);
// Existing booking with a now-disabled method keeps working
const legacy = await Booking.findById(ppId).lean();
await Booking.updateOne({ _id: ppId }, { $set: { "payment.method": "stripe" } });
r = await call("GET", `/customer/bookings/${ppId}`, null, custT);
check("existing Stripe booking still readable (display)", r.status === 200 && r.body.booking.payment.method === "stripe", r.status);
await Booking.updateOne({ _id: ppId }, { $set: { "payment.method": legacy.payment.method } });
r = await call("PUT", "/admin/settings", { policies: { ...(await call("GET", "/admin/settings", null, adminT)).body.settings.policies, paymentMethods: { enabled: [] } } }, adminT);
check("policy needs at least one method → 422", r.status === 422, r.status);

// ---------- Extra time: approve ----------
const jobA = await paidBooking(day(2), "13:00");
let b = await Booking.findById(jobA);
const origMinutes = b.estimate.durationMinutes;
const origTotal = b.pricing.totalCents;
const origEnd = b.slotEnd;
await call("POST", `/worker/jobs/${jobA}/accept`, null, annaT);
r = await call("POST", `/worker/jobs/${jobA}/extra-time`, { minutes: 30, reason: "Küche stärker verschmutzt als angegeben" }, annaT);
check("extra time before start → 409", r.status === 409, r.body);
r = await runJob(jobA);
check("job started", r.status === 200, r.body);
r = await call("POST", `/worker/jobs/${jobA}/extra-time`, { minutes: 30 }, annaT);
check("reason required → 400/422", r.status === 400 || r.status === 422, r.status);
r = await call("POST", `/worker/jobs/${jobA}/extra-time`, { minutes: 20, reason: "Küche stärker verschmutzt" }, annaT);
check("minutes must be 15-min steps", r.status === 400 || r.status === 422, r.status);
r = await call("POST", `/worker/jobs/${jobA}/extra-time`, { minutes: 30, reason: "Küche stärker verschmutzt als angegeben" }, annaT);
const reqA = r.body.request;
check("cleaner requests 30 min → 201, proposed, expires in ~2 h", r.status === 201 && reqA.status === "proposed" && Math.abs(new Date(reqA.expiresAt) - Date.now() - 2 * 3600e3) < 60e3, r.body);
r = await call("POST", `/worker/jobs/${jobA}/extra-time`, { minutes: 15, reason: "Noch ein Zimmer dazu" }, annaT);
check("second open request → 409", r.status === 409, r.body);
r = await call("GET", `/customer/bookings/${jobA}`, null, custT);
const shown = r.body.booking.priceAdjustments.find((a) => String(a._id) === String(reqA.id));
check("customer sees request with reason, minutes, price, origin cleaner", shown?.origin === "cleaner" && shown.reason.startsWith("Küche") && shown.minutes === 30 && shown.deltaCents > 0 && shown.status === "proposed", shown);
const { default: Email } = await import(ROOT + "/src/models/email.model.js");
check("customer emailed about the request", (await Email.countDocuments({ template: "extraTime.request", to: "klara@t.local" })) === 1);
r = await call("POST", `/customer/bookings/${jobA}/adjustments/${reqA.id}`, { decision: "approve" }, ottoT);
check("other customer cannot decide → 404", r.status === 404, r.status);
const ordersBefore = paypal.created;
r = await call("POST", `/customer/bookings/${jobA}/adjustments/${reqA.id}`, { decision: "approve" }, custT);
b = await Booking.findById(jobA);
const adjA = b.priceAdjustments.id(reqA.id);
check("approve → duration +30, price + delta, end time moved", r.status === 200 && b.estimate.durationMinutes === origMinutes + 30 && b.pricing.totalCents === origTotal + adjA.deltaCents && b.slotEnd !== origEnd && b.slotEnd === adjA.newSlotEnd, { s: r.status, d: b.estimate.durationMinutes, t: b.pricing.totalCents, e: b.slotEnd });
check("approve → PayPal pay link for the extra amount", adjA.status === "open" && /paypal\.com/.test(adjA.checkoutUrl) && paypal.created === ordersBefore + 1, adjA);
check("response returns new end time + final price", r.body.slotEnd === b.slotEnd && r.body.totalCents === b.pricing.totalCents, r.body);
check("both parties informed (customer + cleaner mails)", (await Email.countDocuments({ template: "extraTime.approved" })) === 1 && (await Email.countDocuments({ template: "extraTime.worker.approved", to: "anna@t.local" })) === 1);
const adjOrder = new URL(adjA.checkoutUrl).searchParams.get("token");
check("PayPal order amount = extra charge", paypal.orders.get(adjOrder)?.amount.value === (adjA.deltaCents / 100).toFixed(2), paypal.orders.get(adjOrder)?.amount);
r = await call("POST", "/payments/paypal/capture", { bookingId: jobA, orderId: adjOrder }, custT);
b = await Booking.findById(jobA);
check("extra amount paid via PayPal → adjustment paid", r.status === 200 && r.body.adjustmentPaid === true && b.priceAdjustments.id(reqA.id).status === "paid", r.body);
r = await call("POST", `/customer/bookings/${jobA}/adjustments/${reqA.id}`, { decision: "decline" }, custT);
check("decided request cannot be decided again → 409", r.status === 409, r.status);
r = await call("GET", `/worker/jobs/${jobA}`, null, annaT);
check("cleaner sees request status (no prices)", r.body.job.extraTimeRequests?.[0]?.status === "paid" && !("deltaCents" in r.body.job.extraTimeRequests[0]), r.body.job.extraTimeRequests);

// ---------- Completion: invoice + cleaner pay incl. extra time + feedback flag ----------
r = await call("POST", `/worker/jobs/${jobA}/complete`, { note: "fertig" }, annaT);
b = await Booking.findById(jobA);
check("completion response asks the cleaner app for feedback", r.status === 200 && r.body.feedbackPending === true, r.body);
check("cleaner pay based on the raised price", b.workerPayout.grossCents === b.pricing.totalCents && b.workerPayout.amountCents > 0, b.workerPayout);
check("completed paid booking has an invoice", Boolean(b.invoice?.number), b.invoice);
r = await call("GET", "/customer/invoices", null, custT);
const invA = r.body.invoices?.find((i) => String(i.bookingId) === String(jobA));
check("invoice list: service, date, duration, amount, payment status", invA && invA.serviceId === "home-cleaning" && invA.preferredDate && invA.durationMinutes === origMinutes + 30 && invA.totalCents > 0 && invA.paymentStatus === "paid", invA);
const pdf = await fetch(`${base}/customer/bookings/${jobA}/invoice`, { headers: { Authorization: `Bearer ${custT}` } });
check("invoice PDF download", pdf.status === 200 && pdf.headers.get("content-type") === "application/pdf", pdf.status);

// Invoice for a completed booking without online payment (gift card / invoice mode) → issued on completion
const jobInv = (await paidBooking(day(4), "08:00"));
await Booking.updateOne({ _id: jobInv }, { $set: { "payment.method": "invoice", "payment.status": "unpaid" }, $unset: { invoice: 1 } });
await runJob(jobInv);
r = await call("POST", `/worker/jobs/${jobInv}/complete`, {}, annaT);
b = await Booking.findById(jobInv);
check("unpaid completed booking gets its invoice automatically on completion", r.status === 200 && Boolean(b.invoice?.number), b.invoice);
r = await call("GET", "/customer/invoices", null, custT);
check("list shows it with its open payment status", r.body.invoices?.find((i) => String(i.bookingId) === String(jobInv))?.paymentStatus === "unpaid", r.body.invoices?.map((i) => i.paymentStatus));

// ---------- Extra time: decline + expiry ----------
const jobB = await paidBooking(day(3), "13:00");
await runJob(jobB);
r = await call("POST", `/worker/jobs/${jobB}/extra-time`, { minutes: 60, reason: "Mehr Räume als gebucht" }, annaT);
const reqB = r.body.request;
const totalB = (await Booking.findById(jobB)).pricing.totalCents;
r = await call("POST", `/customer/bookings/${jobB}/adjustments/${reqB.id}`, { decision: "decline" }, custT);
b = await Booking.findById(jobB);
check("decline → declined, duration + price unchanged", r.status === 200 && b.priceAdjustments.id(reqB.id).status === "declined" && b.pricing.totalCents === totalB, b.priceAdjustments);
check("cleaner told to finish within the original time", (await Email.countDocuments({ template: "extraTime.worker.declined", to: "anna@t.local" })) === 1);
r = await call("POST", `/worker/jobs/${jobB}/extra-time`, { minutes: 15, reason: "Nur noch das Bad fertig" }, annaT);
const reqB2 = r.body.request;
await Booking.updateOne({ _id: jobB, "priceAdjustments._id": reqB2.id }, { $set: { "priceAdjustments.$.expiresAt": new Date(Date.now() - 1000) } });
r = await call("POST", `/customer/bookings/${jobB}/adjustments/${reqB2.id}`, { decision: "approve" }, custT);
b = await Booking.findById(jobB);
check("late answer → 409 EXTRA_TIME_EXPIRED, nothing charged", r.status === 409 && r.body.code === "EXTRA_TIME_EXPIRED" && b.priceAdjustments.id(reqB2.id).status === "expired" && b.pricing.totalCents === totalB, r.body);
r = await call("POST", `/worker/jobs/${jobB}/extra-time`, { minutes: 15, reason: "Fenster dauern länger" }, annaT);
const reqB3 = r.body.request;
await Booking.updateOne({ _id: jobB, "priceAdjustments._id": reqB3.id }, { $set: { "priceAdjustments.$.expiresAt": new Date(Date.now() - 1000) } });
const swept = await expireStaleExtraTimeRequests();
b = await Booking.findById(jobB);
check("scheduler sweep expires unanswered requests + notifies cleaner", swept === 1 && b.priceAdjustments.id(reqB3.id).status === "expired" && (await Email.countDocuments({ template: "extraTime.worker.expired" })) >= 2, { swept });
r = await call("POST", `/worker/jobs/${jobB}/extra-time`, { minutes: 15, reason: "Letzter Raum braucht länger" }, annaT);
const reqB4 = r.body.request;
await call("POST", `/worker/jobs/${jobB}/complete`, {}, annaT);
b = await Booking.findById(jobB);
check("job completion expires the open request", b.priceAdjustments.id(reqB4.id).status === "expired", b.priceAdjustments.id(reqB4.id));

// ---------- Feedback pop-ups ----------
r = await call("GET", "/customer/bookings/feedback/pending", null, custT);
const pendingIds = (r.body.pending ?? []).map((p) => String(p.bookingId));
check("customer sees pending feedback for completed cleanings", r.status === 200 && pendingIds.includes(String(jobA)) && pendingIds.includes(String(jobB)), r.body);
r = await call("GET", "/customer/bookings/feedback/pending", null, ottoT);
check("other customer has no pending feedback", r.body.pending?.length === 0, r.body);
r = await call("POST", `/customer/bookings/${jobA}/review`, {
  rating: 5, comment: "Super", overallExperience: 4, professionalPunctual: 5, completedAsExpected: "partly", issueTags: ["missed_areas"], issueText: "Balkon vergessen",
}, custT);
check("customer submits feedback (review + structured answers)", r.status === 201, r.body);
let fb = await JobFeedback.findOne({ booking: jobA, role: "customer" }).lean();
check("structured customer feedback stored as numbers/enums", fb?.customerAnswers.overallExperience === 4 && fb.customerAnswers.cleanerRating === 5 && fb.customerAnswers.completedAsExpected === "partly" && fb.customerAnswers.issueTags[0] === "missed_areas" && fb.postcode === "10115", fb);
r = await call("POST", `/customer/bookings/${jobA}/review`, { rating: 4, completedAsExpected: "maybe" }, custT);
check("invalid enum → 400/422", r.status === 400 || r.status === 422, r.status);
r = await call("POST", `/customer/bookings/${jobB}/feedback/dismiss`, null, custT);
check("customer dismisses pop-up", r.status === 200, r.body);
r = await call("GET", "/customer/bookings/feedback/pending", null, custT);
check("pop-up gone after submit / dismiss", !(r.body.pending ?? []).some((p) => [String(jobA), String(jobB)].includes(String(p.bookingId))), r.body.pending);
r = await call("POST", `/customer/bookings/${jobA}/feedback/dismiss`, null, ottoT);
check("other customer cannot dismiss → 404", r.status === 404, r.status);

r = await call("GET", "/worker/jobs/feedback/pending", null, annaT);
check("cleaner sees pending feedback", (r.body.pending ?? []).some((p) => String(p.bookingId) === String(jobA)), r.body);
const workerAnswers = { experience: 4, customerRating: 2, homeCondition: 2, cooperative: 3, hadDifficulties: true, difficultyTags: ["very_dirty", "time_too_short"], difficultyText: "Sehr viel Fett in der Küche", conditionTags: ["clutter"], jobDifficulty: 5 };
r = await call("POST", `/worker/jobs/${jobA}/feedback`, { ...workerAnswers, jobDifficulty: 7 }, annaT);
check("cleaner feedback validated (1–5) → 400/422", r.status === 400 || r.status === 422, r.status);
r = await call("POST", `/worker/jobs/${jobA}/feedback`, workerAnswers, annaT);
check("cleaner submits internal feedback", r.status === 201, r.body);
r = await call("POST", `/worker/jobs/${jobA}/feedback`, workerAnswers, annaT);
check("second submit → 409", r.status === 409, r.status);
r = await call("POST", `/worker/jobs/${jobB}/feedback/dismiss`, null, annaT);
r = await call("GET", "/worker/jobs/feedback/pending", null, annaT);
check("cleaner pop-up gone after submit / dismiss", !(r.body.pending ?? []).some((p) => [String(jobA), String(jobB)].includes(String(p.bookingId))), r.body.pending);

// Internal only: nothing of the cleaner's answers reaches the customer
const leakKeys = /customerRating|homeCondition|cooperative|jobDifficulty|Sehr viel Fett|very_dirty/;
const custViews = [
  await call("GET", `/customer/bookings/${jobA}`, null, custT),
  await call("GET", "/bookings/my-bookings", null, custT),
  await call("GET", "/customer/invoices", null, custT),
  await call("GET", "/customer/bookings/feedback/pending", null, custT),
  await call("GET", "/users/me/export", null, custT),
];
check("cleaner's customer rating never shown to the customer (booking, list, invoices, export)", custViews.every((v) => !leakKeys.test(JSON.stringify(v.body))), custViews.map((v) => v.status));
r = await call("GET", "/admin/feedback", null, custT);
check("customer cannot open admin feedback → 403", r.status === 403, r.status);

// ---------- Admin evaluation ----------
r = await call("GET", "/admin/feedback", null, adminT);
const perCleaner = r.body.perCleaner?.[0];
const perCustomer = r.body.perCustomer?.[0];
check("admin: averages per cleaner", perCleaner?.name === "Anna Nowak" && perCleaner.overallExperience === 4 && perCleaner.cleanerRating === 5 && perCleaner.notAsExpected === 1, perCleaner);
check("admin: averages per customer (internal)", perCustomer?.email === "klara@t.local" && perCustomer.customerRating === 2 && perCustomer.homeCondition === 2 && perCustomer.jobDifficulty === 5 && perCustomer.withDifficulties === 1, perCustomer);
check("admin: per district (postcode)", r.body.perDistrict?.[0]?.postcode === "10115" && r.body.perDistrict[0].customer?.count === 1 && r.body.perDistrict[0].worker?.count === 1, r.body.perDistrict);
check("admin: problem-tag counts", r.body.tags?.customerIssues?.[0]?.tag === "missed_areas" && r.body.tags.workerDifficulties.length === 2 && r.body.tags.workerConditions[0]?.tag === "clutter", r.body.tags);
check("admin: dismissed counted separately", r.body.dismissed?.customer === 1 && r.body.dismissed?.worker === 1, r.body.dismissed);
const csvRes = await fetch(`${base}/admin/feedback/export.csv`, { headers: { Authorization: `Bearer ${adminT}` } });
const csv = await csvRes.text();
check("CSV export: header + one row per submitted feedback", csvRes.status === 200 && /text\/csv/.test(csvRes.headers.get("content-type")) && csv.trim().split("\r\n").length === 3 && csv.includes("very_dirty|time_too_short"), csv.slice(0, 300));

// ---------- Saved address card (future bookings only) ----------
r = await call("PUT", "/users/me/address", { address: "Torstr. 1", postcode: "80331", city: "München" }, custT);
check("address outside Berlin → 400/422", r.status === 400 || r.status === 422, r.status);
const invNumberBefore = (await Booking.findById(jobA)).invoice.number;
r = await call("PUT", "/users/me/address", { address: "Torstr. 1", postcode: "10119", city: "Berlin", floor: "3. OG links", accessNotes: "Klingel Nowak", billing: { name: "Klara GmbH", address: "Hauptstr. 9", postcode: "80331", city: "München" } }, custT);
check("address saved (service + billing)", r.status === 200 && r.body.address.postcode === "10119" && r.body.address.billing?.city === "München", r.body);
await call("PUT", "/users/me/household", { areaM2: 70 }, custT);
r = await call("GET", "/users/me/address", null, custT);
check("household save keeps the address card fields", r.body.address.floor === "3. OG links" && r.body.address.billing?.name === "Klara GmbH", r.body);
b = await Booking.findById(jobA);
check("existing (invoiced) booking keeps its address", b.customerDetails.postcode === "10115" && b.invoice.number === invNumberBefore, b.customerDetails);

server.close();
await paypal.close?.();
await User.db.dropDatabase();
await User.db.close();
const { failures, passes } = summary();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
