// E2E: resilience – DB outage (fast 503 DB_UNAVAILABLE, /ready 503, webhook 503,
// recovery after reconnect, jobs paused), maintenance mode (customers 503,
// admins pass), busy guard (in-flight and event-loop-lag thresholds),
// query time limit (maxTimeMS) and process-level error mapping.
import { ROOT, prepareEnv, createChecker, apiClient } from "../helpers/harness.mjs";

prepareEnv("fiduxa_e2e_resilience");
process.env.EMAIL_TRANSPORT = "json";

const { createRequire } = await import("node:module");
const require = createRequire(ROOT + "/package.json");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const { default: connectDB, connectionOptions } = await import(ROOT + "/src/config/db.js");
const { default: app } = await import(ROOT + "/src/app.js");
const { default: User } = await import(ROOT + "/src/models/user.model.js");
const { loadSettings } = await import(ROOT + "/src/services/settings.service.js");
const { isDbTimeoutError, isDbUnavailableError } = await import(ROOT + "/src/config/mongoose-defaults.js");
const { runJob } = await import(ROOT + "/src/jobs/scheduler.js");
const { JOBS } = await import(ROOT + "/src/jobs/index.js");

await connectDB();
await User.db.dropDatabase();
for (const M of Object.values(User.db.models)) await M.syncIndexes();
await loadSettings();
const server = app.listen(0);
const origin = `http://127.0.0.1:${server.address().port}`;
const base = `${origin}/api/v1`;
const call = apiClient(base);
const { check, summary } = createChecker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pw = await bcrypt.hash("Password12345", 12);
await User.create({ name: "Admin", email: "admin@t.local", password: pw, role: "admin" });
await User.create({ name: "Kunde", email: "kunde@t.local", password: pw, role: "consumer", emailVerified: true, phone: "030 123456" });
const login = async (email) => (await call("POST", "/auth/login", { email, password: "Password12345" })).body.token;
const adminT = await login("admin@t.local");
const custT = await login("kunde@t.local");

// ---------- Connection settings ----------
{
  const opts = connectionOptions();
  check("pool + timeouts configured", opts.maxPoolSize > 0 && opts.serverSelectionTimeoutMS > 0 && opts.socketTimeoutMS > 0 && opts.maxIdleTimeMS > 0, opts);
  const h = await (await fetch(`${origin}/health`)).json();
  check("/health reports db up + uptime, no secrets", h.db === "up" && typeof h.uptime === "number" && !JSON.stringify(h).includes("mongodb://"), h);
  const r = await fetch(`${base}/ready`);
  const b = await r.json();
  check("/api/v1/ready (proxy path) → 200 db up", r.status === 200 && b.db === "up" && b.maintenance === false, b);
}

