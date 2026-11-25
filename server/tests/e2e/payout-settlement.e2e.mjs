// E2E: cleaner earnings → monthly eligibility (5th of the next month) → admin settlement via the
// PayPal Payouts MOCK (success, denied, pending+refresh, retry, duplicates),
// refund → hold, payout-method onboarding, permissions. NO real money.
import { ROOT, prepareEnv, createChecker, apiClient, startPayPalMock, ALWAYS_AVAILABLE, BERLIN_WIDE } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_payouts");
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
const { default: Payout } = await import(ROOT + "/src/models/payout.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");

await connectDB();
await User.db.dropDatabase();
// Rebuild every index before testing (unique indexes back business rules)
for (const M of Object.values(User.db.models)) await M.syncIndexes();
await loadSettings();
const server = app.listen(0);
const call = apiClient(`http://127.0.0.1:${server.address().port}/api/v1`);
const { check, summary } = createChecker();
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);

let b;
const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const mkWorker = (name, email) =>
  User.create({
    name, email, password: pw, role: "worker", availability: ALWAYS_AVAILABLE, workerStatus: "approved", emailVerified: true,
    workerProfile: { ...BERLIN_WIDE, address: "Str 1", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: name,
  });
const anna = await mkWorker("Anna Nowak", "anna@t.local");
const ben = await mkWorker("Ben Weber", "ben@t.local");
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
const benT = await login("ben@t.local");
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;
await call("POST", "/admin/slots", { from: day(1), to: day(20), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 5 }, adminT);

// Booking paid through the PayPal MOCK (capture verified server-side); 3 h × €25 = €75 gross
const book = async (d, startTime, extra = {}) => {
  const slots = (await call("GET", `/bookings/availability?date=${d}&duration=180`)).body.data;
  const t = slots.find((s) => s.startTime === startTime) ?? slots[0];
  const res = await call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, durationMinutes: 180, name: "Kunde Klara", email: "klara@t.local",
    phone: "030123456", postcode: "10115", address: "Invalidenstr. 5", preferredDate: d, slotId: t.windowId,
    startTime: t.startTime, earlyStartConsent: true, ...extra,
  }, custT);
  return res;
};
const bookPaid = async (d, startTime) => {
  const res = await book(d, startTime, { paymentMethod: "paypal" });
  const orderId = new URL(res.body.checkoutUrl).searchParams.get("token");
  await call("POST", "/payments/paypal/capture", { bookingId: res.body.booking.id, orderId }, custT);
  return res.body.booking.id;
};
const completeJob = async (id, workerId, workerToken) => {
  await call("PATCH", `/admin/bookings/${id}/assign`, { workerId: String(workerId) }, adminT);
  await Booking.updateOne({ _id: id }, { preferredDate: todayInBerlin() });
  await call("POST", `/worker/jobs/${id}/start`, null, workerToken);
  return call("POST", `/worker/jobs/${id}/complete`, { note: "ok" }, workerToken);
};
const makeDue = (id) => Booking.updateOne({ _id: id }, { "workerPayout.dueAt": new Date(Date.now() - 1000) });

// ---------- TEST 8+9: earnings record, pending during the waiting period ----------
const job1 = await bookPaid(day(2), "09:00");
b = await Booking.findById(job1);
check("TEST 8a: booking paid (mock) and confirmed", b.status === "confirmed" && b.payment.status === "paid", { s: b.status, p: b.payment.status });
r = await completeJob(job1, anna._id, annaT);
b = await Booking.findById(job1);
check("TEST 8b: earnings record: gross €75, pay €56.25 (75 %), commission €18.75, pending", r.status === 200 && b.workerPayout.amountCents === 5625 && b.workerPayout.grossCents === 7500 && b.workerPayout.commissionCents === 1875 && b.workerPayout.status === "pending", b.workerPayout);
const berlin = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(new Date(d));
const [ey, em] = berlin(b.workerPayout.earnedAt).slice(0, 7).split("-").map(Number);
const expectedDue = `${em === 12 ? ey + 1 : ey}-${String(em === 12 ? 1 : em + 1).padStart(2, "0")}-05, 00`;
check("TEST 8c: eligibility date = 5th of the following month (monthly payouts, configurable)", berlin(b.workerPayout.dueAt) === expectedDue, { due: berlin(b.workerPayout.dueAt), expectedDue });
r = await call("GET", "/worker/earnings", null, annaT);
check("TEST 9a: cleaner sees pending earnings, nothing withdrawable", r.body.summary.pendingCents === 5625 && r.body.summary.dueCents === 0 && r.body.jobs[0].status === "pending", r.body.summary);
check("TEST 9a2: earnings page shows the commission model (75 % share, per-hour pay after commission), not the 18 €/h rate",
  r.body.summary.payModel?.basis === "commission" && r.body.summary.payModel.commissionPct === 25 && r.body.summary.payModel.sharePct === 75 &&
    r.body.summary.payModel.perHourCents === Math.round(r.body.summary.payModel.customerHourlyCents * 0.75) &&
    r.body.jobs[0].basis === "commission" && r.body.jobs[0].grossCents === 7500 && r.body.jobs[0].commissionPct === 25 && r.body.jobs[0].commissionCents === 1875,
  { pm: r.body.summary.payModel, job: r.body.jobs[0] });
