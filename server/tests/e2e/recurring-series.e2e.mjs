// E2E: recurring cleaning plans (Putzplan) – series creation (once per booking),
// occurrence generation through real pricing + slot reservation, preferred-cleaner
// priority on the job board, pause / skip / resume / end, online pay-link
// occurrences with a hold, capacity problems, permissions.
import { ROOT, prepareEnv, createChecker, apiClient, startPayPalMock } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_recurring");
process.env.EMAIL_TRANSPORT = "json";
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
const { default: BookingSeries } = await import(ROOT + "/src/models/booking-series.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { confirmBooking } = await import(ROOT + "/src/services/booking-lifecycle.service.js");
const { generateDueOccurrences, recurringJob } = await import(ROOT + "/src/jobs/recurring.js");
const { RECURRING } = await import(ROOT + "/src/config/pricing.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");

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
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();
const dayDate = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS);
const day = (n) => dayDate(n).toISOString().slice(0, 10);
const sameDay = (a, b) => a && b && new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const mkWorker = (name, email) =>
  User.create({
    name, email, password: pw, role: "worker", workerStatus: "approved", emailVerified: true,
    workerProfile: { address: "Strasse 1", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: name,
  });
const anna = await mkWorker("Anna Nowak", "anna@t.local");
const ben = await mkWorker("Ben Weber", "ben@t.local");
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
const benT = await login("ben@t.local");
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;
r = await call("POST", "/auth/register", { name: "Fiese Franka", email: "franka@t.local", password: "Password12345" });
const otherT = r.body.token;
// One team only → a second job at the same time is "no capacity"
await call("POST", "/admin/slots", { from: day(1), to: day(45), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 1 }, adminT);

const book = async (token, d, startTime, extra = {}) => {
  const slots = (await call("GET", `/bookings/availability?date=${d}&duration=120`)).body.data;
  const slot = slots.find((s) => s.startTime === startTime) ?? slots[0];
  return call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, name: "Kunde", email: "k@t.local", phone: "030123456",
    postcode: "10115", address: "Invalidenstr. 5", preferredDate: d, slotId: slot.windowId, startTime: slot.startTime,
    earlyStartConsent: true, paymentMethod: "cash", ...extra,
  }, token);
};
const openRefs = async (token) => ((await call("GET", "/worker/jobs/open", null, token)).body.jobs ?? []).map((j) => j.reference);

// ---------- Series created once per confirmed recurring booking ----------
r = await book(custT, day(3), "09:00", { frequency: "weekly" });
const b1 = r.body.booking.id;
check("weekly cash booking confirmed with 10 % recurring discount", r.status === 201 && r.body.booking.status === "confirmed" && r.body.booking.pricing.recurringDiscountCents === 500, r.body);
let series = await BookingSeries.findOne({ createdFrom: b1 });
let b1Doc = await Booking.findById(b1);
check("series created from the booking (cash, weekly, next = +7 days, booking linked as #0)",
  series && series.status === "active" && series.template.paymentMethod === "cash" && series.template.frequency === "weekly" &&
  series.template.startTime === "09:00" && sameDay(series.nextDate, dayDate(10)) && String(b1Doc.series) === String(series._id) && b1Doc.seriesIndex === 0,
  { series, booking: { series: b1Doc.series, idx: b1Doc.seriesIndex } });
await confirmBooking(b1Doc, { actorId: undefined, note: "confirmed again", paid: false });
check("confirming the same booking twice does not duplicate the series", (await BookingSeries.countDocuments({ createdFrom: b1 })) === 1);
check("one-time bookings never start a series", (await book(custT, day(4), "14:00")).status === 201 && (await BookingSeries.countDocuments()) === 1);

