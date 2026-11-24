// E2E: cleaner profile, availability/holidays/pets, messages, reviews, earnings/payouts, PayPal
import { ROOT, prepareEnv, startPayPalMock } from "../helpers/harness.mjs";
prepareEnv("fiduxa_e2e4");

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");
const fs = await import("node:fs");
// PayPal sandbox keys (only loaded, never printed)

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: AvailabilitySlot } = await import(ROOT + "/src/models/availability-slot.model.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");

await connectDB();
await User.db.dropDatabase();
// Rebuild every index before testing (unique indexes back business rules)
for (const M of Object.values(User.db.models)) await M.syncIndexes(); // syncAllIndexes
await AvailabilitySlot.syncIndexes();
await (await import(ROOT + "/src/models/reservation-lock.model.js")).default.syncIndexes();
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
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = { raw: text.length }; }
  return { status: res.status, body: json, headers: res.headers };
};
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);
const weekday = (iso) => { const d = new Date(iso + "T00:00:00Z").getUTCDay(); return d === 0 ? 7 : d; };

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const mkWorker = (name, email, extra = {}) =>
  User.create({
    name, email, password: pw, role: "worker", workerStatus: "approved", emailVerified: true,
    workerProfile: { address: "Str 1", serviceAreas: ["Mitte"] }, bankAccountLast4: "1234", bankAccountHolder: name, ...extra,
  });
const anna = await mkWorker("Anna Nowak", "anna@t.local");
const ben = await mkWorker("Ben Weber", "ben@t.local");
const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
const benT = await login("ben@t.local");

// ---------- Profile ----------
let r = await call("PUT", "/worker/profile", {
  address: "Torstr. 1", serviceAreas: ["Mitte", "Pankow"], experienceYears: 4,
  bio: "Gründlich und pünktlich.", languages: ["de", "pl"], specialties: ["windows", "ironing"], petsOk: true, bringsSupplies: true,
}, annaT);
check("Anna saves public profile", r.status === 200 && r.body.workerProfile.petsOk === true && r.body.workerProfile.specialties.length === 2, r.body);
r = await call("PUT", "/worker/profile", { address: "Torstr. 1", serviceAreas: ["Mitte"], experienceYears: 1, specialties: ["juggling"] }, annaT);
check("unknown specialty rejected", r.status === 422, r.body);

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
r = await call("PUT", "/worker/avatar", { image: "data:image/jpeg;base64," + jpeg.toString("base64") }, annaT);
check("avatar upload", r.status === 200 && r.body.avatarUrl?.startsWith(`/api/v1/cleaners/${anna._id}/avatar`), r.body);
r = await call("PUT", "/worker/avatar", { image: "data:image/png;base64," + Buffer.from("<svg onload=alert(1)>").toString("base64") }, annaT);
check("fake image rejected", r.status === 422, r.body);
const av = await fetch(base.replace("/api/v1", "") + `/api/v1/cleaners/${anna._id}/avatar`);
check("avatar served as jpeg", av.status === 200 && av.headers.get("content-type") === "image/jpeg", av.status);

r = await call("GET", "/worker/me", null, annaT);
check("overview has stats, earnings, options", r.body.stats && r.body.earnings && r.body.options?.specialties?.length > 3 && r.body.worker.avatarUrl, Object.keys(r.body));

// ---------- Public profile ----------
r = await call("GET", "/cleaners");
check("public list shows 2 cleaners", r.body.count === 2, r.body);
r = await call("GET", `/cleaners/${anna._id}`);
check("public profile: first name only, no email/address", r.body.cleaner?.firstName === "Anna" && !JSON.stringify(r.body).includes("anna@t.local") && !JSON.stringify(r.body).includes("Torstr"), r.body);
await call("PUT", "/worker/profile", { address: "Str 1", serviceAreas: ["Mitte"], experienceYears: 1, publicVisible: false }, benT);
r = await call("GET", "/cleaners");
check("hidden profile not listed", r.body.count === 1, r.body.count);

