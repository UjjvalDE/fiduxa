// E2E: money policies – cancellation fees (free / 20 %, single tier) with partial
// refunds and cleaner compensation, admin partial refunds, cash limits and
// cash-tier rules, cash mismatch flag, price-delta settlement after edits,
// duration adjustments approved by the customer, monthly payout eligibility (5th),
// permissions. Fake Stripe API + throwaway MongoDB (27999). NO real money.
import http from "node:http";

import { ROOT, prepareEnv, createChecker, apiClient } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_money");
process.env.EMAIL_TRANSPORT = "json";

// ---- Fake Stripe API (records request bodies so refund amounts can be asserted) ----
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
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
// Fixture: this suite exercises the card (Stripe) and cash flows that the owner switched off
// for now (POLICIES.paymentMethods.enabled = ["paypal"]); they are re-enabled for this test DB only.
await (await import(ROOT + "/src/models/settings.model.js")).default.updateOne({ key: "platform" }, { $set: { "policies.paymentMethods.enabled": ["paypal", "stripe", "cash"] } }, { upsert: true });
await loadSettings();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);

const stripe = new Stripe("sk_test_dummy");
const sendWebhook = async (sessionId, amount) => {
  const payload = JSON.stringify({
    id: "evt_" + Math.random(),
    type: "checkout.session.completed",
    data: { object: { id: sessionId, object: "checkout.session", amount_total: amount, currency: "eur", payment_status: "paid", payment_intent: "pi_" + sessionId } },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
  const res = await fetch(base + "/payments/webhook", { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": header }, body: payload });
  return res.status;
};

// ---------- Fixtures ----------
const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const mkWorker = (name, email) =>
  User.create({
    name, email, password: pw, role: "worker", workerStatus: "approved", emailVerified: true,
    workerProfile: { address: "Str 1", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: name,
  });
const anna = await mkWorker("Anna Nowak", "anna@t.local"); // tier "new"
const ben = await mkWorker("Ben Weber", "ben@t.local"); // tier "new"
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
const benT = await login("ben@t.local");
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;
const customerId = r.body.user?.id ?? r.body.user?._id;
await call("POST", "/admin/slots", { from: day(1), to: day(20), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 5 }, adminT);

// 3 h × €25 = €75 (default hourly rate)
const book = async (d, startTime, extra = {}) => {
  const slots = (await call("GET", `/bookings/availability?date=${d}&duration=${extra.durationMinutes ?? 180}`)).body.data;
  const t = slots.find((s) => s.startTime === startTime) ?? slots[0];
  return call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, durationMinutes: 180, name: "Kunde Klara", email: "klara@t.local",
    phone: "030123456", postcode: "10115", address: "Invalidenstr. 5", preferredDate: d, slotId: t.windowId,
    startTime: t.startTime, earlyStartConsent: true, ...extra,
  }, custT);
};
const bookPaidStripe = async (d, startTime) => {
  const res = await book(d, startTime, { paymentMethod: "stripe" });
  const id = res.body.booking.id;
  const payment = await Payment.findOne({ booking: id, status: "created" });
  await sendWebhook(payment.checkoutSessionId, payment.amountCents);
  return id;
};
const settings = async () => (await call("GET", "/admin/settings", null, adminT)).body.settings;
const putPolicies = async (patch) => {
  const current = (await settings()).policies;
  const next = {
    cancellation: { ...current.cancellation, ...(patch.cancellation ?? {}) },
    cash: { ...current.cash, ...(patch.cash ?? {}) },
    payouts: { ...current.payouts, ...(patch.payouts ?? {}) },
  };
  return call("PUT", "/admin/settings", { policies: next }, adminT);
};

let b;

// ---------- 1. Settings: policies section with owner defaults ----------
let s = await settings();
check("1. settings expose policies defaults (free 24 h, 20 %, no very-late tier, cash ≤ 150 €, monthly payouts on the 5th)",
  s.policies?.cancellation?.freeHours === 24 && s.policies.cancellation.lateFeePct === 20 && s.policies.cancellation.veryLateFeePct === undefined &&
  s.policies.cash?.maxTotalCents === 15000 && s.policies.cash.minTier === "bronze" && s.policies.payouts?.payoutDayOfMonth === 5 && s.policies.payouts.fastPayoutMinTier === undefined,
  s.policies);
r = await putPolicies({ cancellation: { lateFeePct: 120 } });
check("1b. invalid policy (fee above 100 %) → 422", r.status === 422, r.status);
r = await putPolicies({ payouts: { payoutDayOfMonth: 31 } });
check("1c. invalid payout day (31) → 422", r.status === 422, r.status);

// ---------- 2. Cancel preview tiers ----------
const bookingA = await bookPaidStripe(day(5), "09:00");
b = await Booking.findById(bookingA);
check("2. Stripe booking paid + confirmed (fixture)", b.status === "confirmed" && b.payment.status === "paid" && b.payment.amountCents === 7500, { s: b.status, p: b.payment });
r = await call("GET", `/customer/bookings/${bookingA}/cancel-preview`, null, custT);
check("2a. > 24 h before start → free (fee 0, full refund)", r.status === 200 && r.body.tier === "free" && r.body.feeCents === 0 && r.body.refundCents === 7500 && r.body.cutoffs?.freeUntil, r.body);
// Policy fixture instead of waiting: widen the windows so "now" is inside them
r = await putPolicies({ cancellation: { freeHours: 168 } });
check("2b. admin widens the free-cancellation window (settings saved)", r.status === 200 && r.body.settings?.policies?.cancellation?.freeHours === 168, r.body);
r = await call("GET", `/customer/bookings/${bookingA}/cancel-preview`, null, custT);
check("2c. inside the free window → 20 % fee: 15,00 € fee, 60,00 € refund", r.body.tier === "late" && r.body.feeCents === 1500 && r.body.refundCents === 6000 && r.body.feePct === 20, r.body);
check("2d. no separate very-late tier (no veryLateFrom cut-off, policy without veryLate*)", r.body.cutoffs?.veryLateFrom === undefined && r.body.policy?.veryLateFeePct === undefined && r.body.policy?.refundWorkingDays === 7, r.body);

// ---------- 3. Late cancellation of a paid booking with an assigned cleaner ----------
await call("PATCH", `/admin/bookings/${bookingA}/assign`, { workerId: String(anna._id) }, adminT);
r = await call("POST", `/customer/bookings/${bookingA}/cancel`, { reason: "Termin passt nicht" }, custT);
check("3. cancel without confirming the fee → 409 FEE_CHANGED with the fee", r.status === 409 && r.body.code === "FEE_CHANGED" && r.body.feeCents === 1500, r.body);
r = await call("POST", `/customer/bookings/${bookingA}/cancel`, { confirmFeeCents: 100 }, custT);
check("3a. wrong confirmed fee → 409 FEE_CHANGED", r.status === 409 && r.body.code === "FEE_CHANGED", r.body);
const refundsBefore = stripeCalls.filter((c) => c.url === "/v1/refunds").length;
r = await call("POST", `/customer/bookings/${bookingA}/cancel`, { confirmFeeCents: 1500, reason: "Termin passt nicht" }, custT);
b = await Booking.findById(bookingA);
check("3b. confirmed fee → cancelled, partial refund 60,00 €, payment partially_refunded",
  r.status === 200 && r.body.refunded === true && r.body.fee?.refundCents === 6000 && b.status === "cancelled" && b.payment.status === "partially_refunded" &&
  b.cancellation.feeCents === 1500 && b.cancellation.charged === true,
  { r: r.body, p: b.payment, c: b.cancellation });
const refundCall = stripeCalls.filter((c) => c.url === "/v1/refunds").slice(refundsBefore)[0];
check("3c. fake Stripe received a partial refund of exactly 6000", refundCall && /(^|&)amount=6000(&|$)/.test(refundCall.body), refundCall?.body);
const payA = await Payment.findOne({ booking: bookingA, purpose: "booking" });
check("3d. payment record: refundedCents 6000, one refund entry, status partially_refunded", payA.refundedCents === 6000 && payA.refunds.length === 1 && payA.status === "partially_refunded", { rc: payA.refundedCents, st: payA.status, n: payA.refunds.length });
check("3e. cleaner earning = 80 % of the fee (12,00 €), basis cancellation, pending",
  b.workerPayout?.basis === "cancellation" && b.workerPayout.amountCents === 1200 && b.workerPayout.grossCents === 1500 && b.workerPayout.commissionCents === 300 && b.workerPayout.status === "pending",
  b.workerPayout);
const berlinYMD = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(new Date(d));
const earnedYM = berlinYMD(b.workerPayout.earnedAt).slice(0, 7);
const [ey, em] = earnedYM.split("-").map(Number);
const expectedDue = `${em === 12 ? ey + 1 : ey}-${String(em === 12 ? 1 : em + 1).padStart(2, "0")}-05, 00`;
check("3f. monthly eligibility: dueAt = 5th of the following month, 00:00 Berlin", berlinYMD(b.workerPayout.dueAt) === expectedDue, { due: berlinYMD(b.workerPayout.dueAt), expectedDue });
r = await call("GET", "/worker/earnings", null, annaT);
check("3g. cleaner sees the cancellation earning (12,00 € pending)", r.body.summary?.pendingCents === 1200 && r.body.jobs?.some((j) => j._id === String(bookingA) && j.amountCents === 1200) && r.body.summary.payoutDayOfMonth === 5, r.body.summary);
await Booking.updateOne({ _id: bookingA }, { "workerPayout.dueAt": new Date(Date.now() - 1000) });
r = await call("GET", "/admin/payouts/open", null, adminT);
check("3h. admin open payouts include the cancelled booking", JSON.stringify(r.body).includes(String(bookingA)), r.status);
r = await call("POST", "/admin/payouts", { workerId: String(anna._id), method: "bank", note: "Monatslauf" }, adminT);
b = await Booking.findById(bookingA);
check("3i. admin settles the cancellation earning (bank) → paid", r.status === 201 && r.body.payout?.status === "paid" && r.body.payout.amountCents === 1200 && b.workerPayout.status === "paid", r.body.payout);

// ---------- 4. Cancellation fee on an unpaid (cash) booking → outstanding on the customer ----------
r = await book(day(6), "09:00", { paymentMethod: "cash" });
const cashA = r.body.booking?.id;
check("4. cash booking within the limit (75 €) → confirmed", r.status === 201 && r.body.booking.payment.method === "cash", r.body);
r = await call("POST", `/customer/bookings/${cashA}/cancel`, { confirmFeeCents: 1500 }, custT);
const klara = await User.findById(customerId).lean();
b = await Booking.findById(cashA);
check("4a. unpaid fee recorded as outstanding (15,00 €) and on the booking (charged: false)", r.status === 200 && klara.outstandingCents === 1500 && b.cancellation.charged === false && b.cancellation.feeCents === 1500, { o: klara.outstandingCents, c: b.cancellation });

// ---------- 5. Cash policy ----------
r = await book(day(7), "09:00", { paymentMethod: "cash", durationMinutes: 420 }); // 7 h × 25 € = 175 €
check("5. cash above 150 € → 422 CASH_LIMIT", r.status === 422 && r.body.code === "CASH_LIMIT" && r.body.maxTotalCents === 15000, r.body);
r = await book(day(7), "09:00", { paymentMethod: "cash" });
const cashB = r.body.booking?.id;
check("5a. cash booking ≤ 150 € accepted", r.status === 201, r.body);
r = await call("POST", `/worker/jobs/${cashB}/accept`, null, benT);
check("5b. new cleaner (below bronze) cannot accept a cash job → 409 CASH_BLOCKED", r.status === 409 && r.body.code === "CASH_BLOCKED_TIER", r.body);
r = await call("PATCH", `/admin/bookings/${cashB}/assign`, { workerId: String(ben._id) }, adminT);
check("5c. admin cannot assign a below-tier cleaner to a cash job → 409", r.status === 409 && /^CASH_BLOCKED/.test(r.body.code), r.body);
await User.updateOne({ _id: ben._id }, { $set: { "workerCommission.tierKey": "bronze", "workerCommission.commissionPct": 22 } });
r = await call("POST", `/worker/jobs/${cashB}/accept`, null, benT);
check("5d. bronze cleaner accepts the cash job", r.status === 200, r.body);
// complete with cash, customer confirms a different amount → mismatch flag
await Booking.updateOne({ _id: cashB }, { preferredDate: todayInBerlin() });
await call("POST", `/worker/jobs/${cashB}/start`, null, benT);
r = await call("POST", `/worker/jobs/${cashB}/complete`, { note: "ok", cashCollectedCents: 7500 }, benT);
check("5e. cash job completed (cleaner reports 75 €)", r.status === 200, r.body);
r = await call("POST", `/customer/bookings/${cashB}/review`, { rating: 5, actualCashCents: 7000 }, custT);
b = await Booking.findById(cashB);
check("5f. customer confirms 70 € → feedback.cashMismatch flagged", r.status === 201 && b.feedback?.cashMismatch === true && b.feedback.customer.actualCashCents === 7000, { s: r.status, f: b.feedback });
// net balance rule: Ben holds 75 € cash against 56,25 € pay → −18,75 €; lower the line to −10 €
await putPolicies({ cash: { suspendBelowCents: -1000 } });
// (the review recalculated Ben's tier from live data → "new"; keep him bronze for the balance rule)
await User.updateOne({ _id: ben._id }, { $set: { "workerCommission.tierKey": "bronze", "workerCommission.commissionPct": 22 } });
r = await book(day(8), "09:00", { paymentMethod: "cash" });
const cashC = r.body.booking?.id;
r = await call("POST", `/worker/jobs/${cashC}/accept`, null, benT);
check("5g. cleaner with cash debt below the line → 409 CASH_BLOCKED (balance)", r.status === 409 && r.body.code === "CASH_BLOCKED_BALANCE", r.body);
r = await call("GET", "/admin/dashboard/stats", null, adminT);
check("5h. dashboard counts cash-debt cleaners", r.body.stats?.cashDebtCleaners === 1, r.body.stats?.cashDebtCleaners);
r = await call("GET", "/admin/cash-debt", null, adminT);
check("5i. admin cash-debt list names the cleaner", r.body.cleaners?.[0]?.worker?.name === "Ben Weber" && r.body.cleaners[0].netCents === -1875, r.body);
await putPolicies({ cash: { suspendBelowCents: -10000 } });

// ---------- 6. Admin partial refunds ----------
const bookingB = await bookPaidStripe(day(9), "09:00");
r = await call("GET", `/admin/payments?bookingId=${bookingB}`, null, adminT);
const payB = r.body.payments.find((p) => p.status === "paid")._id;
r = await call("POST", `/admin/payments/${payB}/refund`, { amountCents: 9999, reason: "zu viel" }, adminT);
check("6. refund above the remaining amount → 422", r.status === 422 && r.body.remainingCents === 7500, r.body);
r = await call("POST", `/admin/payments/${payB}/refund`, { amountCents: 2500, reason: "Kulanz" }, adminT);
b = await Booking.findById(bookingB);
check("6a. partial refund 25 € → payment partially_refunded, remaining 50 €, booking partially_refunded",
  r.status === 200 && r.body.refundedCents === 2500 && r.body.remainingCents === 5000 && r.body.status === "partially_refunded" && b.payment.status === "partially_refunded", { r: r.body, p: b.payment.status });
r = await call("POST", `/admin/payments/${payB}/refund`, { reason: "Rest" }, adminT);
b = await Booking.findById(bookingB);
const payBdoc = await Payment.findById(payB);
check("6b. second refund of the rest → fully refunded, two refund entries with reasons", r.status === 200 && r.body.status === "refunded" && b.payment.status === "refunded" && payBdoc.refunds.length === 2 && payBdoc.refunds[1].reason === "Rest", { r: r.body, n: payBdoc.refunds.length });

// ---------- 7. Price delta after an admin edit of a paid booking ----------
const bookingC = await bookPaidStripe(day(10), "09:00");
r = await call("PATCH", `/admin/bookings/${bookingC}/details`, { durationMinutes: 240, notify: true }, adminT);
b = await Booking.findById(bookingC);
const adjC = b.priceAdjustments?.[0];
const payLink = await Payment.findOne({ purpose: "adjustment", booking: bookingC });
check("7. +1 h on a paid booking → open adjustment +25 € with pay-link payment record",
  r.status === 200 && r.body.priceDeltaCents === 2500 && r.body.adjustment?.status === "open" && adjC?.deltaCents === 2500 && adjC.status === "open" &&
  payLink?.amountCents === 2500 && payLink.status === "created" && String(payLink.adjustment) === String(adjC._id) && b.payment.status === "paid" && b.payment.amountCents === 7500,
  { r: r.body.adjustment, adj: adjC, pay: payLink?.status });
await sendWebhook(payLink.checkoutSessionId, 2500);
b = await Booking.findById(bookingC);
check("7a. customer pays the pay link (webhook) → adjustment paid online, booking untouched", b.priceAdjustments[0].status === "paid" && b.priceAdjustments[0].paidVia === "online" && b.status === "confirmed" && b.payment.status === "paid", b.priceAdjustments[0]);
r = await call("PATCH", `/admin/bookings/${bookingC}/details`, { durationMinutes: 180 }, adminT);
b = await Booking.findById(bookingC);
check("7b. −1 h → automatic partial refund of 25 €, adjustment refunded", r.status === 200 && r.body.priceDeltaCents === -2500 && b.priceAdjustments[1]?.status === "refunded" && b.payment.status === "partially_refunded", { r: r.body.adjustment, p: b.payment.status });

// ---------- 8. Duration adjustment proposed by the admin, decided by the customer ----------
r = await call("POST", `/admin/bookings/${bookingC}/duration-adjustment`, { minutes: 30 }, adminT);
check("8. duration adjustment only for completed bookings → 409", r.status === 409, r.body);
r = await call("POST", `/admin/bookings/${cashB}/duration-adjustment`, { minutes: 30, note: "Küche extra" }, adminT);
check("8a. +30 min on the completed job → proposed +12,50 €", r.status === 201 && r.body.adjustment?.status === "proposed" && r.body.adjustment.deltaCents === 1250 && r.body.adjustment.kind === "duration", r.body);
const propId = r.body.adjustment?._id;
r = await call("POST", `/admin/bookings/${cashB}/duration-adjustment`, { minutes: 15 }, adminT);
check("8b. second open duration adjustment → 409", r.status === 409, r.status);
r = await call("POST", `/customer/bookings/${cashB}/adjustments/${propId}`, { decision: "approve" }, custT);
const payProp = await Payment.findOne({ purpose: "adjustment", adjustment: propId });
check("8c. customer approves → open adjustment with pay link", r.status === 200 && r.body.adjustment?.status === "open" && r.body.adjustment.checkoutUrl?.startsWith("https://checkout.stripe.test/") && payProp?.amountCents === 1250, r.body);
await sendWebhook(payProp.checkoutSessionId, 1250);
b = await Booking.findById(cashB);
check("8d. pay link paid via mock → adjustment paid", b.priceAdjustments.id(propId).status === "paid", b.priceAdjustments.id(propId));
r = await call("POST", `/admin/bookings/${cashB}/duration-adjustment`, { minutes: 30 }, adminT);
const prop2 = r.body.adjustment?._id;
r = await call("POST", `/customer/bookings/${cashB}/adjustments/${prop2}`, { decision: "decline" }, custT);
check("8e. customer declines → declined (nothing charged)", r.status === 200 && r.body.adjustment?.status === "declined", r.body);
r = await call("POST", `/customer/bookings/${cashB}/adjustments/${prop2}`, { decision: "approve" }, custT);
check("8f. deciding twice → 409", r.status === 409, r.status);
r = await call("POST", `/admin/bookings/${cashB}/duration-adjustment`, { minutes: 60 }, adminT);
const prop3 = r.body.adjustment?._id;
r = await call("PATCH", `/admin/bookings/${cashB}/adjustments/${prop3}`, { action: "mark_paid", via: "cash" }, adminT);
check("8g. admin marks an open adjustment as paid in cash", r.status === 200 && r.body.adjustment?.status === "paid" && r.body.adjustment.paidVia === "cash", r.body);
r = await call("POST", `/admin/bookings/${cashB}/duration-adjustment`, { minutes: -30 }, adminT);
const prop4 = r.body.adjustment?._id;
r = await call("PATCH", `/admin/bookings/${cashB}/adjustments/${prop4}`, { action: "waive" }, adminT);
check("8h. admin waives a proposal", r.status === 200 && r.body.adjustment?.status === "waived", r.body);
r = await call("GET", `/admin/bookings/${cashB}`, null, adminT);
check("8i. admin booking detail lists all adjustments", r.body.booking?.priceAdjustments?.length === 4, r.body.booking?.priceAdjustments?.length);

// ---------- 9. Permissions ----------
r = await call("POST", `/admin/bookings/${cashB}/duration-adjustment`, { minutes: 30 }, custT);
const r2 = await call("GET", "/admin/cash-debt", null, benT);
const r3 = await call("POST", `/admin/payments/${payB}/refund`, { amountCents: 100 }, annaT);
const r4 = await call("POST", `/customer/bookings/${cashB}/adjustments/${prop4}`, { decision: "approve" }, benT);
check("9. customer / cleaner cannot use admin money endpoints (403); cleaner cannot decide a customer's adjustment", r.status === 403 && r2.status === 403 && r3.status === 403 && [403, 404].includes(r4.status), [r.status, r2.status, r3.status, r4.status]);

const { failures, passes } = summary();
console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"} (${passes} passed)`);
await User.db.dropDatabase();
server.close();
fakeStripe.close();
process.exit(failures ? 1 : 0);