r = await call("POST", "/admin/payouts", { workerId: String(anna._id) }, adminT);
check("TEST 9b: settlement before 30 days → 409 (nothing eligible)", r.status === 409, r.body);
r = await call("GET", "/admin/payouts/open", null, adminT);
let group = r.body.groups.find((g) => String(g.worker._id) === String(anna._id));
check("TEST 11a: admin sees upcoming payout with gross/commission", group?.pendingCents === 5625 && group.grossCents === 7500 && group.commissionCents === 1875 && group.worker.payout.type === "bank", group);

// ---------- TEST 10: date fixture instead of waiting 30 days ----------
await makeDue(job1);
r = await call("GET", "/worker/earnings", null, annaT);
check("TEST 10: after the configured period the earnings are eligible (due)", r.body.summary.dueCents === 5625 && r.body.jobs[0].status === "due", r.body.summary);
r = await call("GET", "/admin/payouts/open", null, adminT);
group = r.body.groups.find((g) => String(g.worker._id) === String(anna._id));
check("TEST 11b: admin sees the eligible amount", group?.dueCents === 5625, group);

// ---------- Payout method onboarding (G) ----------
r = await call("PUT", "/worker/payout-method", { type: "paypal" }, annaT);
check("paypal without email → 422", r.status === 422, r.status);
r = await call("PUT", "/worker/payout-method", { type: "paypal", paypalEmail: "Anna-Sandbox@Example.com" }, annaT);
check("Anna sets PayPal payouts (lowercased)", r.status === 200 && r.body.payoutMethod.paypalEmail === "anna-sandbox@example.com", r.body);
r = await call("GET", "/worker/earnings", null, annaT);
check("cleaner sees own payout method", r.body.payoutMethod?.type === "paypal", r.body.payoutMethod);
r = await call("GET", "/admin/payouts/open", null, adminT);
group = r.body.groups.find((g) => String(g.worker._id) === String(anna._id));
check("admin sees masked PayPal target only", group.worker.payout.type === "paypal" && group.worker.payout.target === "a•••@example.com", group.worker.payout);

// ---------- TEST 12+13: settle via PayPal sandbox mock ----------
r = await call("POST", "/admin/payouts", { workerId: String(anna._id), note: "Novemberlauf" }, adminT);
let payout = r.body.payout;
check("TEST 12: settlement initiated and confirmed by provider (mock)", r.status === 201 && payout.status === "paid" && payout.provider === "paypal" && /^PB/.test(payout.providerBatchId) && /^TX/.test(payout.providerItemId), payout);
check("TEST 12b: exactly one provider payout was created", paypal.payouts === 1, paypal.payouts);
b = await Booking.findById(job1);
check("TEST 13a: job marked paid with payout reference", b.workerPayout.status === "paid" && String(b.workerPayout.payout) === String(payout._id), b.workerPayout);
r = await call("GET", "/worker/earnings", null, annaT);
check("TEST 13b: cleaner history shows the paid payout", r.body.payouts[0]?.status === "paid" && r.body.payouts[0].provider === "paypal" && r.body.summary.paidCents === 5625, r.body.payouts[0]);
r = await call("GET", "/admin/payouts", null, adminT);
check("TEST 13c: admin history has provider references", r.body.payouts[0]?.providerBatchId === payout.providerBatchId, r.body.payouts[0]);

// ---------- TEST 15: duplicates are impossible ----------
r = await call("POST", "/admin/payouts", { workerId: String(anna._id) }, adminT);
check("TEST 15a: settling again → 409, no second provider payout", r.status === 409 && paypal.payouts === 1, { s: r.status, p: paypal.payouts });

// ---------- TEST 14: denied payout releases earnings; retry succeeds ----------
const job2 = await bookPaid(day(3), "09:00");
await completeJob(job2, anna._id, annaT);
await makeDue(job2);
paypal.nextPayout = "DENIED";
r = await call("POST", "/admin/payouts", { workerId: String(anna._id) }, adminT);
b = await Booking.findById(job2);
check("TEST 14a: denied payout → failed, earnings released for retry", r.status === 502 && r.body.payout.status === "failed" && /unable to receive/.test(r.body.payout.failureReason) && b.workerPayout.status === "pending" && b.workerPayout.payout == null, { s: r.status, p: r.body.payout, w: b.workerPayout });
paypal.nextPayout = "ERROR";
r = await call("POST", "/admin/payouts", { workerId: String(anna._id) }, adminT);
b = await Booking.findById(job2);
check("TEST 14b: provider 422 error → failed + released", r.status === 502 && b.workerPayout.status === "pending", { s: r.status, w: b.workerPayout });
r = await call("POST", "/admin/payouts", { workerId: String(anna._id) }, adminT);
b = await Booking.findById(job2);
check("TEST 14c: retry succeeds, job paid once", r.status === 201 && r.body.payout.status === "paid" && b.workerPayout.status === "paid", r.body.payout?.status);

