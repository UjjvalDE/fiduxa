// Test API server for load tests: separate TEST database, PayPal mock,
// no SMTP, seeded data. Started as a child process by load-test.mjs.
import { ROOT, prepareEnv, startPayPalMock } from "../helpers/harness.mjs";

prepareEnv("fiduxa_load_test");
process.env.DISABLE_RATE_LIMIT = "1";
const paypal = await startPayPalMock();
process.env.PAYPAL_API_BASE = paypal.url;
process.env.PAYPALAPIKEY = "mock";
process.env.PAYPALSECRET_KEY = "mock";

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const { default: connectDB } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { default: GiftCard } = await import(ROOT + "/src/models/gift-card.model.js");
const { default: AvailabilitySlot } = await import(ROOT + "/src/models/availability-slot.model.js");
const { default: Booking } = await import(ROOT + "/src/models/booking.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { ensureDefaultPromotions } = await import(ROOT + "/src/services/promotion.service.js");
const { generateGiftCardCode, expiryFor } = await import(ROOT + "/src/services/gift-card.service.js");
const { todayInBerlin, DAY_MS } = await import(ROOT + "/src/utils/helpers.js");

const silence = console.log;
console.log = () => {};
await connectDB();
console.log = silence;
await mongoose.connection.db.dropDatabase();
for (const M of Object.values(mongoose.models)) await M.syncIndexes();
await loadSettings();
await ensureDefaultPromotions();

// Profile slow queries (> 20 ms) for the report
await mongoose.connection.db.command({ profile: 1, slowms: 20 });

const pw = await bcrypt.hash("Password12345", 10);
await User.create({ name: "Admin", email: "admin@load.test", password: pw, role: "admin" });
const users = [];
for (let i = 0; i < 40; i++) {
  users.push({ name: `Kunde ${i}`, email: `kunde${i}@load.test`, password: pw, role: "consumer", emailVerified: i % 2 === 0, phone: `0301000${String(i).padStart(3, "0")}` });
}
await User.insertMany(users);
const workers = [];
for (let i = 0; i < 30; i++) {
  workers.push({
    name: `Clean ${i}`, email: `clean${i}@load.test`, password: pw, role: "worker", workerStatus: "approved", emailVerified: true,
    workerProfile: { address: "Str 1", serviceAreas: ["Mitte"], petsOk: i % 2 === 0 }, bankAccountLast4: "1234", bankAccountHolder: "x",
  });
}
await User.insertMany(workers);

const today = todayInBerlin();
const slots = [];
for (let d = 1; d <= 30; d++) {
  slots.push({ date: new Date(today.getTime() + d * DAY_MS), startTime: "07:00", endTime: "20:00", capacity: 60, active: true });
}
await AvailabilitySlot.insertMany(slots);

const now = new Date();
const cards = [];
for (let i = 0; i < 20; i++) {
  cards.push({ code: await generateGiftCardCode(), status: "active", initialCents: 1_000_000, balanceCents: 1_000_000, expiresAt: expiryFor(now), payment: { method: "admin", paidAt: now } });
}
await GiftCard.insertMany(cards);

const server = app.listen(Number(process.env.LOAD_PORT) || 0, "127.0.0.1", () => {
  process.send?.({ ready: true, port: server.address().port, giftCards: cards.map((c) => c.code), pid: process.pid });
});

process.on("message", async (msg) => {
  if (msg?.type === "stats") {
    const db = mongoose.connection.db;
    const slow = await db.collection("system.profile").find({}).sort({ millis: -1 }).limit(10).toArray();
    const count = await db.collection("system.profile").countDocuments();
    const collStats = {};
    for (const name of ["bookings", "promotionredemptions", "giftcards", "giftcardtransactions", "reservationlocks"]) {
      collStats[name] = await db.collection(name).countDocuments();
    }
    process.send({
      type: "stats",
      slowQueries: count,
      slowest: slow.map((s) => ({ ns: s.ns, op: s.op, millis: s.millis, planSummary: s.planSummary, keysExamined: s.keysExamined, docsExamined: s.docsExamined })),
      counts: collStats,
      openJobsSample: await Booking.countDocuments({ status: "confirmed", assignedWorker: null }),
    });
  }
  if (msg?.type === "bench-open-jobs") {
    // Before/after: old matching (one conflict query per open job) vs new (one batched query)
    const { findWorkerConflict, loadBusyRanges, conflictIn, isOpenJob } = await import(ROOT + "/src/services/job-dispatch.service.js");
    const worker = await User.findOne({ role: "worker" });
    const candidates = await Booking.find({ status: "confirmed", assignedWorker: null }).limit(100);
    const time = async (fn, runs = 20) => {
      const t = process.hrtime.bigint();
      for (let i = 0; i < runs; i++) await fn();
      return Number(process.hrtime.bigint() - t) / 1e6 / runs;
    };
    const before = await time(async () => {
      for (const b of candidates) if (isOpenJob(b)) await findWorkerConflict(worker._id, b);
    });
    const after = await time(async () => {
      const dates = [...new Set(candidates.map((b) => b.preferredDate.getTime()))].map((t) => new Date(t));
      const busy = (await loadBusyRanges([worker._id], dates)).get(String(worker._id));
      for (const b of candidates) if (isOpenJob(b)) conflictIn(busy, b);
    });
    process.send({ type: "bench-open-jobs", openJobs: candidates.length, beforeMs: before, afterMs: after });
  }
  if (msg?.type === "heap") {
    // Heap after a forced GC: tells a real leak apart from lazy garbage collection
    global.gc?.();
    await new Promise((r) => setTimeout(r, 200));
    global.gc?.();
    const m = process.memoryUsage();
    process.send({ type: "heap", heapUsedMb: +(m.heapUsed / 1048576).toFixed(1), rssMb: +(m.rss / 1048576).toFixed(1) });
  }
  if (msg?.type === "stop") {
    await mongoose.connection.db.dropDatabase();
    server.close();
    paypal.close();
    process.exit(0);
  }
});
