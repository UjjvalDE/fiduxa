// E2E: automatic cleaner assignment (round 3, assignmentMode "auto")
//   – slots only where a SUITABLE cleaner is free (skills, location radius,
//     workload, alternating weeks, date overrides, no pattern = unavailable)
//   – cache cleared at once when a cleaner changes hours / holidays / pause
//   – after payment the best-scoring cleaner is assigned (no accept step);
//     capture / webhook retries never double-assign
//   – race for the last suitable cleaner: exactly one booking
//   – emergency → automatic replacement + customer notice (strike rule)
//   – nobody free → needs attention, admin notice, alternatives, customer
//     picks a new time (assigned) or cancels free with a full refund
//   – background retry + escalation, suspension → replacement
//   – admin dispatch: ranked list, manual reassignment under the locks,
//     history, e-mails and audit per booking; settings (weights) editable
// PayPal is a local mock, separate test DB, no real e-mails.
import { ROOT, prepareEnv, createChecker, apiClient, startPayPalMock } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_auto_assignment");
delete process.env.ASSIGNMENT_MODE; // default: auto
const paypal = await startPayPalMock();
process.env.PAYPALAPIKEY = "mock-client";
process.env.PAYPALSECRET_KEY = "mock-secret";
process.env.PAYPAL_API_BASE = paypal.url;
process.env.PAYPAL_WEBHOOK_SKIP_VERIFY = "1";
process.env.ADMIN_NOTIFICATION_EMAIL = "office@t.local";

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: Email } = await import(ROOT + "/src/models/email.model.js");
const { default: AuditLog } = await import(ROOT + "/src/models/audit-log.model.js");
const { default: BookingSeries } = await import(ROOT + "/src/models/booking-series.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");
const { weekParity } = await import(ROOT + "/src/services/worker-profile.service.js");
const { POLICIES } = await import(ROOT + "/src/config/pricing.js");
const { autoAssign, retryUnassignedBookings, supportsTransactions } = await import(ROOT + "/src/services/auto-assign.service.js");
const { confirmBooking } = await import(ROOT + "/src/services/booking-lifecycle.service.js");
const { findJob } = await import(ROOT + "/src/jobs/index.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
await loadSettings();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();
const dateOf = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS);
const day = (n) => dateOf(n).toISOString().slice(0, 10);
const isoWd = (n) => ((dateOf(n).getUTCDay() + 6) % 7) + 1;
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

// Days used below: A* in week A, B* in week B (alternating-week pattern)
const offsets = Array.from({ length: 40 }, (_, i) => i + 3);
const weekA = offsets.filter((n) => weekParity(dateOf(n)) === "A");
const weekB = offsets.filter((n) => weekParity(dateOf(n)) === "B");
const [A1, A2, A3, A4, A5, A6] = weekA;
const [B1, B2] = weekB;

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const mkWorker = (name, email, { home, km = 10, weeks = "all", weekly = ALL_DAYS, profile = {}, ...extra } = {}) =>
  User.create({
    name, email, password: pw, role: "worker", workerStatus: "approved", emailVerified: true,
    availability: weekly.map((weekday) => ({ weekday, start: "08:00", end: "18:00", weeks })),
    workerProfile: { address: `Str 1, ${home} Berlin`, serviceAreas: ["Berlin"], homePostcode: home, maxTravelKm: km, petsOk: true, ...profile },
    bankAccountLast4: "1234", bankAccountHolder: name, ...extra,
  });
// Mitte (10115): Anna (windows specialist), Ben (no ironing), Dora (week A only)
const anna = await mkWorker("Anna Nowak", "anna@t.local", { home: "10115", profile: { specialties: ["home-cleaning", "windows"] } });
const ben = await mkWorker("Ben Weber", "ben@t.local", { home: "10115", profile: { excludedExtras: ["ironing"] } });
const dora = await mkWorker("Dora Alt", "dora@t.local", { home: "10115", weeks: "A" });
// Zehlendorf (14163), 5 km radius: only Clara serves it on most days
const clara = await mkWorker("Clara Süd", "clara@t.local", { home: "14163", km: 5 });
// No weekly pattern → never available (prompt on the dashboard)
const fritz = await User.create({
  name: "Fritz Ohne", email: "fritz@t.local", password: pw, role: "worker", workerStatus: "approved", emailVerified: true,
  workerProfile: { address: "Str 1, 10115 Berlin", serviceAreas: ["Mitte"], homePostcode: "10115" }, bankAccountLast4: "1", bankAccountHolder: "Fritz",
});
const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
const benT = await login("ben@t.local");
const claraT = await login("clara@t.local");
const fritzT = await login("fritz@t.local");

check("standalone test MongoDB → transaction fallback (lock pattern) detected", (await supportsTransactions()) === false);

let r = await call("POST", "/admin/slots", { from: day(3), to: day(45), weekdays: ALL_DAYS, times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 10 }, adminT);
check("window 08:00–18:00 (capacity 10) on days 3–45", [200, 201].includes(r.status), r.body);

