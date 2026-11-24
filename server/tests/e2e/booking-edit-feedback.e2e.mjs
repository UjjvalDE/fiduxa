// E2E: optimization round – cookie sessions (24 h, logout), service-specific
// pricing/extras, customer + admin booking editing (reschedule, reprice,
// guards, change log), post-cleaning feedback (actual durations, mismatch
// flag, recurring keep-cleaner preference), IDOR checks.
import { ROOT, prepareEnv, createChecker, apiClient } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_editfeedback");

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
await loadSettings();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const anna = await User.create({
  name: "Anna Nowak", email: "anna@t.local", password: pw, role: "worker", workerStatus: "approved", emailVerified: true,
  workerProfile: { address: "Strasse 1", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: "Anna",
});
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;
r = await call("POST", "/auth/register", { name: "Fiese Franka", email: "franka@t.local", password: "Password12345" });
const otherT = r.body.token;
await call("POST", "/admin/slots", { from: day(1), to: day(30), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 5 }, adminT);

// ---------- Cookie sessions (login → cookie-only access → logout) ----------
{
  let res = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "klara@t.local", password: "Password12345" }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  check("login sets HttpOnly session cookie (24 h, SameSite=Lax)",
    /fiduxa_session=/.test(setCookie) && /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie) && /Max-Age=86400/i.test(setCookie), setCookie.slice(0, 120));
  const cookie = setCookie.split(";")[0];
  res = await fetch(base + "/auth/me", { headers: { Cookie: cookie } });
  check("session restored from the cookie alone (no bearer token)", res.status === 200, res.status);
  res = await fetch(base + "/auth/logout", { method: "POST", headers: { Cookie: cookie } });
  const cleared = res.headers.get("set-cookie") ?? "";
  check("logout clears the session cookie", res.status === 200 && /fiduxa_session=;/.test(cleared), cleared.slice(0, 80));
  res = await fetch(base + "/auth/me", { headers: { Cookie: "fiduxa_session=" } });
  check("no session after logout → 401", res.status === 401, res.status);
}

// ---------- Service-specific pricing + extras ----------
const quote = async (body) =>
  (await call("POST", "/bookings/quote", { areaM2: 60, condition: "normal", frequency: "one-time", extras: [], ...body })).body.quote;
{
  const home = await quote({ serviceId: "home-cleaning" });
  const deep = await quote({ serviceId: "deep-cleaning" });
  const eot = await quote({ serviceId: "end-of-tenancy" });
  check("deep cleaning costs more than home cleaning (×1.4)", home.lines.totalCents === 5000 && deep.lines.totalCents === 7500, { home: home.lines.totalCents, deep: deep.lines.totalCents });
  check("end-of-tenancy is the most thorough (×1.6 → €87.50)", eot.lines.totalCents === 8750, eot.lines.totalCents);
  const exHome = (await call("GET", "/extras?serviceId=home-cleaning")).body.extras.map((e) => e.id);
  const exEot = (await call("GET", "/extras?serviceId=end-of-tenancy")).body.extras.map((e) => e.id);
  check("extras are service-specific (no laundry/oven on move-out)",
    exHome.includes("laundry") && exHome.includes("inside-oven") && !exEot.includes("laundry") && !exEot.includes("inside-oven") && exEot.includes("interior-windows"),
    { home: exHome.length, eot: exEot.length });
  const sneaky = await quote({ serviceId: "end-of-tenancy", extras: ["laundry", "interior-windows"] });
  // 192 min (×1.6) + 30 min windows → 4 h; laundry would add another 30 min
  check("invalid extras for the service are ignored server-side", sneaky.lines.totalCents === 10000, sneaky.lines.totalCents);
}

// ---------- Booking to edit (cash, with promo) ----------
const mkCampaign = await call("POST", "/admin/promotions", { name: "Edit10", kind: "coupon", code: "EDIT10", discountType: "percent", discountValue: 10, perCustomerLimit: 5, active: true }, adminT);
check("test coupon created", mkCampaign.status === 201, mkCampaign.status);
const book = async (d, startTime, extra = {}) => {
  const slots = (await call("GET", `/bookings/availability?date=${d}&duration=120`)).body.data;
  const slot = slots.find((s) => s.startTime === startTime) ?? slots[0];
  return call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, name: "Kunde Klara", email: "klara@t.local", phone: "030123456",
    postcode: "10115", address: "Invalidenstr. 5", preferredDate: d, slotId: slot.windowId, startTime: slot.startTime,
    earlyStartConsent: true, paymentMethod: "cash", ...extra,
  }, custT);
};
r = await book(day(3), "09:00", { promoCode: "EDIT10" });
const b1 = r.body.booking.id;
check("cash booking with 10 % coupon → 45 €", r.status === 201 && r.body.booking.pricing?.totalCents === 4500, r.body.booking?.pricing);

