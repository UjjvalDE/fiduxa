// E2E for the instant-booking flow: admin slots → booking → Stripe checkout → webhook.
// Uses a throwaway MongoDB (27999) and a fake Stripe API (local HTTP server).
import http from "node:http";

import { ROOT, prepareEnv } from "../helpers/harness.mjs";
prepareEnv("fiduxa_e2e_booking");
process.env.HOURLY_RATE_CENTS = "3000"; // expectations below use €30/h
process.env.WORKER_INVITATION_URL = "http://localhost:3000/worker/einladung";

// ---- Fake Stripe API ----
let refundsShouldFail = false;
const stripeCalls = [];
const fakeStripe = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    stripeCalls.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/v1/checkout/sessions") {
      const id = "cs_test_" + Math.random().toString(36).slice(2, 10);
      return res.end(JSON.stringify({ id, object: "checkout.session", url: `https://checkout.stripe.test/${id}` }));
    }
    if (req.method === "POST" && /\/v1\/checkout\/sessions\/[^/]+\/expire/.test(req.url)) {
      return res.end(JSON.stringify({ id: "x", object: "checkout.session", status: "expired" }));
    }
    if (req.method === "POST" && req.url === "/v1/refunds") {
      if (refundsShouldFail) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: { type: "invalid_request_error", message: "refund failed (test)" } }));
      }
      return res.end(JSON.stringify({ id: "re_test_" + Date.now(), object: "refund" }));
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: { type: "invalid_request_error", message: "not mocked" } }));
  });
});
await new Promise((r) => fakeStripe.listen(0, r));
const stripePort = fakeStripe.address().port;

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");
const Stripe = require("stripe");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: Payment } = await import(ROOT + "/src/models/payment.model.js");
const { default: AvailabilitySlot } = await import(ROOT + "/src/models/availability-slot.model.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");
const { expireStaleHolds } = await import(ROOT + "/src/services/availability.service.js");
const { OPERATIONS } = await import(ROOT + "/src/config/pricing.js");

await connectDB();
await User.db.dropDatabase();
// Rebuild every index before testing (unique indexes back business rules)
for (const M of Object.values(User.db.models)) await M.syncIndexes(); // syncAllIndexes
await AvailabilitySlot.syncIndexes();
await (await import(ROOT + "/src/models/reservation-lock.model.js")).default.syncIndexes();
// Fixture: this suite exercises the card (Stripe) and cash flows that the owner switched off
// for now (POLICIES.paymentMethods.enabled = ["paypal"]); they are re-enabled for this test DB only.
await (await import(ROOT + "/src/models/settings.model.js")).default.updateOne({ key: "platform" }, { $set: { "policies.paymentMethods.enabled": ["paypal", "stripe", "cash"] } }, { upsert: true });
await (await import(ROOT + "/src/services/settings.service.js")).loadSettings();

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;