const customers = [];
for (const n of [1, 2, 3, 4, 5, 6]) {
  r = await call("POST", "/auth/register", { name: `Kunde ${n}`, email: `k${n}@t.local`, password: "Password12345", phone: "030 123456" });
  customers.push({ token: r.body.token, email: `k${n}@t.local` });
}
const q = (f = {}) => new URLSearchParams(Object.fromEntries(Object.entries({ serviceId: "home-cleaning", postcode: "10115", ...f }).filter(([, v]) => v !== undefined))).toString();
const slots = async (n, f, duration = 120) => (await call("GET", `/bookings/availability?date=${day(n)}&duration=${duration}&${q(f)}`)).body.data ?? [];
const at = (list, time) => list.find((s) => s.startTime === time);
const remaining = async (n, f, time = "10:00") => at(await slots(n, f), time)?.remaining ?? 0;

// ---------------------------------------------------------------------------
// 1. Slots only for suitable cleaners
// ---------------------------------------------------------------------------
check("week A, Mitte, plain cleaning: Anna, Ben, Dora free → remaining 3 (Clara too far, Fritz has no pattern)", (await remaining(A1)) === 3, await remaining(A1));
check("week B: Dora works every 2nd week only → remaining 2", (await remaining(B1)) === 2, await remaining(B1));
check("extra 'ironing': Ben does not iron → remaining 2 in week A", (await remaining(A1, { extras: "ironing" })) === 2, await remaining(A1, { extras: "ironing" }));
check("Zehlendorf 14163: only Clara (5 km radius) → remaining 1", (await remaining(A1, { postcode: "14163" })) === 1, await remaining(A1, { postcode: "14163" }));
check("outside everybody's hours (17:00 + 2 h) not offered", !at(await slots(A1), "17:00"), (await slots(A1)).map((s) => s.startTime));

// Date overrides (monthly calendar): Anna off on A2, Dora extra on B2
r = await call("PUT", "/worker/availability", { overrides: [{ date: day(A2), kind: "off", note: "Arzt" }] }, annaT);
check("Anna marks A2 as unavailable (override)", r.status === 200 && r.body.settings.overrides.length === 1, r.body);
check("A2: Anna's day off removes her at once (cache cleared) → remaining 2", (await remaining(A2)) === 2, await remaining(A2));
r = await call("GET", "/worker/availability", null, annaT);
check("availability view: weekly pattern + override + current week A/B", r.status === 200 && r.body.settings.hasWeeklyPattern && ["A", "B"].includes(r.body.settings.currentWeek) && r.body.matching.effectivePostcode === "10115", r.body);
const doraT = await login("dora@t.local");
r = await call("PUT", "/worker/availability", { overrides: [{ date: day(B2), kind: "extra", start: "08:00", end: "18:00" }] }, doraT);
check("B2: Dora adds extra hours on a week-B day → remaining 3", r.status === 200 && (await remaining(B2)) === 3, await remaining(B2));

// Holiday + pause clear the cache immediately
const beforeHoliday = await remaining(A3);
r = await call("POST", "/worker/holidays", { from: day(A3), to: day(A3) }, benT);
check("Ben's holiday on A3 is visible at once (no stale cache)", r.status === 201 && (await remaining(A3)) === beforeHoliday - 1, { before: beforeHoliday, after: await remaining(A3) });
await User.updateOne({ _id: dora._id }, { $set: { "reliability.pausedAt": new Date() } });
check("pausing Dora (any user write) clears the slot cache at once", (await remaining(A3)) === beforeHoliday - 2, await remaining(A3));
await User.updateOne({ _id: dora._id }, { $set: { "reliability.pausedAt": null } });

// No pattern → prompt
r = await call("GET", "/worker/me", null, fritzT);
check("cleaner without weekly pattern: dashboard prompt 'no_pattern'", r.body.availabilityPrompt === "no_pattern" && r.body.assignmentMode === "auto", { p: r.body.availabilityPrompt });

// Workload: Ben max 1 job per day
r = await call("PUT", "/worker/availability", { workload: { maxJobsPerDay: 1, maxHoursPerDay: null, maxJobsPerWeek: null, maxHoursPerWeek: null } }, benT);
check("Ben saves max. 1 job per day", r.status === 200 && r.body.settings.workload.maxJobsPerDay === 1, r.body);

r = await call("PUT", "/worker/matching-profile", { homePostcode: "99999", maxTravelKm: 10, excludedServices: [], excludedExtras: [] }, benT);
check("matching profile: non-Berlin postcode → 422", r.status === 422, r.status);
r = await call("PUT", "/worker/matching-profile", { homePostcode: "10115", maxTravelKm: 10, excludedServices: [], excludedExtras: ["ironing"] }, benT);
check("matching profile (home postcode, radius, skills) saved", r.status === 200 && r.body.matching.excludedExtras.includes("ironing"), r.body);