// ---------- Generation ----------
check("job descriptor for the runner", recurringJob.name === "recurringSeries" && recurringJob.everyMs === 3600e3 && typeof recurringJob.run === "function");
let result = await generateDueOccurrences();
let occ1 = await Booking.findOne({ series: series._id, seriesIndex: 1 });
series = await BookingSeries.findById(series._id);
check("occurrence created on +7 days: confirmed, slot reserved, discount applied, cash",
  result.created >= 1 && occ1 && occ1.status === "confirmed" && sameDay(occ1.preferredDate, dayDate(10)) && occ1.slot === "09:00" && occ1.slotEnd === "11:00" &&
  occ1.availabilitySlot && occ1.pricing.recurringDiscountCents === 500 && occ1.pricing.totalCents === 4500 && occ1.payment.method === "cash" &&
  occ1.frequency === "weekly" && !occ1.pricing.promotion,
  { result, occ1: occ1 && { status: occ1.status, date: occ1.preferredDate, slot: occ1.slot, pricing: occ1.pricing } });
check("series advanced (next = +14, generated = 1)", sameDay(series.nextDate, dayDate(17)) && series.counters.generated === 1 && sameDay(series.lastGeneratedDate, dayDate(10)), series);
const slots10 = (await call("GET", `/bookings/availability?date=${day(10)}&duration=120`)).body.data;
check("the reserved start time is gone from the public availability", !slots10.some((s) => s.startTime === "09:00"), slots10.map((s) => s.startTime));
await generateDueOccurrences();
check("second run creates nothing new (idempotent)", (await Booking.countDocuments({ series: series._id })) === 2);
check("customer sees the occurrence as part of the plan", (await call("GET", `/customer/bookings/${occ1._id}`, null, custT)).body.booking?.series === String(series._id));

// ---------- Preferred cleaner via feedback ----------
await call("PATCH", `/admin/bookings/${b1}/assign`, { workerId: String(anna._id) }, adminT);
await Booking.updateOne({ _id: b1 }, { preferredDate: todayInBerlin() });
await call("POST", `/worker/jobs/${b1}/start`, null, annaT);
r = await call("POST", `/worker/jobs/${b1}/complete`, { note: "ok", cashCollectedCents: 4500 }, annaT);
r = await call("POST", `/customer/bookings/${b1}/review`, { rating: 5, keepCleaner: "same" }, custT);
series = await BookingSeries.findById(series._id);
check("feedback keepCleaner=same sets the plan's preferred cleaner", r.status === 201 && String(series.preferredWorker) === String(anna._id), { status: r.status, pw: series.preferredWorker });

RECURRING.generateDaysAhead = 21; // next occurrence (+14) becomes due
result = await generateDueOccurrences();
const occ2 = await Booking.findOne({ series: series._id, seriesIndex: 2 });
check("next occurrence carries the priority for the preferred cleaner (24 h)",
  occ2 && occ2.status === "confirmed" && String(occ2.jobOffer.priorityWorker) === String(anna._id) &&
  occ2.jobOffer.priorityUntil > new Date(Date.now() + 23 * 3600e3) && occ2.jobOffer.priorityUntil < new Date(Date.now() + 25 * 3600e3),
  occ2?.jobOffer);
check("open board: preferred cleaner sees it, another cleaner does not", (await openRefs(annaT)).includes(occ2.reference) && !(await openRefs(benT)).includes(occ2.reference));
r = await call("POST", `/worker/jobs/${occ2._id}/accept`, null, benT);
check("another cleaner cannot accept during the priority window → 409", r.status === 409 && r.body.reason === "priority", r.body);
// Simulate "24 h later": offered 2 h ago to the preferred cleaner, window just closed
await Booking.updateOne({ _id: occ2._id }, { "jobOffer.priorityUntil": new Date(Date.now() - 1000), "jobOffer.notifiedAt": new Date(Date.now() - 2 * 3600e3) });
check("after the priority window the job is open to everyone", (await openRefs(benT)).includes(occ2.reference));
result = await generateDueOccurrences();
const occ2After = await Booking.findById(occ2._id);
check("expired priority: job re-offered to the whole board once", result.reopened === 1 && occ2After.jobOffer.notifiedAt > occ2After.jobOffer.priorityUntil, { result, offer: occ2After.jobOffer });
check("re-offer happens only once", (await generateDueOccurrences()).reopened === 0);
r = await call("POST", `/worker/jobs/${occ2._id}/accept`, null, benT);
check("another cleaner accepts after the window", r.status === 200, r.body);