// ---------- Customer edits ----------
r = await call("PATCH", `/customer/bookings/${b1}`, { notes: "Bitte klingeln, Hund ist freundlich." }, custT);
check("customer edits notes", r.status === 200 && r.body.changes.some((c) => c.field === "notes"), r.body.changes);

// reschedule to another day
const newDay = day(5);
const slots5 = (await call("GET", `/bookings/availability?date=${newDay}&duration=120`)).body.data;
r = await call("PATCH", `/customer/bookings/${b1}`, { preferredDate: newDay, slotId: slots5[0].windowId, startTime: "13:00" }, custT);
check("customer reschedules (date + time)", r.status === 200 && r.body.booking.slot === "13:00", r.body.booking?.slot);
let doc = await Booking.findById(b1);
check("change log records who changed what", doc.changeLog.length >= 2 && doc.changeLog.at(-1).role === "consumer" && doc.changeLog.at(-1).changes.some((c) => c.field === "preferredDate"), doc.changeLog.at(-1));

// resize: bigger area via extras + duration → price recomputed incl. promo
r = await call("PATCH", `/customer/bookings/${b1}`, { durationMinutes: 180, extras: ["interior-windows"] }, custT);
check("customer resizes → server reprices (3 h × 25 € − 10 %)", r.status === 200 && r.body.booking.pricing.totalCents === 6750 && r.body.priceDeltaCents === 2250, { t: r.body.booking?.pricing?.totalCents, d: r.body.priceDeltaCents });
doc = await Booking.findById(b1);
check("open cash amount follows the new price", doc.payment.amountCents === 6750, doc.payment.amountCents);

// price guard
r = await call("PATCH", `/customer/bookings/${b1}`, { durationMinutes: 120, expectedTotalCents: 1 }, custT);
check("stale confirmed price → 409 PRICE_CHANGED", r.status === 409 && r.body.code === "PRICE_CHANGED", r.status);

// IDOR: another customer cannot edit or read this booking
r = await call("PATCH", `/customer/bookings/${b1}`, { notes: "hacked" }, otherT);
check("another customer cannot edit the booking → 404", r.status === 404, r.status);
r = await call("GET", `/customer/bookings/${b1}`, null, otherT);
check("another customer cannot read the booking → 404", r.status === 404, r.status);

// cutoff: booking tomorrow 08:00, cutoff widened so editing is "too late"
const { OPERATIONS } = await import(ROOT + "/src/config/pricing.js");
r = await book(day(1), "08:00");
const b2 = r.body.booking.id;
const savedCutoff = OPERATIONS.cancellationCutoffHours;
OPERATIONS.cancellationCutoffHours = 48;
r = await call("PATCH", `/customer/bookings/${b2}`, { notes: "zu spät" }, custT);
check("edit after the cutoff → 409", r.status === 409, r.status);
OPERATIONS.cancellationCutoffHours = savedCutoff;

// paid online → price-affecting edits blocked (simulate paid stripe booking)
r = await book(day(10), "09:00");
const b2b = r.body.booking.id;
await Booking.updateOne({ _id: b2b }, { "payment.status": "paid", "payment.method": "stripe" });
r = await call("PATCH", `/customer/bookings/${b2b}`, { durationMinutes: 180 }, custT);
check("paid-online booking: resize blocked → 409", r.status === 409, r.status);
r = await call("PATCH", `/customer/bookings/${b2b}`, { notes: "Hinweis trotzdem ok" }, custT);
check("paid-online booking: notes still editable", r.status === 200, r.status);

// ---------- Admin edit ----------
r = await call("PATCH", `/admin/bookings/${b1}/details`, { serviceId: "deep-cleaning", durationMinutes: 240, notify: false }, adminT);
check("admin switches service + duration (4 h deep − 10 %)", r.status === 200 && r.body.booking.pricing.totalCents === 9000, r.body.booking?.pricing?.totalCents);
check("admin edit reports the price delta, payment untouched", r.body.priceDeltaCents === 2250 && r.body.paymentUntouched === false, { d: r.body.priceDeltaCents });
doc = await Booking.findById(b1);
check("admin edit in the change log (role admin)", doc.changeLog.at(-1).role === "admin", doc.changeLog.at(-1).role);

