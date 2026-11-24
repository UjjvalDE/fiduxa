// Load test: 10 and 20 concurrent virtual users against a TEST API server
// (separate database, PayPal mock, no emails, no real payments).
//
//   MONGODB_TEST_URI=mongodb://127.0.0.1:27999 npm run test:load
//   LOAD_DURATION=15 LOAD_USERS=10,20 FRONTEND_URL=http://127.0.0.1:3201 npm run test:load
//
// FRONTEND_URL (optional) = a Next.js production server (`next start`) whose
// API_PROXY_TARGET points to the printed test API URL.
import { fork, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const DURATION = Number(process.env.LOAD_DURATION || 10) * 1000;
const USERS = (process.env.LOAD_USERS || "10,20").split(",").map(Number);
const FRONTEND = process.env.FRONTEND_URL || null;

// ---------- start the test API server ----------
const child = fork(path.join(here, "server.mjs"), [], { execArgv: ["--expose-gc"], env: { ...process.env, LOAD_PORT: process.env.LOAD_PORT || "0" }, stdio: ["ignore", "ignore", "inherit", "ipc"] });
const ready = await new Promise((resolve, reject) => {
  child.on("message", (m) => m.ready && resolve(m));
  child.on("exit", (code) => reject(new Error(`Test server exited (${code})`)));
});
const API = `http://127.0.0.1:${ready.port}/api/v1`;
console.log(`Test API: ${API} (pid ${ready.pid})${FRONTEND ? ` · Frontend: ${FRONTEND}` : ""}`);
const ask = (type) =>
  new Promise((resolve) => {
    const onMsg = (m) => m.type === type && (child.off("message", onMsg), resolve(m));
    child.on("message", onMsg);
    child.send({ type });
  });

const req = async (method, url, body, token) => {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    await res.arrayBuffer();
    return { ms: performance.now() - started, status: res.status };
  } catch {
    return { ms: performance.now() - started, status: 0 };
  }
};