// ---------- Customer API: list, skip, pause, resume, end ----------
r = await call("GET", "/customer/series", null, custT);
check("GET /customer/series lists the plan with next date, cleaner and upcoming occurrences",
  r.status === 200 && r.body.series.length === 1 && r.body.series[0].frequency === "weekly" && sameDay(r.body.series[0].nextDate, dayDate(24)) &&
  r.body.series[0].preferredWorker?.name === "Anna Nowak" && r.body.series[0].upcoming.length === 2 && r.body.series[0].counters.completed === 1,
  r.body.series?.[0]);
r = await call("POST", `/customer/series/${series._id}/skip`, { date: day(24) }, custT);
check("skip a not yet created date → next date advances by one interval", r.status === 200 && sameDay(r.body.nextDate, dayDate(31)) && r.body.cancelledReference === null, r.body);
r = await call("POST", `/customer/series/${series._id}/skip`, {}, custT);
occ1 = await Booking.findById(occ1._id);
check("skip without date cancels the next created occurrence (free, slot released)",
  r.status === 200 && r.body.cancelledReference === occ1.reference && occ1.status === "cancelled" && occ1.slotReleased === true, { body: r.body, status: occ1.status });
r = await call("POST", `/customer/series/${series._id}/skip`, { date: day(2) }, custT);
check("skip of a foreign date → 422", r.status === 422, r.status);

RECURRING.generateDaysAhead = 40;
r = await call("PATCH", `/customer/series/${series._id}`, { action: "pause" }, custT);
check("pause: plan paused, future occurrences cancelled", r.status === 200 && r.body.series.status === "paused" && r.body.cancelled.includes(occ2.reference), r.body);
result = await generateDueOccurrences();
check("paused plan generates nothing", (await Booking.countDocuments({ series: series._id, status: { $ne: "cancelled" } })) === 1, result);
r = await call("PATCH", `/customer/series/${series._id}`, { action: "resume" }, custT);
check("resume: active again, next date kept in rhythm", r.status === 200 && r.body.series.status === "active" && sameDay(r.body.series.nextDate, dayDate(31)), r.body.series);
await generateDueOccurrences();
const occ31 = await Booking.findOne({ series: series._id, preferredDate: dayDate(31), status: "confirmed" });
check("after resume the next occurrence is generated", Boolean(occ31), await Booking.find({ series: series._id }).select("preferredDate status").lean());
r = await call("PATCH", `/customer/series/${series._id}`, { action: "end" }, custT);
const countAtEnd = await Booking.countDocuments({ series: series._id });
await generateDueOccurrences();
check("end: plan ended, upcoming cancelled, no more occurrences",
  r.status === 200 && r.body.series.status === "ended" && r.body.cancelled.includes(occ31.reference) && (await Booking.countDocuments({ series: series._id })) === countAtEnd, r.body);
r = await call("PATCH", `/customer/series/${series._id}`, { action: "resume" }, custT);
check("ended plan cannot be resumed → 409", r.status === 409, r.status);