// admin reschedule with assigned worker conflict → 409, forceUnassign works
await call("PATCH", `/admin/bookings/${b1}/assign`, { workerId: String(anna._id) }, adminT);
r = await book(day(5), "08:00"); // second job same day 08:00-10:00
const b3 = r.body.booking.id;
await call("PATCH", `/admin/bookings/${b3}/assign`, { workerId: String(anna._id) }, adminT);
const slots5b = (await call("GET", `/bookings/availability?date=${day(5)}&duration=240`)).body.data;
r = await call("PATCH", `/admin/bookings/${b1}/details`, { preferredDate: day(5), slotId: slots5b[0].windowId, startTime: "08:00", notify: false }, adminT);
check("reschedule onto the cleaner's other job → 409 conflict", r.status === 409, r.status);
r = await call("PATCH", `/admin/bookings/${b1}/details`, { preferredDate: day(5), slotId: slots5b[0].windowId, startTime: "08:00", forceUnassign: true, notify: false }, adminT);
doc = await Booking.findById(b1);
check("forceUnassign moves the booking and reopens the job", r.status === 200 && doc.assignedWorker == null && String(r.body.unassignedWorker) === String(anna._id), { w: doc.assignedWorker });

// ---------- Post-cleaning feedback ----------
await call("PATCH", `/admin/bookings/${b3}/assign`, { workerId: null }, adminT); // free Anna at 08:00
r = await call("PATCH", `/admin/bookings/${b1}/assign`, { workerId: String(anna._id) }, adminT);
check("cleaner reassigned after reschedule", r.status === 200, r.body);
await Booking.updateOne({ _id: b1 }, { preferredDate: todayInBerlin() });
await call("POST", `/worker/jobs/${b1}/start`, null, annaT);
r = await call("POST", `/worker/jobs/${b1}/complete`, { note: "ok", cashCollectedCents: 9000, actualDurationMinutes: 270 }, annaT);
check("cleaner completes with actual duration", r.status === 200, r.body);
doc = await Booking.findById(b1);
check("feedback email flagged exactly once", Boolean(doc.feedback?.emailedAt) && doc.job.actualDurationMinutes === 270, { emailedAt: doc.feedback?.emailedAt });
const emailedAt = doc.feedback.emailedAt;
r = await call("POST", `/worker/jobs/${b1}/complete`, { note: "again", cashCollectedCents: 9000 }, annaT);
doc = await Booking.findById(b1);
check("duplicate completion sends no second feedback mail", String(doc.feedback.emailedAt) === String(emailedAt), doc.feedback.emailedAt);

// customer answers the follow-up (review + duration + recommend) – durations differ > 30 min
r = await call("POST", `/customer/bookings/${b1}/review`, { rating: 5, comment: "Top sauber!", recommend: true, actualDurationMinutes: 180 }, custT);
check("follow-up review with duration + recommendation", r.status === 201, r.body);
doc = await Booking.findById(b1);
check("duration mismatch (270 vs 180) flagged for the office, no auto-charge",
  doc.feedback.durationMismatch === true && doc.feedback.customer.actualDurationMinutes === 180 && doc.payment.amountCents === 9000,
  { mismatch: doc.feedback.durationMismatch, amount: doc.payment.amountCents });

// recurring keep-cleaner preference (weekly booking)
r = await book(day(8), "09:00", { frequency: "weekly" });
const b4 = r.body.booking.id;
await call("PATCH", `/admin/bookings/${b4}/assign`, { workerId: String(anna._id) }, adminT);
await Booking.updateOne({ _id: b4 }, { preferredDate: todayInBerlin() });
await call("POST", `/worker/jobs/${b4}/start`, null, annaT);
await call("POST", `/worker/jobs/${b4}/complete`, { note: "ok", cashCollectedCents: 4500 }, annaT);
r = await call("POST", `/customer/bookings/${b4}/review`, { rating: 5, keepCleaner: "same" }, custT);
const klaraDoc = await User.findOne({ email: "klara@t.local" }).select("recurringCleanerPreference").lean();
check("recurring preference saved (same cleaner)",
  r.status === 201 && klaraDoc.recurringCleanerPreference?.choice === "same" && String(klaraDoc.recurringCleanerPreference.worker) === String(anna._id),
  klaraDoc.recurringCleanerPreference);

// permissions on the new admin endpoint
r = await call("PATCH", `/admin/bookings/${b1}/details`, { notes: "nope" }, custT);
check("customer cannot use the admin edit endpoint → 403", r.status === 403, r.status);

server.close();
const { failures } = summary();
console.log(failures ? `${failures} check(s) FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
