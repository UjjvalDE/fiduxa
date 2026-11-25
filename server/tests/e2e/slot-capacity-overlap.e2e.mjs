// E2E: cleaner-aware slot capacity + "no overlapping jobs for a cleaner"
//   – customers only see start times where an eligible cleaner is free for the
//     WHOLE job (incl. travel buffer); a slot disappears when the last free
//     cleaner is taken and comes back after a cancel / an expired hold
//   – two customers racing for the last capacity: exactly one wins
//   – accept / admin assign / duration edit / extra time never create overlaps
//     (409 WORKER_SCHEDULE_CONFLICT)
import { ROOT, prepareEnv, createChecker, apiClient, startPayPalMock, ALWAYS_AVAILABLE, BERLIN_WIDE } from "../helpers/harness.mjs";
prepareEnv("fiduxa_e2e_slotcap");
// Legacy job board (assignmentMode "board"): this suite tests cleaners accepting /
// handing back jobs from the open-job board. Automatic assignment is covered by
// auto-assignment.e2e.mjs; the board stays reachable for a rollback.
process.env.ASSIGNMENT_MODE = "board";
process.env.SLOT_CAPACITY_MODE = "cleaners";

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: AvailabilitySlot } = await import(ROOT + "/src/models/availability-slot.model.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");
const { expireStaleHolds, bumpAvailability } = await import(ROOT + "/src/services/availability.service.js");
const { OPERATIONS } = await import(ROOT + "/src/config/pricing.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
const server = app.listen(0);
const call = apiClient(`http://127.0.0.1:${server.address().port}/api/v1`);
const { check, summary } = createChecker();
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const mkWorker = (name, email, extra = {}) =>
  User.create({
    name, email, password: pw, role: "worker", availability: ALWAYS_AVAILABLE, workerStatus: "approved", emailVerified: true,
    workerProfile: { ...BERLIN_WIDE, address: "Str 1", serviceAreas: ["Mitte"] }, bankAccountLast4: "1234", bankAccountHolder: name, ...extra,
  });
const anna = await mkWorker("Anna Nowak", "anna@t.local");
const ben = await mkWorker("Ben Weber", "ben@t.local");
// Not eligible → never counted as capacity
await mkWorker("Paul Pending", "paul@t.local", { workerStatus: "pending_review" });
await mkWorker("Hanna Holiday", "hanna@t.local", { holidays: [{ from: day(1), to: day(30) }] });
const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
const benT = await login("ben@t.local");

// One big window (capacity 5 > 2 eligible cleaners → the cleaners are the limit)
let r = await call("POST", "/admin/slots", { from: day(3), to: day(4), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 5 }, adminT);
check("window 08:00–18:00, capacity 5 created", r.status === 201 || r.status === 200, r.body);

const customers = [];
for (const n of [1, 2, 3, 4]) {
  r = await call("POST", "/auth/register", { name: `Kunde ${n}`, email: `k${n}@t.local`, password: "Password12345", phone: "030 123456" });
  customers.push({ token: r.body.token, email: `k${n}@t.local` });
}
const D = day(3);
const slots = async (d = D, duration = 120) => (await call("GET", `/bookings/availability?date=${d}&duration=${duration}`)).body.data ?? [];
const at = (list, time) => list.find((s) => s.startTime === time);
const book = (c, startTime, extra = {}, d = D, windowId) =>
  slots(d).then((list) => {
    const s = at(list, startTime);
    return call("POST", "/bookings", {
      serviceId: "home-cleaning", areaM2: 60, name: "Kunde", email: c.email, phone: "030123456",
      postcode: "10115", address: "Invalidenstr. 5", preferredDate: d, slotId: windowId ?? s?.windowId ?? "000000000000000000000000", startTime,
      earlyStartConsent: true, ...extra,
    }, c.token);
  });

// ---------- Slot list follows the free cleaners ----------
let list = await slots();
check("10:00 offered with remaining = 2 (2 eligible cleaners, not the window's 5)", at(list, "10:00")?.remaining === 2, at(list, "10:00"));

r = await book(customers[0], "10:00");
const job1 = r.body.booking?.id;
const job1Doc = await Booking.findById(job1);
check("customer 1 books 10:00 (2 h)", r.status === 201 && job1Doc.estimate.durationMinutes === 120 && job1Doc.slotEnd === "12:00", { s: r.status, b: r.body });
list = await slots();
check("after one booking: 10:00 remaining 1 (unassigned booking consumes a cleaner)", at(list, "10:00")?.remaining === 1, at(list, "10:00"));
check("overlapping 11:00 also down to 1 (whole duration is checked)", at(list, "11:00")?.remaining === 1, at(list, "11:00"));

// ---------- Race for the LAST capacity: exactly one wins ----------
const race = await Promise.all([book(customers[1], "10:00"), book(customers[2], "10:00")]);
check("two customers race for the last 10:00 capacity → exactly one 201, one 409",
  race.filter((x) => x.status === 201).length === 1 && race.filter((x) => x.status === 409).length === 1, race.map((x) => x.status));
const job2 = race.find((x) => x.status === 201)?.body.booking?.id;

list = await slots();
check("capacity used up: 10:00 hidden for other customers", !at(list, "10:00"), list.map((s) => s.startTime));
check("09:00 and 11:00 hidden too (would overlap for part of the job)", !at(list, "09:00") && !at(list, "11:00"), list.map((s) => s.startTime));
check(`12:00 hidden (inside the ${OPERATIONS.travelBufferMinutes} min travel buffer), 12:30 visible`, !at(list, "12:00") && !!at(list, "12:30"), list.map((s) => s.startTime));
const long = await slots(D, 240);
check("4 h job: 08:00 not offered (runs into the 10:00 jobs), 12:30 offered", !at(long, "08:00") && !!at(long, "12:30"), long.map((s) => s.startTime));
r = await call("POST", "/bookings", {
  serviceId: "home-cleaning", areaM2: 60, name: "Kunde", email: customers[3].email, phone: "030123456", postcode: "10115",
  address: "Invalidenstr. 5", preferredDate: D, slotId: at(list, "12:30").windowId, startTime: "10:30", earlyStartConsent: true,
}, customers[3].token);
check("server re-checks at creation: hidden 10:30 cannot be booked directly → 409", r.status === 409, r.body);

// ---------- Cleaners: no overlapping jobs ----------
const both = await Promise.all([call("POST", `/worker/jobs/${job1}/accept`, null, annaT), call("POST", `/worker/jobs/${job2}/accept`, null, annaT)]);
check("Anna accepts two overlapping jobs in parallel → exactly one succeeds",
  both.filter((x) => x.status === 200).length === 1 && both.filter((x) => x.status === 409).length === 1, both.map((x) => [x.status, x.body.code]));
const lost = both[0].status === 200 ? job2 : job1;
const annaJob = both[0].status === 200 ? job1 : job2;
check("refusal carries code WORKER_SCHEDULE_CONFLICT", both.find((x) => x.status === 409)?.body.code === "WORKER_SCHEDULE_CONFLICT", both.map((x) => x.body));
r = await call("PATCH", `/admin/bookings/${lost}/assign`, { workerId: String(anna._id) }, adminT);
check("admin assigning Anna to the overlapping job → 409 WORKER_SCHEDULE_CONFLICT", r.status === 409 && r.body.code === "WORKER_SCHEDULE_CONFLICT", r.body);
r = await call("POST", `/worker/jobs/${lost}/accept`, null, benT);
check("Ben (free) accepts the other job", r.status === 200, r.body);
list = await slots();
check("both cleaners busy 10–12: 10:00 still hidden", !at(list, "10:00"), list.map((s) => s.startTime));

// Anna gets a 13:00 job (12:00 end + 30 min buffer = 12:30 ≤ 13:00 → fine)
r = await book(customers[3], "13:00");
const job3 = r.body.booking?.id;
r = await call("POST", `/worker/jobs/${job3}/accept`, null, annaT);
check("Anna accepts 13:00 after her 10–12 job (buffer respected)", r.status === 200, r.body);
r = await call("PATCH", `/admin/bookings/${annaJob}/details`, { durationMinutes: 180, notify: false }, adminT);
let annaDoc = await Booking.findById(annaJob);
check("admin extending Anna's 10:00 job to 3 h (runs into 13:00) → 409 WORKER_SCHEDULE_CONFLICT, unchanged",
  r.status === 409 && r.body.code === "WORKER_SCHEDULE_CONFLICT" && annaDoc.estimate.durationMinutes === 120, { s: r.status, b: r.body, d: annaDoc.estimate.durationMinutes });

// Extra time on the running job would overlap the 13:00 job as well
await Booking.updateOne({ _id: annaJob }, { $set: { status: "in_progress", "job.startedAt": new Date() } });
r = await call("POST", `/worker/jobs/${annaJob}/extra-time`, { minutes: 60, reason: "Mehr Schmutz als erwartet" }, annaT);
check("extra time that would overlap the next job → 409 WORKER_SCHEDULE_CONFLICT", r.status === 409 && r.body.code === "WORKER_SCHEDULE_CONFLICT", r.body);
r = await call("POST", `/worker/jobs/${annaJob}/extra-time`, { minutes: 15, reason: "Kurz noch die Fenster" }, annaT);
check("15 min extra time still fits before the buffer → 201", r.status === 201, r.body);
await Booking.updateOne({ _id: annaJob }, { $set: { status: "confirmed" }, $unset: { "job.startedAt": 1 } });

// ---------- Cancel → the slot comes back ----------
const lostOwner = (await Booking.findById(lost).select("customerDetails.email")).customerDetails.email;
r = await call("POST", `/customer/bookings/${lost}/cancel`, {}, customers.find((c) => c.email === lostOwner).token);
check("customer cancels Ben's 10:00 job", r.status === 200, r.body);
list = await slots();
check("after the cancel 10:00 is visible again (remaining 1)", at(list, "10:00")?.remaining === 1, at(list, "10:00"));

// ---------- Hold (reservation) expiry → the slot comes back ----------
const paypal = await startPayPalMock();
process.env.PAYPAL_API_BASE = paypal.url;
process.env.PAYPALAPIKEY = "mock-client";
process.env.PAYPALSECRET_KEY = "mock-secret";
r = await book(customers[2], "10:00", { paymentMethod: "paypal" });
const hold = r.body.booking?.id;
check("PayPal booking holds the last 10:00 capacity (payment_pending)", r.status === 201 && r.body.booking.status === "payment_pending", r.body);
list = await slots();
check("held slot hidden while the customer pays", !at(list, "10:00"), list.map((s) => s.startTime));
await Booking.updateOne({ _id: hold }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
const expired = await expireStaleHolds();
list = await slots();
check("hold expired → slot visible again", expired === 1 && at(list, "10:00")?.remaining === 1, { expired, s: at(list, "10:00") });

// ---------- Cleaner pool edge cases ----------
await User.updateOne({ _id: ben._id }, { $set: { "reliability.pausedAt": new Date(), "reliability.pausedUntil": new Date(Date.now() + 30 * DAY_MS) } });
bumpAvailability(); // direct DB edits bypass the 15 s availability cache
list = await slots();
check("paused cleaner no longer counts: 10:00 hidden (Anna busy, Ben paused)", !at(list, "10:00"), list.map((s) => s.startTime));
await User.updateOne({ _id: ben._id }, { $unset: { "reliability.pausedAt": 1, "reliability.pausedUntil": 1 } });
await User.updateOne({ _id: ben._id }, { $set: { availability: [{ weekday: 1, start: "08:00", end: "09:00" }] } });
bumpAvailability();
const d4 = day(4);
list = await slots(d4);
check("day 4: only Anna fits (Ben's weekly hours do not cover the job) → remaining 1", at(list, "10:00")?.remaining === 1, at(list, "10:00"));

// Legacy window mode (config switch): admin capacity only
OPERATIONS.slotCapacity.mode = "window";
bumpAvailability();
list = await slots(d4, 150);
check("slotCapacity.mode = window → admin capacity (5) again", at(list, "10:00")?.remaining === 5, at(list, "10:00"));
OPERATIONS.slotCapacity.mode = "cleaners";

const { failures, passes } = summary();
console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"} (${passes} passed)`);
await User.db.dropDatabase();
server.close();
paypal.close();
process.exit(failures ? 1 : 0);