// ---------------------------------------------------------------------------
// 2. Auto-assignment after payment – the best score wins
// ---------------------------------------------------------------------------
const book = async (c, n, startTime, extra = {}) => {
  const list = await slots(n, { postcode: extra.postcode ?? "10115", extras: (extra.extras ?? []).join(",") || undefined });
  const s = at(list, startTime);
  return call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, name: "Kunde", email: c.email, phone: "030123456", postcode: "10115",
    address: "Invalidenstr. 5", preferredDate: day(n), slotId: s?.windowId ?? "000000000000000000000000", startTime,
    earlyStartConsent: true, paymentMethod: "paypal", ...extra,
  }, c.token);
};
const orderOf = (res) => new URL(res.body.checkoutUrl).searchParams.get("token");
const capture = (c, res) => call("POST", "/payments/paypal/capture", { bookingId: res.body.booking.id, orderId: orderOf(res) }, c.token);
const webhook = (orderId) =>
  fetch(`${base}/payments/paypal/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: `WH-${orderId}`, event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: orderId } }) })
    .then(async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) }));

const b1 = await book(customers[0], A1, "10:00", { extras: ["interior-windows"] });
check("booking created (payment pending, no cleaner yet)", b1.status === 201 && b1.body.booking.status === "payment_pending", b1.body);
r = await capture(customers[0], b1);
let doc = await Booking.findById(b1.body.booking.id);
check("PayPal capture → confirmed + assigned automatically (no accept step)", r.status === 200 && doc.status === "confirmed" && doc.assignment.state === "assigned" && !!doc.assignedWorker, { s: r.status, st: doc.status, a: doc.assignment });
check("best score wins: Anna (windows specialist) over Ben / Dora", String(doc.assignedWorker) === String(anna._id), String(doc.assignedWorker));
check("history: 'assigned' (score + breakdown) then 'notified'",
  doc.assignmentHistory.map((h) => h.action).join(",") === "assigned,notified" && doc.assignmentHistory[0].score > 0 && doc.assignmentHistory[0].details?.parts?.skills === 1,
  doc.assignmentHistory);
check("cleaner gets 'jobAutoAssigned' (address + time), customer 'cleanerAssigned'",
  (await Email.countDocuments({ template: "jobAutoAssigned", to: "anna@t.local", bookingRef: doc.reference })) === 1 &&
  (await Email.countDocuments({ template: "cleanerAssigned", to: "k1@t.local" })) === 1);
const annaMail = await Email.findOne({ template: "jobAutoAssigned", to: "anna@t.local" });
check("assignment mail contains address and extras", /Invalidenstr\. 5/.test(annaMail.text) && /Innenfenster/.test(annaMail.text), annaMail.text);

// ---------------------------------------------------------------------------
// 3. Idempotent: capture / webhook retries never double-assign
// ---------------------------------------------------------------------------
r = await capture(customers[0], b1);
const wh = await webhook(orderOf(b1));
const again = await Promise.all([autoAssign(doc._id), autoAssign(doc._id)]);
doc = await Booking.findById(doc._id);
check("second capture + webhook + 2× parallel autoAssign → still exactly one assignment",
  wh.status === 200 && again.every((x) => x.state === "already_assigned") && doc.assignmentHistory.filter((h) => h.action === "assigned").length === 1 &&
  (await Email.countDocuments({ template: "jobAutoAssigned", bookingRef: doc.reference })) === 1,
  { wh: wh.body, again: again.map((x) => x.state), h: doc.assignmentHistory.map((h) => h.action) });
// Capture and webhook racing for a fresh booking
const b2 = await book(customers[1], A1, "14:00");
const raced = await Promise.all([capture(customers[1], b2), webhook(orderOf(b2))]);
const doc2 = await Booking.findById(b2.body.booking.id);
check("capture and webhook in parallel → one confirmation, one assignment",
  doc2.status === "confirmed" && doc2.assignmentHistory.filter((h) => h.action === "assigned").length === 1 && (await Email.countDocuments({ template: "jobAutoAssigned", bookingRef: doc2.reference })) === 1,
  { r: raced.map((x) => x.status), h: doc2.assignmentHistory.map((h) => h.action) });
check("Anna is busy 10:00 → 14:00 job went to another cleaner (or Anna if free)", !!doc2.assignedWorker);

// Worker portal in auto mode
r = await call("GET", "/worker/jobs/open", null, benT);
check("auto mode: no open-job board for cleaners", r.status === 200 && r.body.count === 0 && r.body.assignmentMode === "auto", r.body);
r = await call("POST", `/worker/jobs/${doc._id}/accept`, null, benT);
check("auto mode: accept is refused (409 ASSIGNMENT_AUTO)", r.status === 409 && r.body.code === "ASSIGNMENT_AUTO", r.body);
r = await call("GET", "/worker/jobs", null, annaT);
const annaJob = r.body.jobs.find((j) => String(j._id) === String(doc._id));
check("Anna's dashboard lists the job as new, with address, time, duration and extras",
  annaJob?.isNew === true && annaJob.customerDetails.address === "Invalidenstr. 5" && annaJob.slot === "10:00" && annaJob.estimate.durationMinutes > 0 && annaJob.extras.includes("interior-windows"), annaJob);
r = await call("GET", "/worker/me", null, annaT);
check("dashboard counter: 1 new assignment", r.body.newAssignments >= 1, r.body.newAssignments);
await call("GET", `/worker/jobs/${doc._id}`, null, annaT);
r = await call("GET", "/worker/jobs", null, annaT);
check("opening the job marks the notice as read", r.body.jobs.find((j) => String(j._id) === String(doc._id))?.isNew === false);
r = await call("GET", `/customer/bookings/${doc._id}`, null, customers[0].token);
check("customer booking shows the cleaner (first name), no internal assignment data",
  r.body.cleaner?.firstName === "Anna" && r.body.booking.assignment?.state === "assigned" && r.body.booking.assignmentHistory === undefined && r.body.booking.assignment?.excluded === undefined, { c: r.body.cleaner, a: r.body.booking?.assignment });

// ---------------------------------------------------------------------------
// 4. Race for the last suitable cleaner (Zehlendorf: Clara only)
// ---------------------------------------------------------------------------
const z = (c) => book(c, A2, "10:00", { postcode: "14163", address: "Teltower Damm 1" });
const race = await Promise.all([z(customers[2]), z(customers[3])]);
check("two customers race for Clara's last 10:00 → exactly one 201, one 409",
  race.filter((x) => x.status === 201).length === 1 && race.filter((x) => x.status === 409).length === 1, race.map((x) => x.status));
const zWin = race.find((x) => x.status === 201);
const zCust = race[0].status === 201 ? customers[2] : customers[3];
await capture(zCust, zWin);
const zDoc = await Booking.findById(zWin.body.booking.id);
check("the winner is paid and assigned to Clara", zDoc.status === "confirmed" && String(zDoc.assignedWorker) === String(clara._id), { st: zDoc.status, w: String(zDoc.assignedWorker) });
check("Zehlendorf 10:00 no longer offered", !at(await slots(A2, { postcode: "14163" }), "10:00"));

// ---------------------------------------------------------------------------
// 5. Emergency → replacement + customer notice; strike rule
// ---------------------------------------------------------------------------
r = await call("POST", `/worker/jobs/${doc._id}/emergency`, { reason: "Kind krank" }, annaT);
doc = await Booking.findById(doc._id);
check("Anna reports an emergency (> 24 h ahead) → no strike, replacement assigned",
  r.status === 200 && !r.body.strike && r.body.replacement === "assigned" && doc.assignedWorker && String(doc.assignedWorker) !== String(anna._id), { b: r.body, w: String(doc.assignedWorker) });
check("Anna is excluded from this booking and cannot open it any more",
  doc.assignment.excluded.map(String).includes(String(anna._id)) && (await call("GET", `/worker/jobs/${doc._id}`, null, annaT)).status === 404);
check("history: emergency (who, why) → assigned (replacement) → notified",
  doc.assignmentHistory.map((h) => h.action).join(",") === "assigned,notified,emergency,assigned,notified" &&
  doc.assignmentHistory[2].reason === "Kind krank" && String(doc.assignmentHistory[2].worker) === String(anna._id) && doc.assignmentHistory[2].byRole === "worker",
  doc.assignmentHistory.map((h) => [h.action, h.reason]));
check("customer is told the cleaner changed; replacement gets the job mail",
  (await Email.countDocuments({ template: "cleanerChanged", to: "k1@t.local" })) === 1 &&
  (await Email.countDocuments({ template: "jobAutoAssigned", bookingRef: doc.reference })) === 2);
check("admin is informed about the emergency", (await Email.countDocuments({ template: "adminNotification", subject: /Notfall gemeldet/ })) === 1);
check("audit log: emergency + replacement", (await AuditLog.countDocuments({ entityId: doc._id, action: "booking.worker.emergency" })) === 1 && (await AuditLog.countDocuments({ entityId: doc._id, action: "booking.worker.auto_assigned" })) === 2);

// Short notice: emergencyNoStrikeHours (here 10 000 h) → strike
POLICIES.assignment.emergencyNoStrikeHours = 10_000;
const replacementId = doc.assignedWorker;
const replacementT = await login(String(replacementId) === String(ben._id) ? "ben@t.local" : "dora@t.local");
r = await call("POST", `/worker/jobs/${doc._id}/emergency`, { reason: "Auto kaputt" }, replacementT);
check("emergency inside emergencyNoStrikeHours → 1 reliability strike", r.status === 200 && r.body.strike?.strikes === 1, r.body);
POLICIES.assignment.emergencyNoStrikeHours = 24;
doc = await Booking.findById(doc._id);
check("…and the next cleaner takes over (never two at once)", doc.assignedWorker && ![String(anna._id), String(replacementId)].includes(String(doc.assignedWorker)), String(doc.assignedWorker));

// ---------------------------------------------------------------------------
// 6. No replacement → needs attention, alternatives, customer choices
// ---------------------------------------------------------------------------
// Gina (Zehlendorf) works only on the weekday of A2 + 1 → alternative day
const altOffset = A2 + 1;
const gina = await mkWorker("Gina Ersatz", "gina@t.local", { home: "14163", km: 5, weekly: [isoWd(altOffset)] });
r = await call("POST", `/worker/jobs/${zDoc._id}/emergency`, { reason: "Unfall" }, claraT);
let z1 = await Booking.findById(zDoc._id);
check("Clara's emergency, nobody else serves 14163 that day → needs attention (not cancelled)",
  r.status === 200 && r.body.replacement === "searching" && z1.status === "confirmed" && !z1.assignedWorker && z1.assignment.state === "needs_attention", { b: r.body, a: z1.assignment });
check("reason recorded (location) with counts", z1.assignment.reason === "location" || Object.keys(z1.assignment.reasons ?? {}).includes("location"), z1.assignment);
check("admin notified immediately ('Keine Reinigungskraft gefunden')", (await Email.countDocuments({ template: "adminNotification", subject: new RegExp(`Keine Reinigungskraft gefunden: ${z1.reference}`) })) === 1);
check("alternatives computed (Gina's day) and e-mailed to the customer with the /konto link",
  z1.assignment.alternatives?.length > 0 && z1.assignment.alternatives.every((a) => a.date === day(altOffset)) &&
  /\/konto\/buchungen\/.+\/termin-waehlen/.test((await Email.findOne({ template: "noCleanerAvailable", bookingRef: z1.reference }))?.text ?? ""),
  z1.assignment.alternatives);
r = await call("GET", `/customer/bookings/${z1._id}/cancel-preview`, null, zCust.token);
check("cancellation would be free (problem on our side)", r.body.feeCents === 0 && r.body.tier === "free_no_cleaner", r.body);
r = await call("GET", `/customer/bookings/${z1._id}/alternatives`, null, customers[0].token);
check("other customers cannot see the alternatives (404)", r.status === 404, r.status);
r = await call("GET", `/customer/bookings/${z1._id}/alternatives`, null, zCust.token);
check("customer page lists the alternatives", r.status === 200 && r.body.needsChoice && r.body.alternatives.length > 0, r.body);
const pick = r.body.alternatives.find((a) => a.startTime === "10:00") ?? r.body.alternatives[0];
r = await call("POST", `/customer/bookings/${z1._id}/alternatives`, { action: "pick", slotId: pick.slotId, startTime: pick.startTime }, zCust.token);
z1 = await Booking.findById(zDoc._id);
check("customer picks a new time → rescheduled and assigned to Gina",
  r.status === 200 && r.body.assignment.state === "assigned" && String(z1.assignedWorker) === String(gina._id) && z1.preferredDate.toISOString().slice(0, 10) === day(altOffset) && z1.slot === pick.startTime && z1.assignment.customerChoice === "rescheduled",
  { b: r.body, w: String(z1.assignedWorker), d: z1.preferredDate, s: z1.slot });
r = await call("POST", `/customer/bookings/${z1._id}/alternatives`, { action: "cancel" }, zCust.token);
check("no second choice once assigned (409)", r.status === 409, r.status);

// Second case: nobody at all → cancel free with full refund
const zz = await book(customers[4], A4, "10:00", { postcode: "14163", address: "Teltower Damm 9" });
await capture(customers[4], zz);
let z2 = await Booking.findById(zz.body.booking.id);
check("second Zehlendorf booking assigned to Clara", String(z2.assignedWorker) === String(clara._id), String(z2.assignedWorker));
r = await call("PATCH", `/admin/workers/${clara._id}/status`, { action: "suspend", note: "Test" }, adminT);
z2 = await Booking.findById(zz.body.booking.id);
check("admin suspends Clara → her future job is taken off her; nobody free → needs attention",
  r.status === 200 && !z2.assignedWorker && z2.assignment.state === "needs_attention" && z2.assignmentHistory.some((h) => h.action === "removed" && h.details?.kind === "suspended"), { a: z2.assignment, h: z2.assignmentHistory.map((h) => h.action) });
const refundsBefore = paypal.refunds;
r = await call("POST", `/customer/bookings/${z2._id}/alternatives`, { action: "wait" }, customers[4].token);
check("customer may keep waiting", r.status === 200 && (await Booking.findById(z2._id)).assignment.customerChoice === "wait");
r = await call("POST", `/customer/bookings/${z2._id}/alternatives`, { action: "cancel" }, customers[4].token);
z2 = await Booking.findById(z2._id);
check("…or cancel free of charge → cancelled, full PayPal refund, no fee",
  r.status === 200 && z2.status === "cancelled" && z2.payment.status === "refunded" && (z2.cancellation.feeCents ?? 0) === 0 && paypal.refunds === refundsBefore + 1,
  { s: r.status, st: z2.status, p: z2.payment.status, fee: z2.cancellation?.feeCents, refunds: paypal.refunds - refundsBefore });

// Third case: background retry assigns once a cleaner becomes available; escalation
const zzz = await book(customers[5], A5, "10:00", { postcode: "14163", address: "Teltower Damm 11" });
check("with Clara suspended, Zehlendorf A5 has no free time → booking refused at creation (409)", zzz.status === 409, zzz.status);
// Hold created while Clara was available, then she is gone before payment
await call("PATCH", `/admin/workers/${clara._id}/status`, { action: "reactivate", note: "ok" }, adminT);
const z3res = await book(customers[5], A5, "10:00", { postcode: "14163", address: "Teltower Damm 11" });
await User.updateOne({ _id: clara._id }, { $set: { "reliability.pausedAt": new Date() } });
await capture(customers[5], z3res);
let z3 = await Booking.findById(z3res.body.booking.id);
check("paid while the only suitable cleaner was paused → needs attention right after payment", z3.status === "confirmed" && z3.assignment.state === "needs_attention" && z3.payment.status === "paid", z3.assignment);
POLICIES.assignment.escalateHours = 100_000;
let out = await retryUnassignedBookings({ force: true });
z3 = await Booking.findById(z3._id);
check("background retry: still nobody → escalated once to the admin (DRINGEND)",
  out.escalated >= 1 && !!z3.assignment.escalatedAt && (await Email.countDocuments({ template: "adminNotification", subject: new RegExp(`DRINGEND.*${z3.reference}`) })) === 1, out);
out = await retryUnassignedBookings({ force: true });
check("escalation only once", (await Email.countDocuments({ template: "adminNotification", subject: new RegExp(`DRINGEND.*${z3.reference}`) })) === 1, out);
POLICIES.assignment.escalateHours = 24;
await User.updateOne({ _id: clara._id }, { $set: { "reliability.pausedAt": null } });
out = await retryUnassignedBookings({ force: true });
z3 = await Booking.findById(z3._id);
check("Clara back → background retry assigns her automatically", String(z3.assignedWorker) === String(clara._id) && z3.assignment.state === "assigned", { out, a: z3.assignment });
check("assignmentWatch job registered (runs every minute, lock-guarded)", Boolean(findJob("assignmentWatch")));

// ---------------------------------------------------------------------------
// 7. Admin dispatch: ranked list, manual reassignment under the locks
// ---------------------------------------------------------------------------
const m1 = await book(customers[0], A6, "10:00");
await capture(customers[0], m1);
const m2 = await book(customers[1], A6, "10:00");
await capture(customers[1], m2);
const md1 = await Booking.findById(m1.body.booking.id);
const md2 = await Booking.findById(m2.body.booking.id);
check("two parallel-time bookings on A6 assigned to two different cleaners", md1.assignedWorker && md2.assignedWorker && String(md1.assignedWorker) !== String(md2.assignedWorker));
r = await call("GET", `/admin/dispatch/bookings/${md1._id}`, null, adminT);
check("dispatch detail: ranked candidates with score + breakdown, unsuitable ones with reason",
  r.status === 200 && r.body.candidates.length >= 4 && r.body.candidates.some((c) => c.problem === "location") && r.body.candidates.every((c) => typeof c.score === "number") &&
  r.body.candidates.filter((c) => c.suitable).every((c, i, a) => i === 0 || a[i - 1].score >= c.score),
  r.body.candidates?.map((c) => [c.name, c.score, c.problem]));
r = await call("POST", `/admin/dispatch/bookings/${md1._id}/assign`, { workerId: String(md2.assignedWorker) }, adminT);
check("manual reassignment to a cleaner busy at that time → 409 WORKER_SCHEDULE_CONFLICT", r.status === 409 && r.body.code === "WORKER_SCHEDULE_CONFLICT", r.body);
r = await call("POST", `/admin/dispatch/bookings/${md1._id}/assign`, { workerId: String(clara._id) }, adminT);
check("cleaner outside the travel radius → 409 ASSIGN_OVERRIDE_REQUIRED", r.status === 409 && r.body.code === "ASSIGN_OVERRIDE_REQUIRED" && /travel radius/.test(r.body.message), r.body);
// Two admins at the same time put the same free cleaner on both overlapping jobs
const free = (await call("GET", `/admin/dispatch/bookings/${md1._id}`, null, adminT)).body.candidates.find((c) => c.suitable && ![String(md1.assignedWorker), String(md2.assignedWorker)].includes(String(c.id)));
check("a third suitable cleaner is free on A6", !!free, free);
const both = await Promise.all([
  call("POST", `/admin/dispatch/bookings/${md1._id}/assign`, { workerId: String(free.id), reason: "Kundenwunsch" }, adminT),
  call("POST", `/admin/dispatch/bookings/${md2._id}/assign`, { workerId: String(free.id), reason: "Kundenwunsch" }, adminT),
]);
check("parallel manual reassignments of one cleaner to overlapping jobs → exactly one succeeds",
  both.filter((x) => x.status === 200).length === 1 && both.filter((x) => x.status === 409 && x.body.code === "WORKER_SCHEDULE_CONFLICT").length === 1, both.map((x) => [x.status, x.body.code]));
const movedId = both[0].status === 200 ? md1._id : md2._id;
const moved = await Booking.findById(movedId);
check("reassigned booking: exactly one active cleaner, history 'reassigned' with admin + reason, old cleaner excluded",
  String(moved.assignedWorker) === String(free.id) && moved.assignmentHistory.some((h) => h.action === "reassigned" && h.byRole === "admin" && h.reason === "Kundenwunsch" && h.previousWorker) && moved.assignment.excluded.length === 1,
  moved.assignmentHistory.map((h) => [h.action, h.byRole, h.reason]));
check("previous cleaner told the job was reassigned", (await Email.countDocuments({ template: "jobRemoved", bookingRef: moved.reference })) === 1);

// Workload limit: Ben (max 1 job/day) with one job on B1 is not counted any more
check("B1 (week B) before: Anna + Ben free at 14:00 → remaining 2", (await remaining(B1, {}, "14:00")) === 2, await remaining(B1, {}, "14:00"));
const w1 = await book(customers[3], B1, "08:00");
await capture(customers[3], w1);
const wDoc = await Booking.findById(w1.body.booking.id);
if (String(wDoc.assignedWorker) !== String(ben._id)) await call("POST", `/admin/dispatch/bookings/${wDoc._id}/assign`, { workerId: String(ben._id), reason: "Test" }, adminT);
check("workload: Ben has his 1 job on B1 → 14:00 remaining 1 (only Anna)", String((await Booking.findById(wDoc._id)).assignedWorker) === String(ben._id) && (await remaining(B1, {}, "14:00")) === 1, await remaining(B1, {}, "14:00"));
const w2 = await book(customers[4], B1, "14:00");
await capture(customers[4], w2);
check("…and the next B1 booking goes to Anna, never to Ben", String((await Booking.findById(w2.body.booking.id)).assignedWorker) === String(anna._id));

// History, e-mails and audit per booking
r = await call("GET", `/admin/dispatch/bookings/${doc._id}`, null, adminT);
check("dispatch detail: assignment history with names, e-mails from the outbox, audit trail",
  r.body.history.some((h) => h.action === "emergency" && h.worker?.name === "Anna Nowak" && h.reason === "Kind krank") &&
  r.body.emails.some((e) => e.template === "cleanerChanged") && r.body.emails.some((e) => e.template === "jobAutoAssigned") &&
  r.body.audit.some((a) => a.action === "booking.worker.emergency"),
  { h: r.body.history?.map((h) => h.action), e: r.body.emails?.map((e) => e.template), a: r.body.audit?.map((a) => a.action) });
r = await call("GET", `/admin/dispatch?from=${day(A1)}&days=7`, null, adminT);
check("dispatch overview: availability grid, upcoming assignments, emergencies, day-offs, cleaners without pattern",
  r.status === 200 && r.body.mode === "auto" && r.body.availability.some((a) => a.name === "Anna Nowak" && a.days.length === 7) &&
  r.body.upcoming.length > 0 && r.body.emergencies.some((e) => e.reason === "Kind krank") && r.body.dayOffs.some((d) => d.kind === "day_off" && d.worker.name === "Anna Nowak") &&
  r.body.cleanersWithoutPattern.some((c) => c.name === "Fritz Ohne"),
  { keys: Object.keys(r.body), e: r.body.emergencies?.length });
const annaRow = r.body.availability.find((a) => a.name === "Anna Nowak");
check("availability grid: Anna's day off shown as 'day_off', normal days with 08:00–18:00", annaRow.days.find((d) => d.date === day(A2))?.off === "day_off" && annaRow.days.find((d) => d.date === day(A1))?.windows[0] === "08:00–18:00", annaRow.days.slice(0, 3));
r = await call("GET", `/admin/dispatch`, null, annaT);
check("dispatch API is admin-only (cleaner → 403)", r.status === 403, r.status);

// ---------------------------------------------------------------------------
// 8. Admin manual booking + recurring plan prefer the plan's cleaner
// ---------------------------------------------------------------------------
r = await call("POST", "/admin/customers", { name: "Telefon Tom", email: "tom@t.local", phone: "0301234", locale: "de" }, adminT);
const tom = r.body.customer;
const mSlot = at(await slots(A3, {}, 180), "08:00");
r = await call("POST", "/admin/bookings", {
  customerId: tom.id, serviceId: "home-cleaning", areaM2: 60, condition: "normal", frequency: "one-time", extras: [],
  preferredDate: day(A3), slotId: mSlot.windowId, startTime: "08:00", customerDetails: { phone: "0301234", postcode: "10115", address: "Torstr. 1" }, paymentMethod: "invoice",
}, adminT);
const manualDoc = await Booking.findById(r.body.booking?.id ?? r.body.booking?._id);
check("admin phone booking (confirmed) is assigned automatically", r.status === 201 && manualDoc?.assignment?.state === "assigned" && !!manualDoc.assignedWorker, { s: r.status, b: r.body, a: manualDoc?.assignment });

const k3 = (await User.findOne({ email: "k3@t.local" }))._id;
const series = await BookingSeries.create({
  customer: k3, preferredWorker: dora._id, status: "active", createdFrom: md1._id,
  template: { serviceId: "home-cleaning", areaM2: 60, frequency: "weekly", paymentMethod: "invoice", customerDetails: { name: "K3", email: "k3@t.local", phone: "030", postcode: "10115", address: "Torstr. 9" }, durationMinutes: 120, startTime: "12:00", weekday: 1 },
  nextDate: dateOf(A3 + 7),
}).catch((e) => ({ error: e.message }));
check("recurring plan with preferred cleaner Dora (fixture)", !series.error, series.error);
const occ = await Booking.create({
  reference: "FID-RECUR-1", customer: k3, serviceId: "home-cleaning", areaM2: 60, extras: ["interior-windows"],
  customerDetails: { name: "K3", email: "k3@t.local", phone: "030", postcode: "10115", address: "Torstr. 9" },
  preferredDate: dateOf(A3), slot: "12:00", slotEnd: "14:00", estimate: { durationMinutes: 120, totalCents: 5000 }, series: series._id, seriesIndex: 2,
  payment: { status: "unpaid", method: "invoice" }, status: "payment_pending",
});
await confirmBooking(occ, { note: "Recurring plan – confirmed", paid: false });
const occDoc = await Booking.findById(occ._id);
check("recurring occurrence: auto-assigned to the plan's cleaner (Dora) although Anna scores higher on windows", String(occDoc.assignedWorker) === String(dora._id), String(occDoc.assignedWorker));

// ---------------------------------------------------------------------------
// 9. Settings: weights / rules editable, board mode reachable for rollback
// ---------------------------------------------------------------------------
r = await call("GET", "/admin/settings", null, adminT);
const policies = r.body.settings.policies;
check("settings expose the assignment rules (mode auto, weights, emergency rule)", policies.assignment?.mode === "auto" && policies.assignment.weights.distance === 25 && policies.assignment.emergencyNoStrikeHours === 24, policies.assignment);
r = await call("PUT", "/admin/settings", { policies: { ...policies, assignment: { ...policies.assignment, weights: { ...policies.assignment.weights, rating: 40 }, emergencyNoStrikeHours: 48 } } }, adminT);
check("admin changes weights + strike rule", r.status === 200 && r.body.settings.policies.assignment.weights.rating === 40 && POLICIES.assignment.emergencyNoStrikeHours === 48, r.body);
r = await call("PUT", "/admin/settings", { policies: { ...policies, assignment: { ...policies.assignment, weights: { distance: 0, skills: 0, rating: 0, reliability: 0, preference: 0, workload: 0 } } } }, adminT);
check("all weights 0 → 422", r.status === 422, r.status);
r = await call("PUT", "/admin/settings", { policies: { ...policies, assignment: { ...policies.assignment, mode: "board" } } }, adminT);
const boardB = await book(customers[2], A6, "15:00");
await capture(customers[2], boardB);
const boardDoc = await Booking.findById(boardB.body.booking.id);
const open = await call("GET", "/worker/jobs/open", null, annaT);
check("board mode (rollback): paid booking stays unassigned and appears on the job board", r.status === 200 && !boardDoc.assignedWorker && open.body.jobs?.some((j) => String(j._id) === String(boardDoc._id)), { a: String(boardDoc.assignedWorker), n: open.body.count });
r = await call("POST", `/worker/jobs/${boardDoc._id}/accept`, null, annaT);
check("board mode: accepting works again", r.status === 200, r.body);
r = await call("PUT", "/admin/settings", { policies: { ...policies, assignment: { ...policies.assignment, mode: "auto" } } }, adminT);
check("back to auto mode", r.status === 200 && POLICIES.assignment.mode === "auto");

const { failures, passes } = summary();
console.log(`\n${passes} passed, ${failures} failed`);
server.close();
await paypal.close?.();
await User.db.dropDatabase();
await User.db.close();
process.exit(failures ? 1 : 0);