// ---------- Online plan: occurrence waits for payment with a 7-day hold ----------
r = await book(custT, day(5), "13:00", { frequency: "biweekly", paymentMethod: "paypal" });
check("online biweekly booking reserved with checkout", r.status === 201 && r.body.booking.status === "payment_pending" && r.body.checkoutUrl, r.body);
const onlineDoc = await Booking.findById(r.body.booking.id);
await confirmBooking(onlineDoc, { note: "Payment received (paypal)", paid: true }); // what the capture/webhook does
const onlineSeries = await BookingSeries.findOne({ createdFrom: onlineDoc._id });
check("paid online booking starts an online plan", onlineSeries?.template.paymentMethod === "online" && sameDay(onlineSeries.nextDate, dayDate(19)), onlineSeries);
const ordersBefore = paypal.created;
await generateDueOccurrences();
const onlineOcc = await Booking.findOne({ series: onlineSeries._id, seriesIndex: 1 });
check("online occurrence is payment_pending with a 7-day hold and a pay link",
  onlineOcc && onlineOcc.status === "payment_pending" && onlineOcc.payment.method === "paypal" &&
  onlineOcc.holdExpiresAt > new Date(Date.now() + 6.9 * DAY_MS) && onlineOcc.holdExpiresAt < new Date(Date.now() + 7.1 * DAY_MS) && paypal.created > ordersBefore,
  onlineOcc && { status: onlineOcc.status, hold: onlineOcc.holdExpiresAt, payment: onlineOcc.payment });

// ---------- No capacity → nothing created, problem recorded ----------
r = await book(otherT, day(2), "10:00", { frequency: "weekly" });
const frankaSeries = await BookingSeries.findOne({ createdFrom: r.body.booking.id });
r = await book(custT, day(9), "10:00"); // blocks Franka's next slot (capacity 1)
check("blocker booked at the plan's next time", r.status === 201, r.body);
await generateDueOccurrences();
const frankaAfter = await BookingSeries.findById(frankaSeries._id);
check("no capacity: nothing created, lastProblem set, next date kept",
  (await Booking.countDocuments({ series: frankaSeries._id })) === 1 && frankaAfter.lastProblem?.reason === "no_capacity" && sameDay(frankaAfter.nextDate, dayDate(9)),
  frankaAfter.lastProblem);

// ---------- Permissions & admin ----------
r = await call("GET", `/customer/series/${onlineSeries._id}`, null, otherT);
check("foreign customer cannot read a plan → 404", r.status === 404, r.status);
r = await call("PATCH", `/customer/series/${onlineSeries._id}`, { action: "end" }, otherT);
check("foreign customer cannot change a plan → 404", r.status === 404, r.status);
r = await call("GET", "/admin/series", null, benT);
check("worker cannot use the admin plan list → 403", r.status === 403, r.status);
r = await call("GET", "/admin/series?status=active", null, adminT);
check("admin lists active plans with customer and problem info", r.status === 200 && r.body.series.length === 2 && r.body.series.every((s) => s.customer?.email), r.body);
r = await call("PATCH", `/admin/series/${onlineSeries._id}`, { preferredWorker: String(ben._id) }, adminT);
check("admin sets the preferred cleaner", r.status === 200 && r.body.series.preferredWorker?.name === "Ben Weber", r.body);
r = await call("PATCH", `/admin/series/${onlineSeries._id}`, { action: "pause", pausedUntil: day(40) }, adminT);
check("admin pauses until a date (occurrences inside the pause cancelled)", r.status === 200 && r.body.series.status === "paused" && sameDay(r.body.series.pausedUntil, dayDate(40)) && r.body.cancelled.includes(onlineOcc.reference), r.body);
RECURRING.generateDaysAhead = 14;
r = await call("GET", "/admin/settings", null, adminT);
check("settings expose recurring defaults", r.body.settings?.recurring?.generateDaysAhead === 14 && r.body.settings.recurring.priorityHours === 24 && r.body.settings.recurring.onlineHoldDays === 7, r.body.settings?.recurring);
r = await call("PUT", "/admin/settings", { recurring: { generateDaysAhead: 10, priorityHours: 12, onlineHoldDays: 5 } }, adminT);
check("admin changes recurring settings (applied in memory)", r.status === 200 && RECURRING.priorityHours === 12 && RECURRING.generateDaysAhead === 10, r.body.settings?.recurring);

paypal.close();
server.close();
const { failures } = summary();
console.log(failures ? `${failures} check(s) FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
