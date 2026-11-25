// E2E: admin price settings, duration-based start times, concurrency, cash, forgot password, admin team
import { ROOT, prepareEnv, ALWAYS_AVAILABLE, BERLIN_WIDE } from "../helpers/harness.mjs";
prepareEnv("fiduxa_e2e5");
// Legacy job board (assignmentMode "board"): this suite tests cleaners accepting /
// handing back jobs from the open-job board. Automatic assignment is covered by
// auto-assignment.e2e.mjs; the board stays reachable for a rollback.
process.env.ASSIGNMENT_MODE = "board";
// Admin window capacity only: these checks are about window capacity / pricing, not the
// cleaner pool (cleaner-aware slots are covered in slot-capacity-overlap.e2e.mjs)
process.env.SLOT_CAPACITY_MODE = "window";
// Common production format "Name <address>" must not break the settings form
process.env.SMTP_FROM = "Fiduxa <office@t.local>";

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");
const { createHash } = await import("node:crypto");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { default: AvailabilitySlot } = await import(ROOT + "/src/models/availability-slot.model.js");
const { default: ReservationLock } = await import(ROOT + "/src/models/reservation-lock.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");

await connectDB();
await User.db.dropDatabase();
// Rebuild every index before testing (unique indexes back business rules)
for (const M of Object.values(User.db.models)) await M.syncIndexes(); // syncAllIndexes
await AvailabilitySlot.syncIndexes();
await ReservationLock.syncIndexes();
// Fixture: this suite lets brand-new cleaners take cash jobs; the owner-approved cash
// policy (policies.cash.minTier = "bronze", see money-policies) is relaxed for this test DB only.
// Fixture: it also exercises the card (Stripe) and cash flows that the owner switched off
// for now (POLICIES.paymentMethods.enabled = ["paypal"]); they are re-enabled for this test DB only.
await (await import(ROOT + "/src/models/settings.model.js")).default.updateOne({ key: "platform" }, { $set: { "policies.cash.minTier": "new", "policies.paymentMethods.enabled": ["paypal", "stripe", "cash"] } }, { upsert: true });
await loadSettings();
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
const login = async (email, password = "Password12345") => (await call("POST", "/auth/login", { email, password }));
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin One", email: "admin@t.local", password: pw, role: "admin" });
const anna = await User.create({
  name: "Anna Nowak", email: "anna@t.local", password: pw, role: "worker", availability: ALWAYS_AVAILABLE, workerStatus: "approved", emailVerified: true,
  workerProfile: { ...BERLIN_WIDE, address: "Str 1", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: "Anna",
});
const adminT = (await login("admin@t.local")).body.token;
const annaT = (await login("anna@t.local")).body.token;
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;

// ---------- Price settings ----------
r = await call("GET", "/pricing");
check("default hourly price is €25", r.body.pricing?.hourlyRateCents === 2500, r.body.pricing);
r = await call("POST", "/bookings/estimate", { serviceId: "home-cleaning", areaM2: 60, durationMinutes: 180 });
check("3 h × €25 = €75", r.body.data?.totalCents === 7500 && r.body.data.durationMinutes === 180, r.body.data);
r = await call("POST", "/bookings/estimate", { serviceId: "home-cleaning", areaM2: 60, extras: ["inside-oven"] });
check("extra adds time (60 m² = 2 h + oven 40 min → 3 h)", r.body.data?.recommendedMinutes === 180, r.body.data);

r = await call("GET", "/admin/settings", null, adminT);
const settings = r.body.settings;
check("admin reads settings", settings?.pricing?.hourlyRateCents === 2500 && settings.extras.length > 10 && settings.payments.cashEnabled === true, settings?.pricing);
check("invoicing email defaults to the bare SMTP_FROM address", settings?.invoicing?.email === "office@t.local", settings?.invoicing);
r = await call("PUT", "/admin/settings", settings, adminT);
check("saving the settings page unchanged works (Richtlinien)", r.status === 200, r.body);
r = await call("PUT", "/admin/settings", {
  pricing: { ...settings.pricing, hourlyRateCents: 2800 },
  extras: settings.extras.map((e) => ({ id: e.id, minutes: e.id === "inside-oven" ? 60 : e.minutes, priceCents: e.id === "ironing" ? 500 : e.priceCents, active: e.id !== "carpet-vacuum" })),
}, adminT);
check("admin saves price + extras", r.status === 200 && r.body.settings.pricing.hourlyRateCents === 2800, r.body);
r = await call("POST", "/bookings/estimate", { serviceId: "home-cleaning", areaM2: 60, durationMinutes: 120, extras: ["ironing"] });
check("new rate + extra fee applied (2 h × €28 + €5)", r.body.data?.totalCents === 6100, r.body.data);
r = await call("GET", "/extras");
check("deactivated extra hidden", !r.body.extras.some((e) => e.id === "carpet-vacuum") && r.body.extras.find((e) => e.id === "inside-oven").minutes === 60, r.body.extras?.length);
r = await call("POST", "/bookings/estimate", { serviceId: "home-cleaning", areaM2: 60, extras: ["carpet-vacuum"] });
check("deactivated extra rejected", r.status === 422, r.status);
r = await call("PUT", "/admin/settings", { pricing: { ...settings.pricing, minimumMinutes: 300, maximumMinutes: 240 } }, adminT);
check("invalid settings rejected", r.status === 422, r.body);
r = await call("PUT", "/admin/settings", { pricing: { ...settings.pricing, hourlyRateCents: 2500 }, extras: settings.extras.map(({ id, minutes, priceCents }) => ({ id, minutes, priceCents, active: true })) }, adminT);
r = await call("GET", "/bookings/estimate", null);
r = await call("PUT", "/admin/settings", { pricing: { hourlyRateCents: 2500 } }, adminT);
check("partial pricing object rejected (all fields required)", r.status === 422, r.status);

// ---------- Full-day window, duration-based start times ----------
r = await call("POST", "/admin/slots", { from: day(2), to: day(2), weekdays: [1,2,3,4,5,6,7], times: [{ startTime: "08:00", endTime: "10:00" }, { startTime: "10:30", endTime: "12:30" }], capacity: 1 }, adminT);
check("two 2-hour windows created", r.body.created === 2, r.body);
const avail = async (d, duration) => (await call("GET", `/bookings/availability?date=${d}&duration=${duration}`)).body.data;
let times = await avail(day(2), 180);
check("3 h job does not fit 2-hour windows", times.length === 0, times);
r = await call("POST", "/admin/slots", { from: day(2), to: day(4), weekdays: [1,2,3,4,5,6,7], times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 1, replaceExisting: true }, adminT);
check("replaced by full-day window", r.status === 201 && r.body.replaced >= 1, r.body);
times = await avail(day(2), 180);
check("3 h job: starts 08:00 … 15:00 every 30 min", times.length === 15 && times[0].startTime === "08:00" && times.at(-1).startTime === "15:00" && times[0].endTime === "11:00", times.map((t) => t.startTime));
r = await call("GET", `/bookings/availability/days?duration=600`);
check("10 h job fits a full day", r.body.data?.some((d) => d.date === day(2)), r.body.data);
r = await call("GET", `/bookings/availability/days?duration=630`);

const bookingBody = (d, t, extra = {}) => ({
  serviceId: "home-cleaning", areaM2: 60, durationMinutes: 180, name: "Kunde Klara", email: "klara@t.local", phone: "030123456",
  postcode: "10115", address: "Invalidenstr. 5", preferredDate: d, slotId: t.windowId, startTime: t.startTime, earlyStartConsent: true, ...extra,
});
r = await call("POST", "/bookings", bookingBody(day(2), times.find((t) => t.startTime === "09:00")), custT);
check("book 09:00–12:00 (invoice mode)", r.status === 201 && r.body.booking.slot === "09:00" && r.body.booking.slotEnd === "12:00", r.body);
times = await avail(day(2), 180);
check("capacity 1: next start 12:30 (30 min team buffer), none before", times[0]?.startTime === "12:30" && !times.some((t) => t.startTime < "12:30"), times.map((t) => t.startTime));
r = await call("POST", "/bookings", bookingBody(day(2), { windowId: times[0].windowId, startTime: "10:00" }), custT);
check("overlapping start rejected → 409", r.status === 409, r.body);
r = await call("POST", "/bookings", bookingBody(day(2), { windowId: times[0].windowId, startTime: "12:15" }), custT);
check("off-grid start rejected", r.status === 409, r.status);

// Concurrency: 6 customers race for the same time, capacity 2 → exactly 2 win
await AvailabilitySlot.updateMany({ date: new Date(day(3) + "T00:00:00Z") }, { capacity: 2 });
const t3 = (await avail(day(3), 180)).find((t) => t.startTime === "10:00");
const racers = await Promise.all(Array.from({ length: 6 }, () => call("POST", "/bookings", bookingBody(day(3), t3), custT)));
check("parallel race: exactly 2 bookings succeed", racers.filter((x) => x.status === 201).length === 2 && racers.filter((x) => x.status === 409).length === 4, racers.map((x) => x.status));

// Admin slot view
r = await call("GET", `/admin/slots?from=${day(2)}&to=${day(2)}`, null, adminT);
const w2 = r.body.slots?.find((s) => s.active && s.startTime === "08:00");
check("admin sees window utilisation in minutes", w2?.capacityMinutes === 600 && w2.bookedMinutes === 180 && w2.utilisationPct === 30, w2);
r = await call("PATCH", `/admin/slots/${w2.id}`, { endTime: "11:00" }, adminT);
check("cannot end window before a booked job ends", r.status === 409, r.body);

// ---------- Cash at the end ----------
r = await call("GET", "/payments/config");
check("config offers cash", r.body.bookingMethods?.includes("cash") && r.body.cashEnabled === true, r.body);
const t4 = (await avail(day(4), 180))[0];
r = await call("POST", "/bookings", bookingBody(day(4), t4, { paymentMethod: "cash" }), custT);
const cashId = r.body.booking?.id;
check("cash booking confirmed immediately", r.status === 201 && r.body.booking.status === "confirmed" && r.body.booking.payment.method === "cash" && r.body.booking.payment.status === "unpaid", r.body.booking);
r = await call("GET", "/worker/jobs/open", null, annaT);
check("open job shows cash flag", r.body.jobs?.find((j) => j._id === cashId)?.cash === true, r.body.jobs);
await call("POST", `/worker/jobs/${cashId}/accept`, null, annaT);
r = await call("GET", `/worker/jobs/${cashId}`, null, annaT);
check("cleaner sees amount to collect (€75)", r.body.job?.cash?.amountCents === 7500 && r.body.job.payment === undefined, r.body.job?.cash);
await Booking.updateOne({ _id: cashId }, { preferredDate: todayInBerlin() });
await call("POST", `/worker/jobs/${cashId}/start`, null, annaT);
r = await call("POST", `/worker/jobs/${cashId}/complete`, { note: "ok" }, annaT);
check("complete without cash amount → 422", r.status === 422, r.body);
r = await call("POST", `/worker/jobs/${cashId}/complete`, { note: "ok", cashCollectedCents: 7500 }, annaT);
let b = await Booking.findById(cashId);
check("cash recorded, booking paid, cash held deducted", r.status === 200 && b.payment.status === "paid" && b.payment.cashCollectedCents === 7500 && b.workerPayout.amountCents === 5625 && b.workerPayout.cashHeldCents === 7500, { p: b.payment, w: b.workerPayout });
r = await call("GET", "/worker/earnings", null, annaT);
check("earnings net = 56.25 − 75 = −18.75 €", r.body.summary?.pendingCents === -1875 && r.body.summary.cashHeldCents === 7500 && r.body.jobs[0].netCents === -1875, r.body.summary);
r = await call("GET", "/admin/payments", null, adminT);
check("cash payment listed for admin", r.body.payments?.some((p) => p.provider === "cash" && p.amountCents === 7500), r.body.payments?.map((p) => p.provider));
await Booking.updateOne({ _id: cashId }, { "workerPayout.dueAt": new Date(Date.now() - 1000) });
r = await call("POST", "/admin/payouts", { workerId: String(anna._id), note: "Verrechnung" }, adminT);
check("settlement payout with negative amount (cleaner owes)", r.status === 201 && r.body.payout.amountCents === -1875, r.body);

// ---------- Forgot password (customer + cleaner) ----------
for (const [label, email] of [["customer", "klara@t.local"], ["cleaner", "anna@t.local"]]) {
  r = await call("POST", "/auth/forgot-password", { email });
  const u = await User.findOne({ email }).select("+passwordResetTokenHash +passwordResetExpires");
  check(`${label}: reset token issued (30 min)`, r.status === 200 && u.passwordResetTokenHash && u.passwordResetExpires > new Date(), r.body);
  const token = "known-token-" + label;
  await User.updateOne({ email }, { passwordResetTokenHash: createHash("sha256").update(token).digest("hex") });
  r = await call("POST", "/auth/reset-password", { token, password: "NewPassword12345" });
  check(`${label}: reset succeeds`, r.status === 200, r.body);
  r = await call("POST", "/auth/reset-password", { token, password: "OtherPassword12345" });
  check(`${label}: token single-use`, r.status === 400, r.status);
  check(`${label}: old password rejected`, (await login(email)).status === 401, null);
  check(`${label}: new password works`, (await login(email, "NewPassword12345")).status === 200, null);
}
r = await call("GET", "/worker/me", null, annaT);
check("old cleaner session revoked after reset", r.status === 401, r.status);
r = await call("POST", "/auth/forgot-password", { email: "nobody@t.local" });
check("unknown email: same generic answer", r.status === 200 && /If an account exists/.test(r.body.message), r.body);

// ---------- Admin team ----------
r = await call("POST", "/admin/admins", { name: "Bea Admin", email: "bea@t.local", locale: "en" }, adminT);
const beaId = r.body.admin?.id;
check("admin adds new admin (invite pending)", r.status === 201 && r.body.admin.invitationPending === true, r.body);
r = await call("POST", "/admin/admins", { name: "Bea Again", email: "bea@t.local" }, adminT);
check("duplicate email → 409", r.status === 409, r.status);
const bea = await User.findById(beaId).select("+passwordResetExpires");
check("set-password link valid 48 h", bea.passwordResetExpires - Date.now() > 47 * 3600 * 1000, bea.passwordResetExpires);
await User.updateOne({ _id: beaId }, { passwordResetTokenHash: createHash("sha256").update("bea-token").digest("hex") });
r = await call("POST", "/auth/reset-password", { token: "bea-token", password: "BeaPassword12345" });
const beaLogin = await login("bea@t.local", "BeaPassword12345");
check("new admin sets password and logs in as admin", r.status === 200 && beaLogin.body.user?.role === "admin", beaLogin.body);
const beaT = beaLogin.body.token;
r = await call("GET", "/admin/admins", null, beaT);
check("admin list shows 2, invite no longer pending", r.body.admins?.length === 2 && r.body.admins.find((a) => a.id === beaId).invitationPending === false, r.body.admins);
const meId = r.body.admins.find((a) => a.email === "admin@t.local").id;
r = await call("PATCH", `/admin/admins/${beaId}`, { isActive: false }, beaT);
check("cannot deactivate yourself", r.status === 409, r.body);
r = await call("PATCH", `/admin/admins/${beaId}`, { isActive: false }, adminT);
check("deactivate other admin", r.status === 200 && r.body.admin.isActive === false, r.body);
r = await call("GET", "/admin/admins", null, beaT);
check("deactivated admin is logged out", r.status === 401, r.status);
r = await call("PATCH", `/admin/admins/${meId}`, { isActive: false }, adminT);
check("last active admin protected", r.status === 409, r.body);
const cust2 = (await login("klara@t.local", "NewPassword12345")).body.token;
r = await call("GET", "/admin/admins", null, cust2);
check("customer cannot manage admins", r.status === 403, r.status);

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
await User.db.dropDatabase();
server.close();
process.exit(failures ? 1 : 0);
