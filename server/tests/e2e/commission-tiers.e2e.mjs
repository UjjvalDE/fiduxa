// E2E: rating-based commission system – tier eligibility (New→Diamond),
// trust score, commission-based pay on completion, historical immutability,
// admin override with reason, review disputes, duplicate/concurrent safety,
// config validation, permissions. Spec scenarios 1–18.
import { ROOT, prepareEnv, createChecker, apiClient, ALWAYS_AVAILABLE, BERLIN_WIDE } from "../helpers/harness.mjs";
import { Types } from "mongoose";

prepareEnv("fiduxa_e2e_commission");

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: Review } = await import(ROOT + "/src/models/review.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");
const { commissionCounters, tierForCounters, trustScore } = await import(ROOT + "/src/services/commission.service.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
// Fixture: this suite lets brand-new cleaners take cash jobs; the owner-approved cash
// policy (policies.cash.minTier = "bronze", see money-policies) is relaxed for this test DB only.
// Fixture: it also exercises the card (Stripe) and cash flows that the owner switched off
// for now (POLICIES.paymentMethods.enabled = ["paypal"]); they are re-enabled for this test DB only.
await (await import(ROOT + "/src/models/settings.model.js")).default.updateOne({ key: "platform" }, { $set: { "policies.cash.minTier": "new", "policies.paymentMethods.enabled": ["paypal", "stripe", "cash"] } }, { upsert: true });
await loadSettings();
const server = app.listen(0);
const call = apiClient(`http://127.0.0.1:${server.address().port}/api/v1`);
const { check, summary } = createChecker();
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const mkWorker = (name, email) =>
  User.create({
    name, email, password: pw, role: "worker", availability: ALWAYS_AVAILABLE, workerStatus: "approved", emailVerified: true,
    workerProfile: { ...BERLIN_WIDE, address: "Str 1", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: name,
  });
const anna = await mkWorker("Anna Nowak", "anna@t.local");
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;
const klara = await User.findOne({ email: "klara@t.local" });
await call("POST", "/admin/slots", { from: day(1), to: day(20), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 10 }, adminT);

/** Seed `n` completed bookings + `reviews` ratings for a worker directly (volume fixtures). */
const seed = async (workerId, { jobs = 0, reviews = [] } = {}) => {
  if (jobs > 0) {
    await Booking.collection.insertMany(
      Array.from({ length: jobs }, (_, i) => ({
        reference: `SEED-${workerId}-${Date.now()}-${i}`,
        customer: klara._id,
        assignedWorker: workerId,
        status: "completed",
        serviceId: "home-cleaning",
        payment: { status: "paid" },
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
  }
  if (reviews.length > 0) {
    await Review.collection.insertMany(
      reviews.map((rating) => ({
        booking: new Types.ObjectId(),
        customer: klara._id,
        worker: workerId,
        rating,
        hidden: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
  }
};
/** ratings averaging exactly `avg` over `n` reviews (avg with 1 decimal ≥ 4) */
const ratings = (n, avg) => {
  const total = Math.round(avg * n);
  const fives = total - 4 * n; // x fives + (n-x) fours
  return Array.from({ length: n }, (_, i) => (i < fives ? 5 : 4));
};

const tierOf = async (workerId) => tierForCounters(await commissionCounters(workerId));

// ---------- Scenarios 1–11: tier eligibility matrix (fresh worker per case) ----------
const cases = [
  { name: "TEST 1: new cleaner, zero bookings → New 25 %", jobs: 0, reviews: [], expect: ["new", 25] },
  { name: "TEST 2: 5.0 rating but only 3 reviews → still New", jobs: 9, reviews: [5, 5, 5], expect: ["new", 25] },
  { name: "TEST 3: Bronze (10 jobs, 8 reviews, 4.50)", jobs: 10, reviews: ratings(8, 4.5), expect: ["bronze", 22] },
  { name: "TEST 4: Silver (25 jobs, 20 reviews, 4.60)", jobs: 25, reviews: ratings(20, 4.6), expect: ["silver", 19] },
  { name: "TEST 5: Gold (50 jobs, 35 reviews, 4.70)", jobs: 50, reviews: ratings(35, 4.7), expect: ["gold", 16] },
  { name: "TEST 6: Platinum (100 jobs, 70 reviews, 4.80)", jobs: 100, reviews: ratings(70, 4.8), expect: ["platinum", 13] },
  { name: "TEST 7: Diamond (200 jobs, 120 reviews, 4.90)", jobs: 200, reviews: ratings(120, 4.9), expect: ["diamond", 10] },
  { name: "TEST 8: 200 jobs but too few reviews → best lower level (Gold at 35 reviews)", jobs: 200, reviews: ratings(35, 4.9), expect: ["gold", 16] },
  { name: "TEST 9: 120 reviews but only 20 jobs → Bronze is the best met level", jobs: 20, reviews: ratings(120, 4.9), expect: ["bronze", 22] },
  { name: "TEST 10: volume fine but low rating (4.3) → New", jobs: 200, reviews: ratings(120, 4.3), expect: ["new", 25] },
];
let i = 0;
for (const c of cases) {
  const w = await mkWorker(`Tier ${i}`, `tier${i}@t.local`);
  await seed(w._id, { jobs: c.jobs, reviews: c.reviews });
  const t = await tierOf(w._id);
  check(c.name, t.key === c.expect[0] && t.commissionPct === c.expect[1], t);
  i++;
}

// TEST 11: rating decreases → tier drops for FUTURE jobs
const dropper = await mkWorker("Dropper", "dropper@t.local");
await seed(dropper._id, { jobs: 30, reviews: ratings(20, 4.6) });
let t = await tierOf(dropper._id);
const wasSilver = t.key === "silver";
await seed(dropper._id, { reviews: [1, 1, 1, 1, 1, 1] }); // bad streak drags avg below 4.5
t = await tierOf(dropper._id);
check("TEST 11: rating drop demotes the tier for future jobs", wasSilver && t.key === "new", t);

// ---------- Trust score sanity ----------
const few = trustScore({ jobsCompleted: 3, verifiedReviews: 3, ratingAvg: 5, reliabilityPct: 100 });
const many = trustScore({ jobsCompleted: 250, verifiedReviews: 150, ratingAvg: 4.9, reliabilityPct: 97 });
const mid = trustScore({ jobsCompleted: 50, verifiedReviews: 35, ratingAvg: 4.7, reliabilityPct: 95 });
check("trust: three 5★ reviews cannot beat a proven cleaner", few < mid && mid < many && many >= 85 && few <= 45, { few, mid, many });
check("trust: bounded 0–100", trustScore({ jobsCompleted: 0, verifiedReviews: 0, ratingAvg: null, reliabilityPct: null }) >= 0 && many <= 100, many);

// ---------- Real flow: commission pay on completion (new cleaner 20 %) ----------
const book = async (d, startTime, extra = {}) => {
  const slots = (await call("GET", `/bookings/availability?date=${d}&duration=180`)).body.data;
  const slot = slots.find((s) => s.startTime === startTime) ?? slots[0];
  return call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, durationMinutes: 180, name: "Kunde Klara", email: "klara@t.local",
    phone: "030123456", postcode: "10115", address: "Invalidenstr. 5", preferredDate: d, slotId: slot.windowId,
    startTime: slot.startTime, earlyStartConsent: true, paymentMethod: "cash", ...extra,
  }, custT);
};
const completeJob = async (id, workerId, workerToken) => {
  await call("PATCH", `/admin/bookings/${id}/assign`, { workerId: String(workerId) }, adminT);
  await Booking.updateOne({ _id: id }, { preferredDate: todayInBerlin() });
  await call("POST", `/worker/jobs/${id}/start`, null, workerToken);
  // Cash booking: the cleaner reports the collected amount (€75)
  return call("POST", `/worker/jobs/${id}/complete`, { note: "ok", cashCollectedCents: 7500 }, workerToken);
};

r = await book(day(2), "09:00");
const jobA = r.body.booking.id;
await completeJob(jobA, anna._id, annaT);
let b = await Booking.findById(jobA);
check("commission pay: €75 job, New 25 % → cleaner €56.25, Fiduxa €18.75",
  b.workerPayout.amountCents === 5625 && b.workerPayout.commissionCents === 1875 && b.workerPayout.grossCents === 7500 &&
  b.workerPayout.basis === "commission" && b.workerPayout.commissionPct === 25 && b.workerPayout.tierKey === "new",
  b.workerPayout);

// TEST 12 + 18: duplicate and concurrent completion events → exactly one record
const before = JSON.stringify(b.workerPayout);
r = await call("POST", `/worker/jobs/${jobA}/complete`, { note: "again", cashCollectedCents: 7500 }, annaT);
b = await Booking.findById(jobA);
check("TEST 12: duplicate completion does not change the earning", JSON.stringify(b.workerPayout) === before, r.status);
r = await book(day(2), "13:00");
const jobB = r.body.booking.id;
await call("PATCH", `/admin/bookings/${jobB}/assign`, { workerId: String(anna._id) }, adminT);
await Booking.updateOne({ _id: jobB }, { preferredDate: todayInBerlin() });
await call("POST", `/worker/jobs/${jobB}/start`, null, annaT);
const burst = await Promise.all([
  call("POST", `/worker/jobs/${jobB}/complete`, { note: "a", cashCollectedCents: 7500 }, annaT),
  call("POST", `/worker/jobs/${jobB}/complete`, { note: "b", cashCollectedCents: 7500 }, annaT),
  call("POST", `/worker/jobs/${jobB}/complete`, { note: "c", cashCollectedCents: 7500 }, annaT),
]);
b = await Booking.findById(jobB);
check("TEST 18: concurrent completions → one immutable earning", b.workerPayout.status === "pending" && b.workerPayout.amountCents === 5625, burst.map((x) => x.status));

// TEST 13: duplicate review → 409; review then counts for the tier
r = await call("POST", `/customer/bookings/${jobA}/review`, { rating: 5, comment: "Super sauber!" }, custT);
check("verified review accepted on completed booking", r.status === 201, r.status);
r = await call("POST", `/customer/bookings/${jobA}/review`, { rating: 1 }, custT);
check("TEST 13: second review for the same booking → 409", r.status === 409, r.status);
let c = await commissionCounters(anna._id);
check("review counted once, rating 5.0", c.verifiedReviews === 1 && c.ratingAvg === 5 && c.jobsCompleted === 2, c);

// TEST 14: cancelled bookings never count as completed cleanings
r = await book(day(3), "09:00");
const jobC = r.body.booking.id;
await call("POST", `/customer/bookings/${jobC}/cancel`, { reason: "storniert" }, custT);
c = await commissionCounters(anna._id);
check("TEST 14: cancelled booking does not count", c.jobsCompleted === 2, c);

// TEST 17 + tier change: push Anna to Bronze – the OLD record stays at 20 %
await seed(anna._id, { jobs: 8, reviews: ratings(7, 4.6) }); // now 10 jobs, 8 reviews, avg ≥ 4.5
r = await call("GET", "/worker/performance", null, annaT);
check("performance endpoint: Bronze reached, 22 %", r.body.tier.key === "bronze" && r.body.tier.effectivePct === 22 && r.body.counters.jobsCompleted === 10, r.body.tier);
check("next tier shown honestly (Silver: missing jobs AND reviews)",
  r.body.nextTier?.key === "silver" && r.body.nextTier.missing.jobs === 15 && r.body.nextTier.missing.reviews === 12,
  r.body.nextTier);
r = await book(day(4), "09:00");
const jobD = r.body.booking.id;
await completeJob(jobD, anna._id, annaT);
b = await Booking.findById(jobD);
const oldB = await Booking.findById(jobA);
check("TEST 17: new job pays at 22 %, historical record stays at 25 %",
  b.workerPayout.commissionPct === 22 && b.workerPayout.tierKey === "bronze" && b.workerPayout.amountCents === 5850 &&
  oldB.workerPayout.commissionPct === 25 && oldB.workerPayout.amountCents === 5625,
  { new: b.workerPayout.commissionPct, old: oldB.workerPayout.commissionPct });

// TEST 15: refund puts earnings on hold and removes the job from the completed count
r = await call("GET", "/admin/payments?bookingId=" + jobD, null, adminT);
const paymentId = r.body.payments?.[0]?._id;
let refundWorked = false;
if (paymentId) {
  const rr = await call("POST", `/admin/payments/${paymentId}/refund`, null, adminT);
  refundWorked = rr.status === 200;
}
if (refundWorked) {
  b = await Booking.findById(jobD);
  c = await commissionCounters(anna._id);
  check("TEST 15: refund → earnings on hold, completed count reduced", b.workerPayout.status === "on_hold" && c.jobsCompleted === 10, { s: b.workerPayout.status, jobs: c.jobsCompleted });
} else {
  // Cash bookings have no refundable provider payment – the hold path is
  // covered in payout-settlement.e2e.mjs (TEST 16 there); assert the counter rule instead.
  await Booking.updateOne({ _id: jobD }, { "payment.status": "refunded" });
  c = await commissionCounters(anna._id);
  check("TEST 15: refunded booking leaves the completed count", c.jobsCompleted === 10, c.jobsCompleted);
  await Booking.updateOne({ _id: jobD }, { "payment.status": "paid" });
}

// ---------- TEST 16: admin override (mandatory reason, future-only, removable) ----------
r = await call("PATCH", `/admin/workers/${anna._id}/commission-override`, { commissionPct: 10 }, adminT);
check("override without reason → 422", r.status === 422, r.status);
r = await call("PATCH", `/admin/workers/${anna._id}/commission-override`, { commissionPct: 10, reason: "Pilotprogramm Top-Kraft" }, adminT);
check("TEST 16a: override saved (10 %) with reason", r.status === 200 && r.body.tier.effectivePct === 10 && r.body.tier.overridden, r.body);
r = await book(day(5), "09:00");
const jobE = r.body.booking.id;
await completeJob(jobE, anna._id, annaT);
b = await Booking.findById(jobE);
check("TEST 16b: next job pays with the override (90 % of €75 = €67.50)", b.workerPayout.commissionPct === 10 && b.workerPayout.amountCents === 6750, b.workerPayout);
b = await Booking.findById(jobA);
check("TEST 16c: override never rewrites history", b.workerPayout.commissionPct === 25, b.workerPayout.commissionPct);
r = await call("PATCH", `/admin/workers/${anna._id}/commission-override`, { commissionPct: null, reason: "Pilot beendet" }, adminT);
check("TEST 16d: override removed → tier % applies again", r.status === 200 && r.body.tier.overridden === false && r.body.tier.effectivePct === 22, r.body.tier);

// ---------- Review dispute flow ----------
r = await book(day(6), "09:00");
const jobF = r.body.booking.id;
await completeJob(jobF, anna._id, annaT);
await call("POST", `/customer/bookings/${jobF}/review`, { rating: 1, comment: "Unfair" }, custT);
const badReview = await Review.findOne({ booking: jobF });
r = await call("POST", `/worker/reviews/${badReview._id}/dispute`, { message: "Kunde war nicht zu Hause, Bewertung unberechtigt." }, annaT);
check("cleaner can dispute a review", r.status === 201 && r.body.review.dispute.status === "open", r.body.review?.dispute);
r = await call("POST", `/worker/reviews/${badReview._id}/dispute`, { message: "Nochmal bitte prüfen, danke!" }, annaT);
check("dispute only once → 409", r.status === 409, r.status);
const cBefore = await commissionCounters(anna._id);
r = await call("PATCH", `/admin/reviews/${badReview._id}/dispute`, { resolution: "approved", note: "Nachweislich unberechtigt" }, adminT);
const cAfter = await commissionCounters(anna._id);
check("approved dispute hides the review and recalculates the rating",
  r.body.review.hidden === true && cAfter.verifiedReviews === cBefore.verifiedReviews - 1 && cAfter.ratingAvg > cBefore.ratingAvg,
  { before: cBefore.ratingAvg, after: cAfter.ratingAvg });
r = await call("PATCH", `/admin/reviews/${badReview._id}/dispute`, { resolution: "rejected" }, adminT);
check("dispute cannot be resolved twice → 409", r.status === 409, r.status);
r = await call("GET", "/worker/reviews", null, annaT);
check("cleaner sees own reviews incl. dispute state", r.body.reviews.some((x) => x.dispute?.status === "approved" && x.hidden), r.body.reviews?.length);

// ---------- Admin dashboard + report + config ----------
r = await call("GET", "/admin/commission", null, adminT);
const annaRow = r.body.workers.find((w) => String(w.worker._id) === String(anna._id));
check("admin overview: tiers, trust, counters, Fiduxa commission totals",
  r.body.workers.length >= 12 && annaRow?.tier.key === "bronze" && annaRow.trustScore > 0 && r.body.totals.commissionCents > 0, annaRow?.tier);
r = await call("GET", "/admin/commission?tier=diamond", null, adminT);
check("admin overview filter by tier", r.body.workers.length === 1 && r.body.workers[0].tier.key === "diamond", r.body.workers.length);
r = await call("GET", `/admin/commission/workers/${anna._id}`, null, adminT);
check("admin worker detail: immutable transactions with pct + tier",
  r.body.transactions.length >= 3 && r.body.transactions.every((x) => x.basis === "commission" && typeof x.commissionPct === "number"), r.body.transactions?.length);
r = await call("GET", "/admin/commission/report", null, adminT);
check("commission report with totals", r.body.totals.commissionCents > 0 && r.body.rows.length >= 1, r.body.totals);
const csvRes = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/commission/report?format=csv`, { headers: { Authorization: `Bearer ${adminT}` } });
const csvText = await csvRes.text();
check("commission report CSV export", csvRes.status === 200 && csvText.includes("Fiduxa commission"), csvRes.status);

// Config change applies to FUTURE bookings only
r = await call("GET", "/admin/settings", null, adminT);
const wp = r.body.settings.workerPay;
wp.commissionTiers.bronze.commissionPct = 20.5;
r = await call("PUT", "/admin/settings", { workerPay: wp }, adminT);
check("admin can change tier percentages", r.status === 200 && r.body.settings.workerPay.commissionTiers.bronze.commissionPct === 20.5, r.status);
r = await book(day(7), "09:00");
const jobG = r.body.booking.id;
await completeJob(jobG, anna._id, annaT);
b = await Booking.findById(jobG);
check("new percentage applies to the next job (20.5 % → €59.62)", b.workerPayout.commissionPct === 20.5 && b.workerPayout.amountCents === 5962, b.workerPayout);
wp.commissionTiers.bronze.commissionPct = 25; // same as New – every level must be cheaper
r = await call("PUT", "/admin/settings", { workerPay: wp }, adminT);
check("equal commission on two levels rejected (every level must be cheaper) → 422", r.status === 422, r.status);
wp.commissionTiers.bronze.commissionPct = 22;
wp.commissionTiers.diamond.commissionPct = 9;
r = await call("PUT", "/admin/settings", { workerPay: wp }, adminT);
check("tier below the 10 % minimum rejected → 422", r.status === 422, r.status);
wp.commissionTiers.diamond.commissionPct = 10;
wp.commissionTiers.new.commissionPct = 26;
r = await call("PUT", "/admin/settings", { workerPay: wp }, adminT);
check("tier above the 25 % maximum rejected → 422", r.status === 422, r.status);
wp.commissionTiers.new.commissionPct = 25;
for (const pct of [9.5, 25.5]) {
  r = await call("PATCH", `/admin/workers/${anna._id}/commission-override`, { commissionPct: pct, reason: "Grenzwert-Test" }, adminT);
  check(`manual override ${pct} % outside 10–25 % rejected → 422`, r.status === 422, r.status);
}

// ---------- Finance dashboard ----------
{
  const done = await Booking.find({ status: "completed", "workerPayout.status": { $exists: true }, "pricing.totalCents": { $exists: true } }).lean();
  const gross = done.reduce((t, b) => t + b.pricing.totalCents, 0);
  const pay = done.reduce((t, b) => t + b.workerPayout.amountCents, 0);
  const vat = done.reduce((t, b) => t + b.pricing.vatCents, 0);
  r = await call("GET", "/admin/finance?period=all", null, adminT);
  const all = r.body.periods?.all;
  check("finance: all-time revenue, cleaner pay and VAT reconcile with booking records",
    r.status === 200 && all.grossCents === gross && all.cleanerPayCents === pay && all.vatCents === vat && all.commissionCents === gross - pay, { all, gross, pay, vat });
  check("finance: profit chain is consistent (net − pay − fees − fixed − tax = after tax)",
    all.netRevenueCents === all.grossCents - all.vatCents &&
    all.profitBeforeTaxCents === all.netRevenueCents - all.cleanerPayCents - all.paymentFeesCents - all.fixedCostsCents &&
    all.profitAfterTaxCents === all.profitBeforeTaxCents - all.incomeTaxCents, all);
  check("finance: today/month/year periods + 12-month series", ["today", "month", "year"].every((k) => r.body.periods[k]) && r.body.monthly.length === 12, Object.keys(r.body.periods));
  const settingsNow = (await call("GET", "/admin/settings", null, adminT)).body.settings.finance;
  r = await call("PUT", "/admin/settings", { finance: { ...settingsNow, vatBasis: "commission", incomeTaxRatePct: 25, monthlyFixedCostsCents: 10000 } }, adminT);
  check("finance assumptions can be saved", r.status === 200 && r.body.settings.finance.vatBasis === "commission", r.status);
  r = await call("GET", "/admin/finance?period=all", null, adminT);
  const agent = r.body.periods.all;
  const expectedVat = Math.round(agent.commissionCents - agent.commissionCents / 1.19);
  check("finance: agent model taxes only the commission; fixed costs and tax rate applied",
    agent.vatCents === expectedVat && agent.fixedCostsCents >= 10000 &&
    agent.incomeTaxCents === (agent.profitBeforeTaxCents > 0 ? Math.round(agent.profitBeforeTaxCents * 0.25) : 0), agent);
  r = await call("PUT", "/admin/settings", { finance: { ...settingsNow, incomeTaxRatePct: 99 } }, adminT);
  check("finance: invalid tax rate rejected → 422", r.status === 422, r.status);
  await call("PUT", "/admin/settings", { finance: settingsNow }, adminT);
  r = await call("GET", "/admin/finance", null, annaT);
  check("cleaner cannot read finance data → 403", r.status === 403, r.status);
}

// ---------- Visual dashboard overview ----------
r = await call("GET", "/admin/dashboard/overview", null, adminT);
check("dashboard overview: 4 KPIs with 30-day series, completion, 9 months",
  r.status === 200 && ["bookings", "revenue", "customers", "cancellation"].every((k) => r.body.kpis[k]?.series?.length === 30) &&
  r.body.monthly.length === 9 && r.body.monthly.at(-1).partial === true && typeof r.body.completion.ratePct === "number", r.status);
const monthSum = r.body.monthly.at(-1).revenueCents;
const fin = await call("GET", "/admin/finance?period=month", null, adminT);
check("dashboard month revenue matches the finance page", monthSum === fin.body.periods.month.grossCents && r.body.month.revenueCents === monthSum, { monthSum, fin: fin.body.periods?.month?.grossCents });
r = await call("GET", "/admin/dashboard/overview", null, annaT);
check("cleaner cannot read the dashboard overview → 403", r.status === 403, r.status);

// ---------- Permissions ----------
r = await call("GET", "/admin/commission", null, annaT);
check("cleaner cannot read admin commission data → 403", r.status === 403, r.status);
r = await call("PATCH", `/admin/workers/${anna._id}/commission-override`, { commissionPct: 10, reason: "selbst" }, annaT);
check("cleaner cannot set own commission → 403", r.status === 403, r.status);
r = await call("GET", "/admin/commission", null, custT);
check("customer cannot read commission data → 403", r.status === 403, r.status);
r = await call("GET", "/worker/performance", null, custT);
check("customer cannot read cleaner performance → 403", r.status === 403, r.status);

server.close();
const { failures } = summary();
console.log(failures ? `${failures} check(s) FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