// ---------- Slots + bookings ----------
r = await call("POST", "/admin/slots", { from: day(1), to: day(6), weekdays: [1,2,3,4,5,6,7], times: [{ startTime: "08:00" }, { startTime: "13:00" }], capacity: 5 }, adminT);
check("slots created", r.body.created === 12, r.body);
r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;
const book = async (d, startTime, extra = {}) => {
  const slot = (await call("GET", `/bookings/availability?date=${d}`)).body.data.find((s) => s.startTime === startTime);
  const res = await call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, name: "Kunde Klara", email: "klara@t.local", phone: "030123456", postcode: "10115",
    address: "Invalidenstr. 5", preferredDate: d, slotId: slot.id, earlyStartConsent: true, ...extra,
  }, custT);
  return res.body;
};

// Pets: only Anna (petsOk) may see it
let res = await book(day(3), "08:00", { pets: true });
const jPets = res.booking?.id;
check("booking with pets confirmed (invoice mode)", res.booking?.status === "confirmed", res);
r = await call("GET", "/worker/jobs/open", null, benT);
check("pets job hidden for Ben", !r.body.jobs.some((j) => j._id === jPets), r.body.jobs?.length);
r = await call("POST", `/worker/jobs/${jPets}/accept`, null, benT);
check("Ben cannot accept pets job", r.status === 409 && r.body.reason === "pets", r.body);
r = await call("GET", "/worker/jobs/open", null, annaT);
check("pets job visible for Anna with pets flag", r.body.jobs.some((j) => j._id === jPets && j.pets === true), r.body.jobs);

// Holiday: Ben on holiday day 4
r = await call("POST", "/worker/holidays", { from: day(4), to: day(5), note: "Urlaub" }, benT);
check("Ben adds holiday", r.status === 201 && r.body.holidays.length === 1, r.body);
const holidayId = r.body.holidays?.[0]?.id;
res = await book(day(4), "08:00");
const jHoliday = res.booking?.id;
r = await call("GET", "/worker/jobs/open", null, benT);
check("holiday job hidden for Ben", !r.body.jobs.some((j) => j._id === jHoliday), r.body.jobs?.map((j) => j._id));
r = await call("PATCH", `/admin/bookings/${jHoliday}/assign`, { workerId: String(ben._id) }, adminT);
check("admin cannot assign Ben on holiday", r.status === 409, r.body);
r = await call("POST", `/worker/jobs/${jHoliday}/accept`, null, annaT);
check("Anna accepts holiday-day job", r.status === 200, r.body);
r = await call("POST", "/worker/holidays", { from: day(4), to: day(4) }, annaT);
check("holiday over accepted job rejected", r.status === 409, r.body);
r = await call("DELETE", `/worker/holidays/${holidayId}`, null, benT);
check("Ben deletes holiday", r.status === 200 && r.body.holidays.length === 0, r.body);

// Weekly hours: Ben only works afternoons on day 6's weekday
r = await call("PUT", "/worker/availability", { weekly: [{ weekday: weekday(day(6)), start: "12:00", end: "18:00" }] }, benT);
check("Ben saves working hours", r.status === 200 && r.body.availability.length === 1, r.body);
r = await call("PUT", "/worker/availability", { weekly: [{ weekday: 1, start: "18:00", end: "08:00" }] }, benT);
check("invalid hours rejected", r.status === 422, r.body);
const jMorning = (await book(day(6), "08:00")).booking?.id;
const jAfternoon = (await book(day(6), "13:00")).booking?.id;
r = await call("GET", "/worker/jobs/open", null, benT);
const benIds = r.body.jobs.map((j) => j._id);
check("outside hours hidden, inside shown", !benIds.includes(jMorning) && benIds.includes(jAfternoon), benIds);

