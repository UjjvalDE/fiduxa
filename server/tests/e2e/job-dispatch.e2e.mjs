// E2E: open-job marketplace (confirmed booking → offered → accepted → on the way → done)
import { ROOT, prepareEnv } from "../helpers/harness.mjs";
prepareEnv("fiduxa_e2e3");

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: AvailabilitySlot } = await import(ROOT + "/src/models/availability-slot.model.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");
const { alertUnassignedJobs } = await import(ROOT + "/src/services/job-dispatch.service.js");

await connectDB();
await User.db.dropDatabase();
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
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const mkWorker = (name, email, extra = {}) =>
  User.create({
    name, email, password: pw, role: "worker", workerStatus: "approved", emailVerified: true,
    workerProfile: { address: "Str 1", serviceAreas: ["Mitte"] }, bankAccountLast4: "1234", bankAccountHolder: name, ...extra,
  });
const anna = await mkWorker("Anna Nowak", "anna@t.local", { preferredLanguage: "pl" });
const ben = await mkWorker("Ben Weber", "ben@t.local");
await mkWorker("Pending Paul", "paul@t.local", { workerStatus: "pending_review" });

const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
const benT = await login("ben@t.local");
const paulT = await login("paul@t.local");

let r = await call("POST", "/admin/slots", { from: day(1), to: day(5), weekdays: [1,2,3,4,5,6,7], times: [{ startTime: "08:00" }, { startTime: "10:30" }, { startTime: "13:00" }], capacity: 3 }, adminT);
check("slots created", r.body.created === 15, r.body);

r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;
const slotsOf = async (d) => (await call("GET", `/bookings/availability?date=${d}`)).body.data;
const book = async (d, startTime, extra = {}) => {
  const slot = (await slotsOf(d)).find((s) => s.startTime === startTime);
  const res = await call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 75, extras: ["inside-fridge", "inside-oven"], // 4 h
    name: "Kunde Klara", email: "klara@t.local", phone: "030123456", postcode: "10115",
    address: "Invalidenstr. 5", preferredDate: d, slotId: slot.id, earlyStartConsent: true, ...extra,
  }, custT);
  return res.body.booking?.id;
};

// Two jobs on day 3: 08:00 (4 h → until 12:00) and 10:30 (overlaps), one at 13:00 (free after buffer)
const j0800 = await book(day(3), "08:00");
const j1030 = await book(day(3), "10:30");
const j1300 = await book(day(3), "13:00");
let b = await Booking.findById(j0800);
check("confirmed booking offered to cleaners", b.status === "confirmed" && b.jobOffer?.notifiedAt, b.jobOffer);

r = await call("GET", "/worker/jobs/open", null, annaT);
check("Anna sees 3 open jobs", r.body.count === 3, r.body);
const open = r.body.jobs?.[0];
check("open job hides customer name/address/phone", open && open.postcode === "10115" && !open.customerDetails && !("address" in open), open);
r = await call("GET", "/worker/jobs/open", null, paulT);
check("unapproved cleaner blocked", r.status === 403, r.body);

r = await call("POST", `/worker/jobs/${j0800}/accept`, null, annaT);
check("Anna accepts 08:00 job", r.status === 200, r.body);
r = await call("POST", `/worker/jobs/${j0800}/accept`, null, benT);
check("Ben too late → 409", r.status === 409, r.body);
r = await call("GET", "/worker/jobs/open", null, annaT);
check("overlapping 10:30 hidden for Anna, 13:00 still shown", r.body.count === 1 && r.body.jobs[0]._id === j1300, r.body.jobs?.map((j) => j.slot));
r = await call("POST", `/worker/jobs/${j1030}/accept`, null, annaT);
check("Anna cannot accept overlapping job → 409", r.status === 409, r.body);
r = await call("GET", "/worker/jobs/open", null, benT);
check("Ben sees remaining 2", r.body.count === 2, r.body);