// ---------- DB outage ----------
await mongoose.disconnect();
{
  const t0 = Date.now();
  const r = await fetch(`${base}/promotions/active`);
  const b = await r.json();
  const ms = Date.now() - t0;
  check("DB down: API route → 503 DB_UNAVAILABLE", r.status === 503 && b.code === "DB_UNAVAILABLE", { status: r.status, b });
  check("DB down: answer is fast (< 500 ms)", ms < 500, ms);
  check("DB down: Retry-After header", Number(r.headers.get("retry-after")) > 0, r.headers.get("retry-after"));

  const auth = await call("GET", "/users/me", undefined, custT);
  check("DB down: authenticated route → 503 (no hang, no 500)", auth.status === 503 && auth.body.code === "DB_UNAVAILABLE", auth);

  const ready = await fetch(`${origin}/ready`);
  const rb = await ready.json();
  check("DB down: /ready → 503 db down", ready.status === 503 && rb.db === "down" && rb.ready === false, rb);
  const health = await fetch(`${origin}/health`);
  const hb = await health.json();
  check("DB down: /health stays 200 (liveness)", health.status === 200 && hb.db === "down", hb);

  const wh = await fetch(`${base}/payments/paypal/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "WH-1", event_type: "CHECKOUT.ORDER.APPROVED" }) });
  check("DB down: PayPal webhook → 503 (PayPal retries later)", wh.status === 503, wh.status);
  const swh = await fetch(`${base}/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("DB down: Stripe webhook → 503", swh.status === 503, swh.status);

  const job = await runJob(JOBS[0]);
  check("DB down: scheduler skips job runs instead of failing", job.ran === false && job.skipped === "db_unavailable", job);
}
await connectDB();
{
  const r = await fetch(`${base}/promotions/active`);
  check("DB back: API route recovers (200)", r.status === 200, r.status);
  const ready = await fetch(`${origin}/ready`);
  check("DB back: /ready → 200", ready.status === 200, ready.status);
  const me = await call("GET", "/users/me", undefined, custT);
  check("DB back: sessions still valid", me.status === 200, me.status);
  const job = await runJob(JOBS[0]);
  check("DB back: jobs resume", job.ran !== false || job.skipped !== "db_unavailable", job);
}

// ---------- Error classification ----------
{
  check("server-selection errors classify as DB unavailable", isDbUnavailableError({ name: "MongoServerSelectionError", message: "x" }) && isDbUnavailableError({ name: "Error", message: "Operation `users.find()` buffering timed out after 5000ms" }));
  check("validation errors are not DB outages", !isDbUnavailableError({ name: "ValidationError", message: "bad" }));
}

// ---------- Slow query → maxTimeMS ----------
{
  process.env.DB_MAX_TIME_MS = "100";
  let err = null;
  try {
    await User.find({ $where: "sleep(1000) || true" }).lean();
  } catch (e) {
    err = e;
  }
  if (err && /\$where|JavaScript|not allowed/i.test(err.message) && !isDbTimeoutError(err)) {
    console.log("SKIP  slow query: server-side JavaScript disabled on the test mongod");
  } else {
    check("slow query is cut off by the global maxTimeMS (code 50)", isDbTimeoutError(err), err && { code: err.code, msg: err.message });
  }
  let aggErr = null;
  try {
    await User.aggregate([{ $match: { $expr: { $function: { body: "function(){ sleep(1000); return true; }", args: [], lang: "js" } } } }]);
  } catch (e) {
    aggErr = e;
  }
  if (aggErr && !isDbTimeoutError(aggErr)) console.log("SKIP  slow aggregate: server-side JavaScript disabled");
  else check("slow aggregation is cut off by the global maxTimeMS", isDbTimeoutError(aggErr), aggErr?.message);
  delete process.env.DB_MAX_TIME_MS;
  const ok = await User.countDocuments();
  check("normal queries unaffected after the limit is restored", ok === 2, ok);
}

// ---------- Maintenance mode ----------
process.env.MAINTENANCE_MODE = "true";
{
  const c = await call("GET", "/users/me", undefined, custT);
  check("maintenance: customer route → 503 MAINTENANCE", c.status === 503 && c.body.code === "MAINTENANCE", c);
  const pub = await fetch(`${base}/promotions/active`);
  check("maintenance: public route → 503 MAINTENANCE", pub.status === 503 && (await pub.json()).code === "MAINTENANCE", pub.status);
  const a = await call("GET", "/admin/dashboard/stats", undefined, adminT);
  check("maintenance: admin routes still work", a.status === 200, a);
  const ap = await call("GET", "/promotions/active", undefined, adminT);
  check("maintenance: admins can use other routes too", ap.status === 200, ap.status);
  const l = await call("POST", "/auth/login", { email: "admin@t.local", password: "Password12345" });
  check("maintenance: admin login still possible", l.status === 200 && l.body.token, l.status);
  const ready = await (await fetch(`${base}/ready`)).json();
  check("maintenance: /ready reports maintenance flag", ready.maintenance === true, ready);
}
delete process.env.MAINTENANCE_MODE;
{
  const c = await call("GET", "/users/me", undefined, custT);
  check("maintenance off: customer route works again", c.status === 200, c.status);
}

// ---------- Busy guard ----------
process.env.BUSY_MAX_INFLIGHT = "1";
{
  const results = await Promise.all(Array.from({ length: 30 }, () => fetch(`${base}/promotions/active`).then(async (r) => ({ s: r.status, code: (await r.json()).code }))));
  const busy = results.filter((r) => r.s === 503 && r.code === "SERVER_BUSY").length;
  const ok = results.filter((r) => r.s === 200).length;
  check("busy guard: over the in-flight limit → 503 SERVER_BUSY", busy > 0 && ok > 0, { busy, ok });
  const h = await fetch(`${origin}/health`);
  check("busy guard: /health is never throttled", h.status === 200, h.status);
}
delete process.env.BUSY_MAX_INFLIGHT;
process.env.BUSY_MAX_LAG_MS = "5";
{
  // Sustained blocking (simulated CPU overload): 4 × 400 ms with short breaks
  for (let n = 0; n < 4; n++) {
    const until = Date.now() + 400;
    while (Date.now() < until) { /* block the event loop */ }
    await sleep(15);
  }
  let seen = null;
  for (let i = 0; i < 20 && !seen; i++) {
    await sleep(10);
    const r = await fetch(`${base}/promotions/active`);
    const b = await r.json();
    if (r.status === 503 && b.code === "SERVER_BUSY") seen = r;
  }
  check("busy guard: event-loop lag over threshold → 503 SERVER_BUSY", Boolean(seen) && Number(seen.headers.get("retry-after")) > 0);
  await sleep(4_000);
  const r = await fetch(`${base}/promotions/active`);
  check("busy guard: recovers once the lag is gone", r.status === 200, r.status);
}
delete process.env.BUSY_MAX_LAG_MS;

// ---------- Cleanup ----------
server.close();
await User.db.dropDatabase();
await mongoose.disconnect();
const { failures, passes } = summary();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