// ---------- Concurrent settlements (TEST 15 under race) ----------
const job3 = await bookPaid(day(4), "09:00");
await completeJob(job3, anna._id, annaT);
await makeDue(job3);
const race = await Promise.all([0, 1].map(() => call("POST", "/admin/payouts", { workerId: String(anna._id) }, adminT)));
const okCount = race.filter((x) => x.status === 201).length;
const payoutsForJob3 = await Payout.countDocuments({ bookings: job3, status: "paid" });
check("TEST 15b: parallel settlements → exactly one succeeds", okCount === 1 && race.filter((x) => x.status === 409).length === 1 && payoutsForJob3 === 1, race.map((x) => x.status));

// ---------- Pending provider result + refresh ----------
const job4 = await bookPaid(day(5), "09:00");
await completeJob(job4, anna._id, annaT);
await makeDue(job4);
paypal.nextPayout = "PENDING";
r = await call("POST", "/admin/payouts", { workerId: String(anna._id) }, adminT);
payout = r.body.payout;
b = await Booking.findById(job4);
check("slow provider: payout stays processing, job locked as processing", r.status === 201 && payout.status === "processing" && b.workerPayout.status === "processing", { p: payout.status, w: b.workerPayout.status });
r = await call("POST", "/admin/payouts", { workerId: String(anna._id) }, adminT);
check("processing earnings cannot be settled again → 409", r.status === 409, r.status);
r = await call("GET", "/worker/earnings", null, annaT);
check("cleaner sees processing amount separately", r.body.summary.processingCents === 5625 && r.body.jobs.find((j) => j._id === job4).status === "processing", r.body.summary);
let refreshed = await call("POST", `/admin/payouts/${payout._id}/refresh`, {}, adminT);
refreshed = await call("POST", `/admin/payouts/${payout._id}/refresh`, {}, adminT);
b = await Booking.findById(job4);
check("refresh confirms the provider result → paid", refreshed.body.payout.status === "paid" && b.workerPayout.status === "paid", refreshed.body.payout?.status);

// ---------- TEST 16: refund puts unpaid earnings on hold ----------
const job5 = await bookPaid(day(6), "09:00");
await completeJob(job5, ben._id, benT);
b = await Booking.findById(job5);
check("TEST 16a: paid booking completed → earnings pending", b.payment.status === "paid" && b.workerPayout.status === "pending", { p: b.payment.status, w: b.workerPayout?.status });
r = await call("GET", `/admin/payments?bookingId=${job5}`, null, adminT);
const paymentId = r.body.payments.find((p) => p.status === "paid")._id;
r = await call("POST", `/admin/payments/${paymentId}/refund`, null, adminT);
b = await Booking.findById(job5);
check("TEST 16b: refund → cleaner earnings on hold (dispute)", r.status === 200 && b.payment.status === "refunded" && b.workerPayout.status === "on_hold", { s: r.status, w: b.workerPayout.status });
await makeDue(job5);
r = await call("POST", "/admin/payouts", { workerId: String(ben._id) }, adminT);
check("TEST 16c: on-hold earnings are not settled", r.status === 409, r.status);
await call("PATCH", `/admin/bookings/${job5}/payout`, { status: "pending" }, adminT);
r = await call("POST", "/admin/payouts", { workerId: String(ben._id), method: "bank", note: "Nach Prüfung freigegeben" }, adminT);
check("TEST 16d: after release, bank settlement works", r.status === 201 && r.body.payout.status === "paid" && r.body.payout.provider === "bank", r.body.payout);

// ---------- TEST 17: permissions ----------
for (const [who, token] of [["customer", custT], ["cleaner", annaT]]) {
  r = await call("GET", "/admin/payouts/open", null, token);
  const r2 = await call("POST", "/admin/payouts", { workerId: String(anna._id) }, token);
  check(`TEST 17: ${who} cannot access payout functionality`, r.status === 403 && r2.status === 403, [r.status, r2.status]);
}
r = await call("POST", `/admin/payouts/${payout._id}/refresh`, {}, custT);
check("TEST 17b: customer cannot refresh payouts", r.status === 403, r.status);

const { failures, passes } = summary();
console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"} (${passes} passed)`);
await User.db.dropDatabase();
server.close();
paypal.close();
process.exit(failures ? 1 : 0);