// ---------- tokens ----------
const login = async (email) =>
  (await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Password12345" }) })).json()).token;
const customers = await Promise.all(Array.from({ length: 40 }, (_, i) => login(`kunde${i}@load.test`)));
const cleaners = await Promise.all(Array.from({ length: 30 }, (_, i) => login(`clean${i}@load.test`)));

const today = new Date();
const day = (n) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + n)).toISOString().slice(0, 10);
const windows = {};
for (let d = 1; d <= 30; d++) {
  const r = await (await fetch(`${API}/bookings/availability?date=${day(d)}&duration=120`)).json();
  windows[d] = r.data?.[0]?.windowId;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const starts = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
const property = { serviceId: "home-cleaning", areaM2: 60, extras: ["inside-oven"] };
let bookingSeq = 0;

// ---------- scenarios ----------
const scenarios = {
  catalogue: (vu) => req("GET", `${API}/${pick(["services", "pricing", "extras", "promotions/active"])}`),
  availability: () => (Math.random() < 0.5 ? req("GET", `${API}/bookings/availability/days?duration=180`) : req("GET", `${API}/bookings/availability?date=${day(1 + Math.floor(Math.random() * 30))}&duration=180`)),
  quote: (vu) => req("POST", `${API}/bookings/quote`, { ...property, promoCode: "XMAS10", giftCardCodes: [ready.giftCards[vu % 20]] }, customers[vu % 40]),
  "coupon+giftcard check": (vu) => (Math.random() < 0.5 ? req("POST", `${API}/gift-cards/check`, { code: ready.giftCards[vu % 20] }) : req("POST", `${API}/bookings/quote`, { ...property, promoCode: pick(["XMAS10", "INVALID", "FIXED20"]) }, customers[vu % 40])),
  "booking (cash / PayPal session)": (vu) => {
    const d = 1 + ((vu + bookingSeq++) % 30);
    const paypal = Math.random() < 0.4;
    return req(
      "POST",
      `${API}/bookings`,
      {
        ...property,
        name: "Load Test",
        email: `kunde${vu % 40}@load.test`,
        phone: "030123456",
        postcode: "10115",
        address: `Teststr. ${vu}`,
        preferredDate: day(d),
        slotId: windows[d],
        startTime: pick(starts),
        earlyStartConsent: true,
        paymentMethod: paypal ? "paypal" : "cash",
        ...(Math.random() < 0.3 && { giftCardCodes: [ready.giftCards[vu % 20]] }),
      },
      customers[vu % 40]
    );
  },
  "cleaner open jobs": (vu) => req("GET", `${API}/worker/jobs/open`, null, cleaners[vu % 30]),
  ...(FRONTEND && {
    "homepage (Next.js)": () => req("GET", `${FRONTEND}${pick(["/", "/buchung", "/gutscheine", "/preise"])}`),
  }),
};

// ---------- resource sampling (server process) ----------
const sample = (pid) => {
  try {
    const [cpu, rss] = execFileSync("ps", ["-o", "%cpu=,rss=", "-p", String(pid)], { encoding: "utf8" }).trim().split(/\s+/).map(Number);
    return { cpu, rssMb: rss / 1024 };
  } catch {
    return null;
  }
};

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

const run = async (name, fn, users) => {
  const lat = [];
  const statuses = {};
  const samples = [];
  const end = Date.now() + DURATION;
  const sampler = setInterval(() => {
    const s = sample(ready.pid);
    if (s) samples.push(s);
  }, 500);
  await Promise.all(
    Array.from({ length: users }, async (_, vu) => {
      while (Date.now() < end) {
        const r = await fn(vu);
        lat.push(r.ms);
        statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      }
    })
  );
  clearInterval(sampler);
  lat.sort((a, b) => a - b);
  const total = lat.length;
  // 409 = slot/price taken (correct business answer under contention), 422 = invalid code on purpose
  const errors = Object.entries(statuses).filter(([s]) => s === "0" || Number(s) >= 500).reduce((a, [, c]) => a + c, 0);
  const rejected = (statuses[409] ?? 0) + (statuses[422] ?? 0);
  return {
    scenario: name,
    users,
    requests: total,
    rps: +(total / (DURATION / 1000)).toFixed(1),
    avgMs: +(lat.reduce((a, b) => a + b, 0) / total).toFixed(1),
    medianMs: +pct(lat, 50).toFixed(1),
    p95Ms: +pct(lat, 95).toFixed(1),
    p99Ms: +pct(lat, 99).toFixed(1),
    maxMs: +lat[total - 1].toFixed(1),
    errorRatePct: +((errors / total) * 100).toFixed(2),
    businessRejectPct: +((rejected / total) * 100).toFixed(1),
    statuses,
    cpuAvgPct: samples.length ? +(samples.reduce((a, s) => a + s.cpu, 0) / samples.length).toFixed(0) : null,
    cpuMaxPct: samples.length ? Math.max(...samples.map((s) => s.cpu)) : null,
    rssMaxMb: samples.length ? +Math.max(...samples.map((s) => s.rssMb)).toFixed(0) : null,
  };
};

const results = [];
const rssStart = sample(ready.pid)?.rssMb;
const heapStart = await ask("heap");
for (const users of USERS) {
  for (const [name, fn] of Object.entries(scenarios)) {
    const r = await run(name, fn, users);
    results.push(r);
    console.log(
      `${String(users).padStart(2)} VU  ${name.padEnd(32)} ${String(r.requests).padStart(6)} req  ${String(r.rps).padStart(7)} rps  avg ${String(r.avgMs).padStart(6)} ms  p50 ${String(r.medianMs).padStart(6)}  p95 ${String(r.p95Ms).padStart(6)}  p99 ${String(r.p99Ms).padStart(6)}  err ${r.errorRatePct}%  409/422 ${r.businessRejectPct}%  CPU ${r.cpuAvgPct}% (max ${r.cpuMaxPct}%)  RSS ${r.rssMaxMb} MB`
    );
  }
}
const rssEnd = sample(ready.pid)?.rssMb;
const heapEnd = await ask("heap");
const db = await ask("stats");
const bench = await ask("bench-open-jobs");

const report = {
  executedAt: new Date().toISOString(),
  machine: { cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, memoryGb: +(os.totalmem() / 1e9).toFixed(1), node: process.version },
  durationSecondsPerScenario: DURATION / 1000,
  results,
  memory: {
    rssStartMb: rssStart && +rssStart.toFixed(0),
    rssEndMb: rssEnd && +rssEnd.toFixed(0),
    heapAfterGcStartMb: heapStart.heapUsedMb,
    heapAfterGcEndMb: heapEnd.heapUsedMb,
  },
  database: db,
  openJobsMatching: bench,
};
mkdirSync(path.join(here, "results"), { recursive: true });
const file = path.join(here, "results", `load-${report.executedAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`\nServer RSS: ${report.memory.rssStartMb} MB → ${report.memory.rssEndMb} MB · heap after GC: ${heapStart.heapUsedMb} MB → ${heapEnd.heapUsedMb} MB`);
console.log(`Slow queries (>20 ms): ${db.slowQueries}`, db.slowest.slice(0, 3));
console.log(`Open-job matching (${bench.openJobs} open jobs): before ${bench.beforeMs.toFixed(1)} ms → after ${bench.afterMs.toFixed(1)} ms`);
console.log(`Report: ${file}`);
child.send({ type: "stop" });
