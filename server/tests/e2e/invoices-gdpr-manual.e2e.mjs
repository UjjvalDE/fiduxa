// E2E (package C): invoices + § 35a statement, GDPR export/deletion,
// manual customers and bookings created by the office (phone orders).
import { ROOT, prepareEnv, createChecker, apiClient, startPayPalMock, ALWAYS_AVAILABLE, BERLIN_WIDE } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_invoices_gdpr");
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
const { default: AvailabilitySlot } = await import(ROOT + "/src/models/availability-slot.model.js");
const { default: EmailMessage } = await import(ROOT + "/src/models/email.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
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
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);
const year = new Date().getFullYear();

const raw = (p, token) => fetch(base + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const anna = await User.create({
  name: "Anna Nowak", email: "anna@t.local", password: pw, role: "worker", availability: ALWAYS_AVAILABLE, workerStatus: "approved", emailVerified: true,
  workerProfile: { ...BERLIN_WIDE, address: "Strasse 1", serviceAreas: ["Mitte"], petsOk: true }, bankAccountLast4: "1234", bankAccountHolder: "Anna",
});
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const adminT = await login("admin@t.local");
const annaT = await login("anna@t.local");
let r = await call("POST", "/auth/register", { name: "Kunde Klara", email: "klara@t.local", password: "Password12345" });
const custT = r.body.token;
r = await call("POST", "/auth/register", { name: "Fremde Franka", email: "franka@t.local", password: "Password12345" });
const otherT = r.body.token;
await call("POST", "/admin/slots", { from: day(0), to: day(30), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 5 }, adminT);

const book = async (d, startTime, extra = {}, token = custT) => {
  const slots = (await call("GET", `/bookings/availability?date=${d}&duration=120`)).body.data;
  const slot = slots.find((s) => s.startTime === startTime) ?? slots[0];
  return call("POST", "/bookings", {
    serviceId: "home-cleaning", areaM2: 60, name: "Kunde Klara", email: "klara@t.local", phone: "030123456",
    postcode: "10115", address: "Invalidenstr. 5", preferredDate: d, slotId: slot.windowId, startTime: slot.startTime,
    earlyStartConsent: true, paymentMethod: "cash", ...extra,
  }, token);
};
const completeWithCash = async (id, cents) => {
  await call("PATCH", `/admin/bookings/${id}/assign`, { workerId: String(anna._id) }, adminT);
  await Booking.updateOne({ _id: id }, { preferredDate: todayInBerlin() });
  await call("POST", `/worker/jobs/${id}/start`, null, annaT);
  return call("POST", `/worker/jobs/${id}/complete`, { note: "ok", cashCollectedCents: cents }, annaT);
};

// ---------- Invoices: cash bookings → sequential numbers ----------
r = await book(day(2), "09:00");
const b1 = r.body.booking.id;
check("cash booking created (50 €)", r.status === 201 && r.body.booking.pricing.totalCents === 5000, r.body);
r = await completeWithCash(b1, 5000);
let doc = await Booking.findById(b1).select("+invoice.pdf");
check("cash paid → invoice FX-YYYY-000001 issued", r.status === 200 && doc.invoice?.number === `FX-${year}-000001` && doc.invoice.totalCents === 5000 && doc.invoice.taxDeductible === false, doc.invoice);
check("invoice PDF stored (starts with %PDF)", Buffer.isBuffer(doc.invoice.pdf) && doc.invoice.pdf.subarray(0, 4).toString() === "%PDF" && doc.invoice.pdf.length > 1000, doc.invoice.pdf?.length);
const invoiceMail = await EmailMessage.findOne({ template: "invoice", to: "klara@t.local" });
check("invoice mail queued with PDF attachment", Boolean(invoiceMail) && invoiceMail.attachments?.[0]?.filename === `FX-${year}-000001.pdf`, invoiceMail?.attachments?.map((a) => a.filename));

r = await book(day(3), "09:00");
const b2 = r.body.booking.id;
await completeWithCash(b2, 5000);
doc = await Booking.findById(b2);
check("second invoice is sequential (000002)", doc.invoice?.number === `FX-${year}-000002`, doc.invoice?.number);

// idempotent: recording cash again does not draw a new number
r = await call("PATCH", `/admin/bookings/${b2}/cash`, { amountCents: 5000, collectedBy: "office" }, adminT);
doc = await Booking.findById(b2);
const { default: Counter } = await import(ROOT + "/src/models/counter.model.js");
const counter = await Counter.findById(`invoice-${year}`);
check("paying twice keeps the number (counter still at 2)", r.status === 200 && doc.invoice.number === `FX-${year}-000002` && counter.sequence === 2, { n: doc.invoice?.number, seq: counter?.sequence });

// downloads
let res = await raw(`/customer/bookings/${b1}/invoice`, custT);
const pdfBytes = Buffer.from(await res.arrayBuffer());
check("customer downloads own invoice (PDF, attachment, nosniff)",
  res.status === 200 && res.headers.get("content-type") === "application/pdf" && /attachment; filename="FX-\d{4}-000001\.pdf"/.test(res.headers.get("content-disposition")) && res.headers.get("x-content-type-options") === "nosniff" && pdfBytes.subarray(0, 4).toString() === "%PDF",
  { s: res.status, ct: res.headers.get("content-type"), cd: res.headers.get("content-disposition") });
res = await raw(`/customer/bookings/${b1}/invoice`, otherT);
check("foreign customer → 404", res.status === 404, res.status);
res = await raw(`/customer/bookings/${b1}/invoice`);
check("anonymous → 401", res.status === 401, res.status);
res = await raw(`/admin/bookings/${b1}/invoice`, adminT);
check("admin downloads the invoice", res.status === 200 && res.headers.get("content-type") === "application/pdf", res.status);
r = await call("GET", "/customer/invoices", null, custT);
check("customer invoice list (2 invoices, newest first)", r.status === 200 && r.body.invoices.length === 2 && r.body.invoices[0].number === `FX-${year}-000002` && r.body.invoices[0].reference && !("pdf" in r.body.invoices[0]), r.body.invoices);

// ---------- § 35a statement: only non-cash invoices count ----------
r = await call("POST", "/admin/gift-cards/issue", { amountCents: 10000, recipientName: "Klara", recipientEmail: "klara@t.local", reason: "Test", sendEmail: false }, adminT);
const card = r.body.giftCard;
r = await book(day(6), "09:00", { giftCardCodes: [card.code], paymentMethod: undefined });
const b3 = r.body.booking.id;
doc = await Booking.findById(b3);
check("gift-card-covered booking → paid → invoice 000003 (deductible)", r.status === 201 && r.body.booking.payment.status === "paid" && doc.invoice?.number === `FX-${year}-000003` && doc.invoice.taxDeductible === true && doc.invoice.giftCardCents === 5000, doc.invoice);
const confirmMail = await EmailMessage.findOne({ template: "bookingConfirmed", to: "klara@t.local", bookingRef: doc.reference });
check("paid confirmation mail carries the invoice PDF", confirmMail?.attachments?.[0]?.filename === `FX-${year}-000003.pdf`, confirmMail?.attachments?.map((a) => a.filename));
r = await call("GET", `/customer/tax-statement/summary?year=${year}`, null, custT);
check("tax statement sums only the non-cash invoice (50 €, 2 cash excluded)", r.body.summary?.count === 1 && r.body.summary.labourCents === 5000 && r.body.summary.excludedCash === 2, r.body.summary);
res = await raw(`/customer/tax-statement?year=${year}`, custT);
const stmt = Buffer.from(await res.arrayBuffer());
check("tax statement PDF downloads", res.status === 200 && stmt.subarray(0, 4).toString() === "%PDF" && /35a/.test(res.headers.get("content-disposition")), res.status);
res = await raw(`/customer/tax-statement?year=1999`, custT);
check("invalid year → 400", res.status === 400, res.status);

// ---------- GDPR: export + delete ----------
res = await raw("/users/me/export", custT);
const exported = await res.json();
check("export JSON contains profile, bookings and invoices",
  res.status === 200 && /attachment/.test(res.headers.get("content-disposition")) && exported.profile?.email === "klara@t.local" && exported.bookings?.length === 3 && exported.invoices?.length === 3 && !exported.bookings.some((b) => b.invoice?.pdf),
  { s: res.status, b: exported.bookings?.length, i: exported.invoices?.length });

r = await call("DELETE", "/users/me", { password: "falsch" }, custT);
check("delete with wrong password → 400", r.status === 400, r.status);
r = await call("DELETE", "/users/me", { password: "Password12345" }, custT);
check("delete refused while a booking is upcoming → 409 OPEN_BOOKINGS", r.status === 409 && r.body.code === "OPEN_BOOKINGS", r.body);
r = await call("POST", `/customer/bookings/${b3}/cancel`, { reason: "Umzug" }, custT);
check("customer cancels the upcoming booking", r.status === 200, r.body);
r = await call("DELETE", "/users/me", { password: "Password12345" }, custT);
check("delete succeeds after cancelling (10-year retention note)", r.status === 200 && r.body.retentionYears === 10 && r.body.bookingsAnonymised === 3, r.body);
r = await call("POST", "/auth/login", { email: "klara@t.local", password: "Password12345" });
check("login no longer possible", r.status === 401 || r.status === 403, r.status);
r = await call("GET", "/auth/me", null, custT);
check("old session invalidated (tokenVersion bump)", r.status === 401, r.status);
doc = await Booking.findById(b1).select("+invoice.pdf");
const klara = await User.findById(exported.profile.id);
check("booking kept with anonymised details, invoice retained",
  doc && doc.customerDetails.name === "Gelöschter Kunde" && /anonymised\.invalid$/.test(doc.customerDetails.email) && doc.customerDetails.phone === "" && doc.invoice.number === `FX-${year}-000001` && doc.invoice.pdf?.length > 1000 && klara.isActive === false && klara.anonymisedAt && /^deleted\+/.test(klara.email),
  { cd: doc?.customerDetails, email: klara?.email });

// ---------- Admin: manual customer + bookings ----------
r = await call("POST", "/admin/customers", { name: "Telefon Tom", email: "tom@t.local", phone: "0301234", locale: "de" }, adminT);
const tom = r.body.customer;
const welcome = await EmailMessage.findOne({ to: "tom@t.local", template: "setPassword" });
check("admin creates a customer → set-password mail queued", r.status === 201 && tom?.id && welcome && /Passwort/.test(welcome.subject) && /passwort-zuruecksetzen\?token=/.test(welcome.text), { s: r.status, subject: welcome?.subject });
r = await call("POST", "/admin/customers", { name: "Telefon Tom", email: "tom@t.local" }, adminT);
check("duplicate email → 409", r.status === 409, r.status);
r = await call("GET", "/admin/customer-search?q=tom", null, adminT);
check("customer search finds Tom", r.status === 200 && r.body.customers.some((c) => c.email === "tom@t.local"), r.body);

const slotsD4 = (await call("GET", `/bookings/availability?date=${day(4)}&duration=180`)).body.data;
const win = slotsD4.find((s) => s.startTime === "10:00") ?? slotsD4[0];
const bookedBefore = (await AvailabilitySlot.findById(win.windowId)).booked;
const manual = {
  customerId: tom.id, serviceId: "deep-cleaning", areaM2: 60, condition: "normal", frequency: "one-time", extras: ["interior-windows"],
  preferredDate: day(4), slotId: win.windowId, startTime: win.startTime, notes: "Telefonisch",
  customerDetails: { phone: "0301234", postcode: "10115", address: "Torstr. 1" },
};
r = await call("POST", "/admin/bookings", { ...manual, paymentMethod: "cash" }, adminT);
const mb = r.body.booking;
const slotAfter = await AvailabilitySlot.findById(win.windowId);
// deep cleaning 60 m² → 3 h (×1.4) + 30 min windows = 3.5 h × 25 € = 87.50 €
check("manual cash booking: confirmed, priced by the quote engine, slot counted",
  r.status === 201 && mb.status === "confirmed" && mb.payment.method === "cash" && mb.pricing.totalCents === 8750 && slotAfter.booked === bookedBefore + 1,
  { s: r.status, st: mb?.status, total: mb?.pricing?.totalCents, booked: slotAfter.booked });
r = await call("POST", "/admin/bookings", { ...manual, startTime: "14:00", paymentMethod: "link" }, adminT);
const lb = r.body.booking;
const payMail = await EmailMessage.findOne({ template: "paymentLink", to: "tom@t.local" });
check("manual link booking: payment_pending with 24 h hold + pay-link mail",
  r.status === 201 && lb.status === "payment_pending" && lb.holdExpiresAt && new Date(lb.holdExpiresAt).getTime() - Date.now() > 23 * 3600 * 1000 && /\/zahlung\//.test(payMail?.text ?? "") && r.body.payUrl,
  { s: r.status, st: lb?.status, hold: lb?.holdExpiresAt, mail: Boolean(payMail) });
r = await call("POST", "/admin/bookings", { ...manual, startTime: "16:00", paymentMethod: "cash" }, otherT);
check("non-admin cannot create manual bookings → 403", r.status === 403, r.status);
r = await call("DELETE", `/admin/customers/${tom.id}`, { reason: "Kundenwunsch" }, adminT);
check("admin delete refused while Tom has open bookings → 409", r.status === 409, r.status);

paypal.close();
server.close();
const { failures } = summary();
console.log(failures ? `${failures} check(s) FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