let failures = 0;
const check = (name, cond, extra) => {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra !== undefined ? "  → " + JSON.stringify(extra).slice(0, 400) : ""}`);
};
const call = async (method, path, body, token) => {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const login = async (email, password) => (await call("POST", "/auth/login", { email, password })).body.token;
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);

const pw = await bcrypt.hash("AdminPassword123", 12);
await User.create({ name: "Admin", email: "admin@test.local", password: pw, role: "admin" });
const worker = await User.create({
  name: "Worker One", email: "w1@test.local", password: pw, role: "worker",
  workerStatus: "approved", emailVerified: true,
  workerProfile: { address: "Teststr 1", serviceAreas: ["Mitte"] },
  bankAccountLast4: "1234", bankAccountHolder: "Worker One",
});
const adminToken = await login("admin@test.local", "AdminPassword123");
const workerToken = await login("w1@test.local", "AdminPassword123");

let r;

// ---------- Admin slots ----------
r = await call("POST", "/admin/slots", { from: day(1), to: day(7), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "12:00" }, { startTime: "13:00", endTime: "17:00" }], capacity: 1 }, adminToken);
check("admin bulk-creates 14 slots", r.status === 201 && r.body.created === 14, r.body);
r = await call("POST", "/admin/slots", { from: day(1), to: day(7), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "12:00" }], capacity: 1 }, adminToken);
check("re-creating skips existing", r.body.created === 0 && r.body.skipped === 7, r.body);
r = await call("POST", "/admin/slots", { from: day(1), to: day(2), weekdays: [1,2,3,4,5,6,7], times: [{ startTime: "10:00", endTime: "09:00" }], capacity: 1 }, adminToken);
check("end before start → 422", r.status === 422, r.body);
r = await call("POST", "/admin/slots", { from: day(-2), to: day(1), weekdays: [1,2,3,4,5,6,7], times: [{ startTime: "10:00" }], capacity: 1 }, adminToken);
check("slots in the past → 422", r.status === 422, r.body);
r = await call("GET", `/admin/slots?from=${day(1)}&to=${day(7)}`, null, adminToken);
check("admin lists slots", r.body.slots?.length === 14, r.body);

// ---------- Public availability ----------
r = await call("GET", "/bookings/availability/days");
check("available days = 7", r.body.data?.length === 7, r.body);
r = await call("GET", `/bookings/availability?date=${day(1)}&duration=240`);
const slotsDay1 = r.body.data;
check("2 slots tomorrow with times", slotsDay1?.length === 2 && slotsDay1[0].startTime === "08:00" && slotsDay1[0].endTime === "12:00", r.body);

// ---------- Customer ----------
r = await call("POST", "/auth/register", { name: "Kunde", email: "kunde@test.local", password: "Kunde12345", locale: "pl" });
const customerToken = r.body.token;
check("register with locale pl", r.status === 201 && r.body.user.preferredLanguage === "pl", r.body);

const body = (extra) => ({
  serviceId: "home-cleaning", areaM2: 75, extras: ["inside-fridge", "inside-oven"],
  name: "Kunde", email: "kunde@test.local", phone: "0301234567",
  postcode: "10115", address: "Invalidenstr. 1, Berlin",
  preferredDate: day(1), slotId: slotsDay1[0].id, earlyStartConsent: true, locale: "pl", ...extra,
});

r = await call("POST", "/bookings", body({ earlyStartConsent: undefined }), customerToken);
check("booking without early-start consent → 422", r.status === 422, r.body);
r = await call("POST", "/bookings", body({ slotId: slotsDay1[1].id, preferredDate: day(2) }), customerToken);
check("slot from another day → 409", r.status === 409, r.body);

// Invoice mode (no Stripe)
r = await call("POST", "/bookings", body(), customerToken);
check("invoice mode: booking confirmed immediately", r.status === 201 && r.body.booking.status === "confirmed" && r.body.checkoutUrl === null, r.body);
check("price snapshot €120", r.body.booking?.estimate?.totalCents === 12000, r.body.booking?.estimate);
const invoiceBooking = r.body.booking?.id;
check("slot stored as time", r.body.booking?.slot === "08:00" && r.body.booking?.slotEnd === "12:00", r.body.booking);
r = await call("POST", "/bookings", body(), customerToken);
check("full slot → 409", r.status === 409, r.body);
r = await call("GET", `/bookings/availability?date=${day(1)}&duration=240`);
check("slot now unavailable", !r.body.data?.some((s) => s.startTime === "08:00"), r.body);
r = await call("PATCH", `/admin/slots/${slotsDay1[0].id}`, { capacity: 0 }, adminToken);
check("capacity below booked → 409", r.status === 409, r.body);
r = await call("DELETE", `/admin/slots/${slotsDay1[0].id}`, null, adminToken);
check("delete slot with booking → 409", r.status === 409, r.body);

// The booking is tomorrow 08:00 – between 8 and 32 hours away depending on the
// hour this suite runs at. Widen the cutoff so it is always "too late" here.
const savedCancelCutoff = OPERATIONS.cancellationCutoffHours;
OPERATIONS.cancellationCutoffHours = 48;
r = await call("POST", `/customer/bookings/${invoiceBooking}/cancel`, { reason: "test" }, customerToken);
check("customer cannot cancel < 24 h before → 409", r.status === 409, r.body);
OPERATIONS.cancellationCutoffHours = savedCancelCutoff;
r = await call("PATCH", `/admin/bookings/${invoiceBooking}/status`, { status: "cancelled", note: "Kunde angerufen" }, adminToken);
check("admin cancels confirmed booking", r.body.booking?.status === "cancelled", r.body);
r = await call("GET", `/bookings/availability?date=${day(1)}`);
check("cancel releases the slot", r.body.data?.[0]?.available === true, r.body);

// ---------- Stripe mode ----------
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.STRIPE_API_BASE = `http://127.0.0.1:${stripePort}`;
const stripe = new Stripe("sk_test_dummy");
const sendWebhook = async (event, secret = "whsec_test_secret") => {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(base + "/payments/webhook", {
    method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": header }, body: payload,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const paidEvent = (sessionId, amount) => ({
  id: "evt_" + Math.random(), type: "checkout.session.completed",
  data: { object: { id: sessionId, object: "checkout.session", amount_total: amount, currency: "eur", payment_status: "paid", payment_intent: "pi_" + sessionId } },
});

const day5Slot = (await call("GET", `/bookings/availability?date=${day(5)}`)).body.data[0].id;
r = await call("POST", "/bookings", body({ preferredDate: day(5), slotId: day5Slot }), customerToken);
check("stripe mode: booking payment_pending + checkout url", r.status === 201 && r.body.booking.status === "payment_pending" && r.body.checkoutUrl?.startsWith("https://checkout.stripe.test/"), r.body);
const b1 = r.body.booking?.id;
check("hold set ~35 min", r.body.booking?.holdExpiresAt && new Date(r.body.booking.holdExpiresAt) > new Date(Date.now() + 30 * 60 * 1000), r.body.booking);
let p1 = await Payment.findOne({ booking: b1 });
check("payment record created", p1?.status === "created" && p1.amountCents === 12000, p1);
r = await call("POST", "/payments/checkout", { bookingId: b1 }, customerToken);
check("retry reuses open checkout", r.status === 200 && r.body.url === p1.checkoutUrl, r.body);

r = await sendWebhook(paidEvent(p1.checkoutSessionId, 12000), "whsec_wrong");
check("bad signature → 400", r.status === 400, r);
r = await sendWebhook(paidEvent(p1.checkoutSessionId, 12000));
let bk = await Booking.findById(b1);
check("webhook → paid + confirmed", r.status === 200 && bk.status === "confirmed" && bk.payment.status === "paid" && bk.holdExpiresAt === null, { s: bk.status, p: bk.payment });
await sendWebhook(paidEvent(p1.checkoutSessionId, 12000));
bk = await Booking.findById(b1);
check("replay idempotent", bk.statusHistory.filter((h) => h.status === "confirmed").length === 1, bk.statusHistory);

// hold expiry → slot released → late payment re-takes slot
r = await call("POST", "/bookings", body({ preferredDate: day(2), slotId: (await call("GET", `/bookings/availability?date=${day(2)}`)).body.data[0].id }), customerToken);
const b2 = r.body.booking?.id;
const p2 = await Payment.findOne({ booking: b2 });
await Booking.updateOne({ _id: b2 }, { holdExpiresAt: new Date(Date.now() - 1000) });
const expired = await expireStaleHolds();
bk = await Booking.findById(b2);
check("stale hold expires and frees slot", expired === 1 && bk.status === "expired" && bk.slotReleased === true, bk);
r = await call("POST", "/payments/checkout", { bookingId: b2 }, customerToken);
check("checkout on expired → 409", r.status === 409, r.body);
await sendWebhook(paidEvent(p2.checkoutSessionId, 12000));
bk = await Booking.findById(b2);
check("late payment re-takes free slot → confirmed", bk.status === "confirmed" && bk.payment.status === "paid" && bk.slotReleased === false, { s: bk.status, p: bk.payment });

// late payment when slot was taken by someone else → automatic refund
const day3Slot = (await call("GET", `/bookings/availability?date=${day(3)}`)).body.data[0].id;
r = await call("POST", "/bookings", body({ preferredDate: day(3), slotId: day3Slot }), customerToken);
const b3 = r.body.booking?.id;
const p3 = await Payment.findOne({ booking: b3 });
await Booking.updateOne({ _id: b3 }, { holdExpiresAt: new Date(Date.now() - 1000) });
await expireStaleHolds();
r = await call("POST", "/bookings", body({ preferredDate: day(3), slotId: day3Slot }), customerToken);
check("freed slot can be booked again", r.status === 201, r.body);
await sendWebhook(paidEvent(p3.checkoutSessionId, 12000));
bk = await Booking.findById(b3);
check("late payment, slot gone → auto refunded", bk.status === "expired" && bk.payment.status === "refunded", { s: bk.status, p: bk.payment });

// customer cancels paid booking → automatic refund
r = await call("POST", `/customer/bookings/${b1}/cancel`, {}, customerToken);
bk = await Booking.findById(b1);
check("cancel paid booking → refunded automatically", r.body.refunded === true && bk.payment.status === "refunded", { r: r.body, p: bk.payment });

// refund failure → refund_pending
refundsShouldFail = true;
r = await call("POST", `/customer/bookings/${b2}/cancel`, {}, customerToken);
bk = await Booking.findById(b2);
check("refund failure → refund_pending", bk.status === "cancelled" && bk.payment.status === "refund_pending", bk.payment);
refundsShouldFail = false;

// amount mismatch
const day4Slot = (await call("GET", `/bookings/availability?date=${day(4)}`)).body.data[0].id;
r = await call("POST", "/bookings", body({ preferredDate: day(4), slotId: day4Slot }), customerToken);
const b4 = r.body.booking?.id;
const p4 = await Payment.findOne({ booking: b4 });
await sendWebhook(paidEvent(p4.checkoutSessionId, 100));
check("amount mismatch not accepted", (await Payment.findById(p4._id)).status === "failed" && (await Booking.findById(b4)).status === "payment_pending");

// ---------- Admin + worker ----------
r = await call("PATCH", `/admin/bookings/${b4}/status`, { status: "confirmed", note: "Zahlung per Überweisung" }, adminToken);
check("admin manually confirms (invoice)", r.body.booking?.status === "confirmed" && r.body.booking?.payment?.method === "invoice", r.body);
r = await call("PATCH", `/admin/bookings/${b4}/assign`, { workerId: String(worker._id) }, adminToken);
check("assign worker to confirmed booking", r.status === 200, r.body);
await Booking.updateOne({ _id: b4 }, { preferredDate: todayInBerlin() });
r = await call("POST", `/worker/jobs/${b4}/start`, null, workerToken);
check("worker starts job", r.body.job?.status === "in_progress", r.body);
r = await call("GET", `/worker/jobs/${b4}`, null, workerToken);
check("worker job shows slot time", r.body.job?.slot === "08:00" && r.body.job?.slotEnd === "12:00", r.body.job);
r = await call("POST", `/worker/jobs/${b4}/complete`, { note: "ok" }, workerToken);
check("worker completes job", r.body.job?.status === "completed", r.body);

r = await call("GET", "/admin/dashboard/stats", null, adminToken);
check("dashboard stats", r.body.stats?.refundsPending === 1 && r.body.stats?.paidRevenueCents === 0 && r.body.stats?.nextSevenDays?.slots === 14, r.body.stats);
r = await call("GET", "/admin/bookings/" + b4, null, adminToken);
check("admin booking detail", r.status === 200 && r.body.booking.locale === "pl", r.body.booking?.locale);
r = await call("POST", `/admin/bookings/${b4}/quotation`, { amountCents: 1, validUntil: day(3) }, adminToken);
check("quotation endpoint removed → 404", r.status === 404, r);

r = await call("GET", "/pricing");
check("pricing exposes hold & cutoff", r.body.pricing?.holdMinutes === 35 && r.body.pricing?.cancellationCutoffHours === 24, r.body);
r = await call("PATCH", "/users/me", { preferredLanguage: "en" }, customerToken);
check("change preferred language", r.body.user?.preferredLanguage === "en", r.body);

console.log(`\nStripe calls: ${stripeCalls.length}`);
console.log(`${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
await User.db.dropDatabase();
server.close();
fakeStripe.close();
process.exit(failures ? 1 : 0);