// Calendar
r = await call("GET", `/worker/calendar?from=${day(0)}&to=${day(30)}`, null, annaT);
check("calendar lists Anna's job", r.body.jobs?.some((j) => j._id === jHoliday && j.date === day(4)), r.body);

// ---------- Messages ----------
r = await call("POST", `/customer/bookings/${jHoliday}/messages`, { body: "Bitte klingeln bei Müller." }, custT);
check("customer posts message", r.status === 201 && r.body.message.mine, r.body);
r = await call("GET", `/worker/jobs/${jHoliday}/messages`, null, annaT);
check("cleaner sees customer message (first name)", r.body.messages?.length === 1 && r.body.messages[0].authorName === "Kunde" && !r.body.messages[0].mine, r.body);
r = await call("POST", `/worker/jobs/${jHoliday}/messages`, { body: "Alles klar, bis dann!" }, annaT);
r = await call("POST", `/admin/bookings/${jHoliday}/messages`, { body: "Wir haben es notiert." }, adminT);
r = await call("GET", `/customer/bookings/${jHoliday}`, null, custT);
check("customer sees unread count 2 and cleaner card", r.body.unreadMessages === 2 && r.body.cleaner?.firstName === "Anna" && r.body.cleaner.avatarUrl, { u: r.body.unreadMessages, c: r.body.cleaner });
r = await call("GET", `/customer/bookings/${jHoliday}/messages`, null, custT);
check("customer thread: 3 messages, office labelled Fiduxa", r.body.messages?.length === 3 && r.body.messages[2].authorName === "Fiduxa", r.body.messages);
r = await call("GET", `/worker/jobs/${jHoliday}/messages`, null, benT);
check("other cleaner cannot read thread", r.status === 404, r.status);
r = await call("GET", `/customer/bookings/${jHoliday}`, null, custT);
check("read after opening", r.body.unreadMessages === 0, r.body.unreadMessages);

// ---------- Complete → earnings → review → payout ----------
await Booking.updateOne({ _id: jHoliday }, { preferredDate: todayInBerlin() });
await call("POST", `/worker/jobs/${jHoliday}/on-the-way`, null, annaT);
await call("POST", `/worker/jobs/${jHoliday}/start`, null, annaT);
r = await call("POST", `/worker/jobs/${jHoliday}/complete`, { note: "ok" }, annaT);
let b = await Booking.findById(jHoliday);
check("completion records pay (75 % of €50)", b.workerPayout?.amountCents === 3750 && b.workerPayout.status === "pending", b.workerPayout);
r = await call("GET", "/worker/earnings", null, annaT);
check("earnings: pending 36 €, status pending", r.body.summary?.pendingCents === 3750 && r.body.jobs?.[0]?.status === "pending", r.body.summary);

r = await call("GET", `/customer/bookings/${jHoliday}`, null, custT);
check("customer can review", r.body.canReview === true, r.body.canReview);
r = await call("POST", `/customer/bookings/${jHoliday}/review`, { rating: 5, punctuality: 5, quality: 4, comment: "Super!" }, custT);
check("review saved", r.status === 201, r.body);
r = await call("POST", `/customer/bookings/${jHoliday}/review`, { rating: 1 }, custT);
check("second review rejected", r.status === 409, r.body);
r = await call("POST", `/customer/bookings/${jPets}/review`, { rating: 5 }, custT);
check("review of unfinished job rejected", r.status === 409, r.body);
r = await call("GET", `/cleaners/${anna._id}`);
check("public profile shows rating 5, 1 job, reliability 100", r.body.cleaner?.ratingAvg === 5 && r.body.cleaner.jobsCompleted === 1 && r.body.cleaner.reliabilityPct === 100 && r.body.cleaner.reviews[0].author === "Kunde K.", r.body.cleaner);

