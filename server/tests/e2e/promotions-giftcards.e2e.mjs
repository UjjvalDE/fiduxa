// E2E: email verification, welcome offer, campaigns/coupons, gift cards
// (purchase + redemption), payment success/failure/duplicates, admin.
// Runs against a TEST database and a PayPal MOCK – no real money, no emails.
import { createHash } from "node:crypto";
import { ROOT, prepareEnv, createChecker, apiClient, startPayPalMock } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_promotions");
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
const { default: GiftCard } = await import(ROOT + "/src/models/gift-card.model.js");
const { default: GiftCardTransaction } = await import(ROOT + "/src/models/gift-card-transaction.model.js");
const { default: Promotion } = await import(ROOT + "/src/models/promotion.model.js");
const { default: PromotionRedemption } = await import(ROOT + "/src/models/promotion-redemption.model.js");
const { default: PersonalCode } = await import(ROOT + "/src/models/personal-code.model.js");
const { default: AvailabilitySlot } = await import(ROOT + "/src/models/availability-slot.model.js");
const { default: ReservationLock } = await import(ROOT + "/src/models/reservation-lock.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { ensureDefaultPromotions } = await import(ROOT + "/src/services/promotion.service.js");
const { expireStaleHolds } = await import(ROOT + "/src/services/availability.service.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");

await connectDB();
await User.db.dropDatabase();
// Rebuild every index before testing (unique indexes back business rules)
for (const M of Object.values(User.db.models)) await M.syncIndexes(); // syncAllIndexes
for (const M of [AvailabilitySlot, ReservationLock, GiftCard, GiftCardTransaction, Promotion, PromotionRedemption, PersonalCode, Booking]) await M.syncIndexes();
await loadSettings();
await ensureDefaultPromotions();
const server = app.listen(0);
const call = apiClient(`http://127.0.0.1:${server.address().port}/api/v1`);
const { check, summary } = createChecker();
const sha = (v) => createHash("sha256").update(v).digest("hex");
const day = (n) => new Date(todayInBerlin().getTime() + n * DAY_MS).toISOString().slice(0, 10);

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
const adminT = (await call("POST", "/auth/login", { email: "admin@t.local", password: "Password12345" })).body.token;
await call("POST", "/admin/slots", { from: day(1), to: day(20), weekdays: [1, 2, 3, 4, 5, 6, 7], times: [{ startTime: "08:00", endTime: "18:00" }], capacity: 5 }, adminT);

const register = async (name, email, phone = "030 1111111") => {
  const r = await call("POST", "/auth/register", { name, email, password: "Password12345", phone });
  return { token: r.body.token, user: r.body.user };
};
const verify = async (email) => {
  const token = `verify-${email}`;
  await User.updateOne({ email }, { emailVerificationTokenHash: sha(token), emailVerificationExpires: new Date(Date.now() + 3600e3) });
  return call("POST", "/auth/verify-email", { token });
};
const myCode = async (token) => (await call("GET", "/users/me/welcome-code", null, token)).body.welcome?.code;
const base = { serviceId: "home-cleaning", areaM2: 60, durationMinutes: 180 }; // 3 h × €25 = €75
const quote = (token, extra = {}) => call("POST", "/bookings/quote", { ...base, ...extra }, token);
const contact = (email, phone = "030 1111111", address = "Invalidenstr. 5") => ({ name: "Kunde", email, phone, postcode: "10115", address });
const book = async (token, d, start, extra = {}) => {
  const slots = (await call("GET", `/bookings/availability?date=${d}&duration=180`)).body.data;
  const t = slots.find((s) => s.startTime === start) ?? slots[0];
  return call("POST", "/bookings", { ...base, ...contact("x@t.local"), preferredDate: d, slotId: t.windowId, startTime: t.startTime, earlyStartConsent: true, ...extra }, token);
};

// ---------- Email verification + welcome offer ----------
const anna = await register("Anna Kundin", "anna@t.local", "030 1111111");
check("register: not verified yet", anna.user?.emailVerified === false, anna.user);
let r = await quote(anna.token);
check("price 3 h × €25 = €75", r.body.quote?.lines.priceCents === 7500, r.body.quote?.lines);
check("welcome needs verified email", r.body.quote?.welcome?.eligible === false && r.body.quote.welcome.reason === "verify_email", r.body.quote?.welcome);
r = await call("POST", "/auth/verify-email", { token: "wrong-token-123" });
check("wrong verification token → 400", r.status === 400, r.status);
r = await call("GET", "/users/me/welcome-code", null, anna.token);
check("no code before email verification", r.body.welcome?.status === "verify_email" && !r.body.welcome.code, r.body);
r = await verify("anna@t.local");
check("verification succeeds, code sent by email only (not in response)", r.status === 200 && r.body.user.emailVerified && r.body.welcomePercent === 10 && r.body.welcomeCodeSent === true && !JSON.stringify(r.body).includes("FX-"), r.body);
const annaCode = await myCode(anna.token);
const pc = await PersonalCode.findOne({ code: annaCode });
check("personal code issued: FX-XXXX-XXXX, 90 days valid", /^FX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(annaCode) && pc.status === "issued" && Math.round((pc.expiresAt - Date.now()) / 86400e3) === 90, { annaCode, pc });
check("same code on every call (one per customer)", (await myCode(anna.token)) === annaCode && (await PersonalCode.countDocuments({ customer: pc.customer })) === 1, null);
r = await quote(anna.token, { contact: contact("anna@t.local") });
check("without code: no automatic discount, but own code offered", !r.body.quote?.promotion && r.body.quote.welcome?.eligible === true && r.body.quote.welcome.code === annaCode, r.body.quote?.welcome);
r = await quote(anna.token, { promoCode: annaCode.toLowerCase().replace(/-/g, " "), contact: contact("anna@t.local") });
let q = r.body.quote;
check("personal code applied: 75 − 7.50 = 67.50", q?.promotion?.kind === "welcome" && q.codeResult.ok && q.codeResult.personal && q.lines.promotionDiscountCents === 750 && q.lines.totalCents === 6750, q?.lines);
check("VAT 19 % contained (10.78 €)", q?.lines.vatCents === 1078 && q.lines.payableCents === 6750, q?.lines);
r = await quote(null);
check("guest: welcome shown as login_required", r.body.quote?.welcome?.reason === "login_required" && !r.body.quote.promotion, r.body.quote?.welcome);

// ---------- Coupons ----------
const promoBody = (o) => ({
  name: "Test", kind: "coupon", discountType: "percent", discountValue: 15, perCustomerLimit: 1, active: true, ...o,
});
r = await call("POST", "/admin/promotions", promoBody({ name: "€20 off", code: "fixed20", discountType: "fixed", discountValue: 2000 }), adminT);
check("admin creates fixed coupon (code uppercased)", r.status === 201 && r.body.promotion.code === "FIXED20", r.body);
r = await call("POST", "/admin/promotions", promoBody({ name: "dup", code: "FIXED20" }), adminT);
check("duplicate code → 409", r.status === 409, r.status);
r = await call("POST", "/admin/promotions", promoBody({ name: "bad", code: "X", discountValue: 150 }), adminT);
check("invalid promotion rejected", r.status === 422, r.status);
await call("POST", "/admin/promotions", promoBody({ name: "old", code: "OLD15", endsAt: new Date(Date.now() - 86400e3).toISOString(), startsAt: new Date(Date.now() - 10 * 86400e3).toISOString() }), adminT);
await call("POST", "/admin/promotions", promoBody({ name: "once", code: "ONCE15", usageLimit: 1 }), adminT);
await call("POST", "/admin/promotions", promoBody({ name: "min", code: "MIN200", minOrderCents: 20000 }), adminT);
await call("POST", "/admin/promotions", promoBody({ name: "deep only", code: "DEEP15", services: ["deep-cleaning"] }), adminT);
r = await call("POST", "/admin/promotions", promoBody({
  name: "Winter-Aktion", kind: "campaign", code: "WINTER10", discountValue: 10, maxDiscountCents: 5000,
  display: { placement: "hero", priority: 100, theme: "pine", title: { de: "Winter-Aktion", en: "Winter offer", pl: "Zimowa oferta" }, text: { de: "10 % auf deine Reinigung", en: "10% off", pl: "10% zniżki" }, ctaHref: "/buchung", ctaText: { de: "Jetzt buchen", en: "Book now", pl: "Zarezerwuj" } },
}), adminT);
check("admin creates seasonal campaign with hero banner", r.status === 201 && r.body.promotion.code === "WINTER10", r.body);

r = await quote(anna.token, { promoCode: "fixed20", contact: contact("anna@t.local") });
q = r.body.quote;
check("coupon FIXED20 applied (€20)", q?.promotion?.code === "FIXED20" && q.lines.totalCents === 5500 && q.codeResult.ok, q?.promotion);
r = await quote(anna.token, { promoCode: "WINTER10", contact: contact("anna@t.local") });
check("campaign code WINTER10 valid (admin-created)", r.body.quote?.codeResult?.ok === true && r.body.quote.lines.promotionDiscountCents === 750, r.body.quote?.codeResult);
for (const [code, reason] of [["NOPE", "not_found"], ["OLD15", "expired"], ["MIN200", "min_order"], ["DEEP15", "service"]]) {
  r = await quote(anna.token, { promoCode: code });
  check(`code ${code} → ${reason}`, r.body.quote?.codeResult?.reason === reason && !r.body.quote.promotion, r.body.quote?.codeResult);
}

// ---------- Booking with welcome offer, abuse protection ----------
r = await book(anna.token, day(2), "09:00", { ...contact("anna@t.local"), promoCode: annaCode, paymentMethod: "cash", expectedPayableCents: 6750 });
const annaBooking1 = r.body.booking;
check("cash booking with welcome: payable 67.50, confirmed", r.status === 201 && annaBooking1.status === "confirmed" && annaBooking1.payment.amountCents === 6750 && annaBooking1.pricing.promotion.kind === "welcome", r.body);
let red = await PromotionRedemption.findOne({ booking: annaBooking1.id });
check("redemption applied and fingerprinted", red?.status === "applied" && red.fingerprint.phone === "0301111111" && red.code === annaCode, red);
check("personal code now used", (await PersonalCode.findOne({ code: annaCode })).status === "used", null);
r = await quote(anna.token, { promoCode: annaCode });
check("personal code cannot be used twice", r.body.quote?.codeResult?.reason === "already_used" && !r.body.quote.promotion, r.body.quote?.codeResult);
r = await quote(anna.token, { contact: contact("anna@t.local") });
check("second booking: no welcome any more", r.body.quote?.welcome?.eligible === false && !r.body.quote.promotion, r.body.quote?.welcome);

const ben = await register("Ben Zweitkonto", "ben@t.local", "+49 30 1111111");
await verify("ben@t.local");
const benCode = await myCode(ben.token);
check("every customer gets a different code", benCode && benCode !== annaCode, { benCode, annaCode });
r = await quote(ben.token, { promoCode: benCode, contact: contact("ben@t.local", "+49 30 1111111", "Other 1") });
check("duplicate account with same phone: own code blocked", r.body.quote?.codeResult?.reason === "already_used" && !r.body.quote.promotion, r.body.quote?.codeResult);
r = await quote(ben.token, { promoCode: benCode, contact: contact("ben@t.local", "0170 999999", "Invalidenstraße 5") });
check("duplicate account with same address: own code blocked", r.body.quote?.codeResult?.reason === "already_used", r.body.quote?.codeResult);

r = await book(anna.token, day(2), "13:00", { ...contact("anna@t.local"), promoCode: "ONCE15", paymentMethod: "cash" });
check("usage-limited coupon used once", r.status === 201 && r.body.booking.pricing.promotion.code === "ONCE15", r.body);
const cara = await register("Cara", "cara@t.local", "0171 2222222");
await verify("cara@t.local");
r = await book(cara.token, day(3), "09:00", { ...contact("cara@t.local", "0171 2222222", "Cara Str 9"), promoCode: "ONCE15", paymentMethod: "cash" });
check("coupon limit reached → booking refused 422", r.status === 422 && r.body.reason === "limit_reached", r.body);
const caraCode = await myCode(cara.token);
r = await quote(cara.token, { promoCode: benCode });
check("someone else's code → not_yours", r.body.quote?.codeResult?.reason === "not_yours" && !r.body.quote.promotion, r.body.quote?.codeResult);
r = await book(cara.token, day(3), "09:00", { ...contact("cara@t.local", "0171 2222222", "Cara Str 9"), promoCode: benCode, paymentMethod: "cash" });
check("booking with someone else's code refused (422)", r.status === 422 && r.body.reason === "not_yours", r.body);
r = await book(cara.token, day(3), "09:00", { ...contact("cara@t.local", "0171 2222222", "Cara Str 9"), promoCode: caraCode, paymentMethod: "cash", expectedPayableCents: 7500 });
check("price changed (code gives 10 %) → 409 PRICE_CHANGED", r.status === 409 && r.body.code === "PRICE_CHANGED" && r.body.quote.lines.payableCents === 6750, r.body);
r = await book(cara.token, day(3), "09:00", { ...contact("cara@t.local", "0171 2222222", "Cara Str 9"), promoCode: caraCode, paymentMethod: "cash", totalCents: 1, discountCents: 7499, pricing: { payableCents: 1 } });
check("manipulated price fields ignored (server price 67.50)", r.status === 201 && r.body.booking.payment.amountCents === 6750, r.body.booking?.payment);
const caraBooking = r.body.booking;
r = await call("POST", `/customer/bookings/${caraBooking.id}/cancel`, {}, cara.token);
red = await PromotionRedemption.findOne({ booking: caraBooking.id });
check("cancelled before cleaning → welcome released, code usable again", r.status === 200 && red.status === "released" && (await PersonalCode.findOne({ code: caraCode })).status === "issued", red?.status);
r = await quote(cara.token, { promoCode: caraCode, contact: contact("cara@t.local", "0171 2222222", "Cara Str 9") });
check("own code works again after cancellation", r.body.quote?.codeResult?.ok === true, r.body.quote?.codeResult);
await PersonalCode.updateOne({ code: caraCode }, { expiresAt: new Date(Date.now() - 1000) });
r = await quote(cara.token, { promoCode: caraCode });
check("expired personal code refused", r.body.quote?.codeResult?.reason === "expired", r.body.quote?.codeResult);

// ---------- Gift cards: admin issue, redemption, partial, release ----------
r = await call("POST", "/admin/gift-cards/issue", { amountCents: 5000, recipientName: "Dora", recipientEmail: "dora@t.local", reason: "Kulanz", sendEmail: false }, adminT);
const card50 = r.body.giftCard;
check("admin issues €50 gift card", r.status === 201 && card50.status === "active" && card50.balanceCents === 5000 && /^FIDX-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(card50.code), r.body);
r = await call("POST", "/gift-cards/check", { code: card50.code.toLowerCase().replace(/-/g, " ") });
check("balance check (normalised code)", r.body.valid && r.body.balanceCents === 5000 && r.body.code.endsWith(card50.code.slice(-4)) && !r.body.code.includes(card50.code.slice(5, 9)), r.body);
r = await call("POST", "/gift-cards/check", { code: "FIDX-AAAA-BBBB-CCCC" });
check("unknown gift card → not_found", r.body.valid === false && r.body.reason === "not_found", r.body);

const dora = await register("Dora", "dora@t.local", "0172 3333333");
await verify("dora@t.local");
const doraContact = contact("dora@t.local", "0172 3333333", "Dora Weg 1");
const doraCode = await myCode(dora.token);
r = await quote(dora.token, { promoCode: doraCode, giftCardCodes: [card50.code], contact: doraContact });
q = r.body.quote;
check("quote: welcome then gift card (67.50 − 50 = 17.50 to pay)", q?.lines.totalCents === 6750 && q.lines.giftCardCents === 5000 && q.lines.payableCents === 1750 && q.lines.vatCents === 1078, q?.lines);
r = await book(dora.token, day(4), "09:00", { ...doraContact, promoCode: doraCode, giftCardCodes: [card50.code], paymentMethod: "cash", expectedPayableCents: 1750 });
const doraBooking = r.body.booking;
let card = await GiftCard.findById(card50._id);
check("gift card used: balance 0 → redeemed, cash 17.50", r.status === 201 && doraBooking.payment.amountCents === 1750 && card.balanceCents === 0 && card.status === "redeemed", { s: r.status, b: doraBooking?.payment, c: card?.status });
r = await call("POST", "/gift-cards/check", { code: card50.code });
check("empty card cannot be used again", r.body.valid === false && r.body.reason === "empty", r.body);
r = await call("POST", `/customer/bookings/${doraBooking.id}/cancel`, {}, dora.token);
card = await GiftCard.findById(card50._id);
check("cancellation credits €50 back, card active again", card.balanceCents === 5000 && card.status === "active", card);
const ledger = await GiftCardTransaction.find({ giftCard: card50._id }).sort({ createdAt: 1 });
check("ledger: issue → reserve → capture → refund", ledger.map((l) => l.type).join(",") === "issue,reserve,capture,refund", ledger.map((l) => l.type));

// Fully covered by a gift card
r = await call("POST", "/admin/gift-cards/issue", { amountCents: 10000, recipientName: "Eva", recipientEmail: "eva@t.local", reason: "Test", sendEmail: false }, adminT);
const card100 = r.body.giftCard;
r = await book(dora.token, day(5), "09:00", { ...doraContact, promoCode: doraCode, giftCardCodes: [card100.code], expectedPayableCents: 0 });
card = await GiftCard.findById(card100._id);
check("fully covered by gift card: confirmed, paid, €32.50 left", r.status === 201 && r.body.booking.status === "confirmed" && r.body.booking.payment.method === "gift_card" && r.body.booking.payment.status === "paid" && card.balanceCents === 3250, { b: r.body.booking?.payment, bal: card.balanceCents });

// Double spending race: two bookings in parallel with the same €32.50 card
const eve = await register("Eve", "eve@t.local", "0173 4444444");
const race = await Promise.all([0, 1].map((i) => book(eve.token, day(6), i ? "13:00" : "09:00", { ...contact("eve@t.local", "0173 4444444", "Eve Str 1"), giftCardCodes: [card100.code], paymentMethod: "cash" })));
card = await GiftCard.findById(card100._id);
const spent = await GiftCardTransaction.aggregate([{ $match: { giftCard: card._id, type: "reserve" } }, { $group: { _id: null, s: { $sum: "$amountCents" } } }]);
check("parallel use of one card: exactly one booking gets it, balance never negative", race.filter((x) => x.status === 201).length === 1 && race.filter((x) => x.status === 422).length === 1 && card.balanceCents === 0 && spent[0].s === -10000, race.map((x) => [x.status, x.body.reason]));

// ---------- Online payment (PayPal mock): success, failure, duplicates, refund ----------
r = await call("POST", "/admin/gift-cards/issue", { amountCents: 2500, recipientName: "Fin", recipientEmail: "fin@t.local", reason: "Test", sendEmail: false }, adminT);
const card25 = r.body.giftCard;
const fin = await register("Fin", "fin@t.local", "0174 5555555");
await verify("fin@t.local");
const finContact = contact("fin@t.local", "0174 5555555", "Fin Str 2");
const finCode = await myCode(fin.token);
r = await book(fin.token, day(7), "09:00", { ...finContact, promoCode: finCode, giftCardCodes: [card25.code], paymentMethod: "paypal", expectedPayableCents: 4250 });
const finBooking = r.body.booking;
const orderId = new URL(r.body.checkoutUrl).searchParams.get("token");
check("PayPal order for the payable amount only (67.50 − 25 = 42.50)", r.status === 201 && finBooking.status === "payment_pending" && paypal.orders.get(orderId)?.amount.value === "42.50", { s: r.status, o: paypal.orders.get(orderId)?.amount });
paypal.nextCapture = "DECLINED";
r = await call("POST", "/payments/paypal/capture", { bookingId: finBooking.id, orderId }, fin.token);
let fb = await Booking.findById(finBooking.id);
check("declined payment → 402, booking NOT confirmed", r.status === 402 && fb.status === "payment_pending" && fb.payment.status !== "paid", { s: r.status, b: fb.status });
r = await call("POST", "/payments/paypal/capture", { bookingId: finBooking.id, orderId }, fin.token);
fb = await Booking.findById(finBooking.id);
check("retry succeeds → confirmed, gift card captured, welcome applied", r.status === 200 && fb.status === "confirmed" && fb.payment.status === "paid" && fb.pricing.giftCards[0].state === "captured" && (await PromotionRedemption.findOne({ booking: fb._id })).status === "applied", { s: r.status, b: fb.status, g: fb.pricing.giftCards });
const capturesBefore = paypal.captures;
r = await call("POST", "/payments/paypal/capture", { bookingId: finBooking.id, orderId }, fin.token);
check("duplicate capture request is idempotent (no second charge)", r.status === 200 && paypal.captures === capturesBefore, { s: r.status, c: paypal.captures });
r = await call("POST", `/customer/bookings/${finBooking.id}/cancel`, {}, fin.token);
fb = await Booking.findById(finBooking.id);
card = await GiftCard.findById(card25._id);
check("cancel paid booking: PayPal refunded + gift card credited", r.body.refunded === true && paypal.refunds === 1 && fb.payment.status === "refunded" && card.balanceCents === 2500, { r: r.body.refunded, refunds: paypal.refunds, bal: card.balanceCents });

// Unpaid hold expires → gift card + promo released
r = await book(fin.token, day(8), "09:00", { ...finContact, promoCode: finCode, giftCardCodes: [card25.code], paymentMethod: "paypal" });
const holdId = r.body.booking.id;
await Booking.updateOne({ _id: holdId }, { holdExpiresAt: new Date(Date.now() - 1000) });
await expireStaleHolds();
fb = await Booking.findById(holdId);
card = await GiftCard.findById(card25._id);
check("expired unpaid hold → gift card + welcome + code released", fb.status === "expired" && card.balanceCents === 2500 && (await PromotionRedemption.findOne({ booking: holdId })).status === "released" && (await PersonalCode.findOne({ code: finCode })).status === "issued", { s: fb.status, bal: card.balanceCents });

// ---------- Gift card purchase (PayPal mock) ----------
r = await call("POST", "/gift-cards", { amountCents: 1234, recipientName: "Gina", recipientEmail: "gina@t.local", senderName: "Fin" }, fin.token);
check("invalid gift card amount → 422", r.status === 422, r.status);
r = await call("POST", "/gift-cards", { amountCents: 7500, recipientName: "Gina", recipientEmail: "gina@t.local", senderName: "Fin", message: "Frohe Weihnachten!", design: "festive", deliveryDate: day(3) }, fin.token);
const bought = r.body.giftCard;
const gcOrder = new URL(r.body.checkoutUrl).searchParams.get("token");
check("purchase started: pending, code hidden, PayPal order €75", r.status === 201 && bought.status === "pending_payment" && bought.code === null && paypal.orders.get(gcOrder)?.amount.value === "75.00", r.body);
r = await call("POST", "/gift-cards/check", { code: (await GiftCard.findById(bought.id)).code });
check("unpaid card cannot be redeemed", r.body.valid === false && r.body.reason === "not_active", r.body);
r = await call("POST", `/gift-cards/${bought.id}/paypal/capture`, { orderId: gcOrder }, ben.token);
check("other customer cannot capture someone else's card (404)", r.status === 404, r.status);
r = await call("POST", `/gift-cards/${bought.id}/paypal/capture`, { orderId: gcOrder }, fin.token);
check("purchase paid → active, €75 balance, code visible to buyer", r.status === 200 && r.body.giftCard.status === "active" && r.body.giftCard.balanceCents === 7500 && /^FIDX-/.test(r.body.giftCard.code), r.body);
check("scheduled delivery (not sent before the date)", r.body.giftCard.deliveryStatus === "pending" && r.body.giftCard.deliverAt, r.body.giftCard);
r = await call("POST", `/gift-cards/${bought.id}/paypal/capture`, { orderId: gcOrder }, fin.token);
const purchases = await GiftCardTransaction.countDocuments({ giftCard: bought.id, type: "purchase" });
check("duplicate purchase capture idempotent", r.status === 200 && purchases === 1, purchases);
const exp = (await GiftCard.findById(bought.id)).expiresAt;
check("valid until end of year + 3", exp.getUTCFullYear() === new Date().getUTCFullYear() + 3 && exp.getUTCMonth() === 11, exp);
r = await call("GET", "/gift-cards/mine", null, fin.token);
check("buyer sees own cards", r.body.giftCards?.length === 1 && r.body.giftCards[0].id === bought.id, r.body.giftCards?.length);

// ---------- Admin: gift cards, promotions, analytics, permissions ----------
r = await call("GET", `/admin/gift-cards?search=${card25.code.slice(-4)}`, null, adminT);
check("admin finds gift card by code part", r.body.giftCards?.some((c) => c._id === card25._id), r.body.giftCards?.length);
r = await call("POST", `/admin/gift-cards/${card25._id}/adjust`, { amountCents: -3000, reason: "Test minus" }, adminT);
check("adjust below zero refused", r.status === 409, r.status);
r = await call("POST", `/admin/gift-cards/${card25._id}/adjust`, { amountCents: 500, reason: "Kulanz Support" }, adminT);
check("admin adjustment +€5 (audited in ledger)", r.status === 200 && r.body.giftCard.balanceCents === 3000, r.body);
r = await call("POST", `/admin/gift-cards/${card25._id}/disable`, { reason: "Betrugsverdacht" }, adminT);
r = await call("POST", "/gift-cards/check", { code: card25.code });
check("disabled card cannot be used", r.body.reason === "disabled", r.body);
r = await call("GET", `/admin/gift-cards/${card25._id}`, null, adminT);
check("admin detail with ledger", r.body.transactions?.length >= 5, r.body.transactions?.map((t) => t.type));
const once = await Promotion.findOne({ code: "ONCE15" });
r = await call("DELETE", `/admin/promotions/${once._id}`, null, adminT);
check("used promotion cannot be deleted", r.status === 409, r.status);
r = await call("GET", "/admin/promotions", null, adminT);
const welcomeRow = r.body.promotions?.find((p) => p.kind === "welcome");
check("promotion list with stats", welcomeRow?.stats.applied >= 2 && r.body.promotions.some((p) => p.code === "WINTER10" && p.state === "live"), welcomeRow?.stats);
r = await call("GET", "/admin/analytics", null, adminT);
check("analytics: redemptions, discount total, gift card sales", r.body.promotions?.redemptions >= 3 && r.body.giftCards?.soldCount === 1 && r.body.giftCards.soldCents === 7500 && r.body.bookings.conversionRatePct != null, { p: r.body.promotions, g: r.body.giftCards, b: r.body.bookings });
r = await call("GET", "/promotions/active");
check("public banners: campaign hero only, welcome NOT advertised",
  r.body.promotions?.[0]?.code === "WINTER10" && r.body.promotions[0].placement === "hero" && !r.body.promotions.some((p) => p.kind === "welcome"),
  r.body.promotions?.map((p) => p.code ?? p.kind));
r = await call("GET", "/admin/promotions", null, anna.token);
check("customer cannot open admin promotions (403)", r.status === 403, r.status);
r = await call("GET", "/admin/gift-cards", null, fin.token);
check("customer cannot open admin gift cards (403)", r.status === 403, r.status);

const { failures, passes } = summary();
console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"} (${passes} passed)`);
await User.db.dropDatabase();
server.close();
paypal.close();
process.exit(failures ? 1 : 0);