r = await call("POST", `/worker/jobs/${j1030}/decline`, null, benT);
r = await call("GET", "/worker/jobs/open", null, benT);
check("declined job hidden for Ben", r.body.count === 1, r.body);

r = await call("GET", `/customer/bookings/${j0800}`, null, custT);
check("customer sees cleaner, no offer data", r.body.booking?.assignedWorker?.name === "Anna Nowak" && r.body.booking.jobOffer === undefined, r.body.booking?.assignedWorker);

r = await call("GET", "/worker/jobs?scope=upcoming", null, annaT);
check("accepted job in Anna's upcoming list with address", r.body.count === 1 && r.body.jobs[0].customerDetails?.address === "Invalidenstr. 5", r.body);

// Hand back (day 3 is > 24 h away)
r = await call("POST", `/worker/jobs/${j0800}/release`, { reason: "Krank" }, annaT);
check("Anna hands job back", r.status === 200, r.body);
r = await call("GET", "/worker/jobs/open", null, annaT);
check("released job not offered to Anna again", !r.body.jobs.some((j) => j._id === j0800), r.body.jobs?.map((j) => j._id));
r = await call("GET", "/worker/jobs/open", null, benT);
check("released job offered to Ben", r.body.jobs.some((j) => j._id === j0800), r.body);

// Admin assign with overlap check
r = await call("PATCH", `/admin/bookings/${j0800}/assign`, { workerId: String(ben._id) }, adminT);
check("admin assigns Ben", r.status === 200, r.body);
r = await call("PATCH", `/admin/bookings/${j1030}/assign`, { workerId: String(ben._id) }, adminT);
check("admin overlap → 409", r.status === 409, r.body);
r = await call("GET", `/admin/bookings/${j1030}`, null, adminT);
check("admin sees who declined", r.body.booking?.jobOffer?.declinedBy?.[0]?.name === "Ben Weber", r.body.booking?.jobOffer);

// Tomorrow job: hand back blocked (< 24 h), unassigned alert
const jTomorrow = await book(day(1), "08:00");
r = await call("POST", `/worker/jobs/${jTomorrow}/accept`, null, annaT);
r = await call("POST", `/worker/jobs/${jTomorrow}/release`, { reason: "Termin" }, annaT);
check("release < 24 h before → 409", r.status === 409, r.body);
const jTomorrow2 = await book(day(1), "13:00");
let alerts = await alertUnassignedJobs();
check("admin alerted about unassigned job tomorrow", alerts >= 1, alerts);
alerts = await alertUnassignedJobs();
check("alert only once", alerts === 0, alerts);

// Day of the job: on the way → start → complete with checklist
await Booking.updateOne({ _id: jTomorrow }, { preferredDate: todayInBerlin() });
r = await call("POST", `/worker/jobs/${jTomorrow}/on-the-way`, null, annaT);
check("on the way", r.status === 200 && r.body.job?.job?.onTheWayAt, r.body);
r = await call("GET", `/customer/bookings/${jTomorrow}`, null, custT);
check("customer sees on-the-way time", Boolean(r.body.booking?.job?.onTheWayAt), r.body.booking?.job);
r = await call("POST", `/worker/jobs/${jTomorrow}/start`, null, annaT);
check("start", r.body.job?.status === "in_progress", r.body);
r = await call("POST", `/worker/jobs/${jTomorrow}/complete`, { note: "Alles sauber", checklistDone: ["kitchen", "bathroom", "inside-oven"] }, annaT);
b = await Booking.findById(jTomorrow);
check("complete stores checklist", r.body.job?.status === "completed" && b.job.checklistDone.length === 3, b.job);

// Admin unassign → reopened
r = await call("PATCH", `/admin/bookings/${j0800}/assign`, { workerId: null }, adminT);
r = await call("GET", "/worker/jobs/open", null, benT);
check("unassigned job back on the board", r.body.jobs.some((j) => j._id === j0800), r.body);
void jTomorrow2;

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
await User.db.dropDatabase();
server.close();
process.exit(failures ? 1 : 0);