r = await call("GET", "/admin/payouts/open", null, adminT);
check("admin sees pending payout (not yet due)", r.body.totals?.pendingCents === 3750 && r.body.totals.dueCents === 0, r.body.totals);
r = await call("POST", "/admin/payouts", { workerId: String(anna._id) }, adminT);
check("nothing due yet → 409", r.status === 409, r.body);
await Booking.updateOne({ _id: jHoliday }, { "workerPayout.dueAt": new Date(Date.now() - 1000) });
r = await call("GET", "/worker/earnings", null, annaT);
check("after 30 days status is due", r.body.jobs?.[0]?.status === "due" && r.body.summary.dueCents === 3750, r.body.jobs?.[0]);
r = await call("POST", "/admin/payouts", { workerId: String(anna._id), note: "SEPA" }, adminT);
check("admin records payout", r.status === 201 && r.body.payout.amountCents === 3750 && r.body.payout.reference.startsWith("AUS-"), r.body);
r = await call("GET", "/worker/earnings", null, annaT);
check("cleaner sees paid + payout history", r.body.jobs?.[0]?.status === "paid" && r.body.payouts?.length === 1 && r.body.summary.paidCents === 3750, r.body);

r = await call("PATCH", `/admin/workers/${ben._id}/pay-rate`, { payRateCents: 2000 }, adminT);
check("admin sets custom pay rate", r.body.payRateCents === 2000 && r.body.custom, r.body);
r = await call("GET", `/admin/workers/${anna._id}/review`, null, adminT);
check("admin worker view has stats + avatar", r.body.stats?.ratingAvg === 5 && r.body.worker?.avatarUrl, r.body.stats);
r = await call("GET", "/admin/reviews", null, adminT);
const reviewId = r.body.reviews?.[0]?._id;
r = await call("PATCH", `/admin/reviews/${reviewId}`, { hidden: true }, adminT);
r = await call("GET", `/cleaners/${anna._id}`);
check("hidden review removed from public profile", r.body.cleaner?.ratingCount === 0 && r.body.cleaner.reviews.length === 0, r.body.cleaner?.ratingCount);

// ---------- PayPal (sandbox) ----------
// PayPal MOCK (no external calls, no money)
const paypal = await startPayPalMock();
process.env.PAYPAL_API_BASE = paypal.url;
process.env.PAYPALAPIKEY = "mock-client";
process.env.PAYPALSECRET_KEY = "mock-secret";
paypal.nextCapture = "DECLINED";
r = await call("GET", "/payments/config");
check("payment config lists paypal", r.body.methods?.includes("paypal") && r.body.onlinePaymentAvailable, r.body);
res = await book(day(2), "13:00", { paymentMethod: "paypal" });
const jPay = res.booking?.id;
check("booking reserved with PayPal approval link", res.booking?.status === "payment_pending" && /paypal\.com/.test(res.checkoutUrl ?? "") && res.booking.payment.method === "paypal", { status: res.booking?.status, url: (res.checkoutUrl || "").slice(0, 40) });
r = await call("POST", "/payments/checkout", { bookingId: jPay, method: "paypal" }, custT);
check("retry reuses the open PayPal order", r.status === 200 && r.body.url === res.checkoutUrl, r.status);
const orderId = new URL(res.checkoutUrl).searchParams.get("token");
r = await call("POST", "/payments/paypal/capture", { bookingId: jPay, orderId }, custT);
check("capture of unapproved order → 402, not paid", r.status === 402, r.body);
b = await Booking.findById(jPay);
check("booking still payment_pending", b.status === "payment_pending" && b.payment.status !== "paid", { s: b.status, p: b.payment.status });
r = await call("POST", `/customer/bookings/${jPay}/cancel`, {}, custT);
r = await call("POST", "/payments/paypal/capture", { bookingId: jPay, orderId }, custT);
check("capture after cancel refused (409)", r.status === 409, r.body);

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
await User.db.dropDatabase();
server.close();
paypal.close();
process.exit(failures ? 1 : 0);
