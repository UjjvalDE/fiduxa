// Runs every API end-to-end suite against a TEST MongoDB.
//   MONGODB_TEST_URI=mongodb://127.0.0.1:27999 npm run test:e2e
// Each suite uses its own database (dropped afterwards), fake Stripe/PayPal
// servers and no SMTP – no real payments or emails.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "e2e");
const only = process.argv[2];
const suites = readdirSync(dir).filter((f) => f.endsWith(".e2e.mjs") && (!only || f.includes(only))).sort();

let failed = 0;
const results = [];
for (const suite of suites) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(dir, suite)], { encoding: "utf8", env: process.env });
  const out = `${run.stdout}${run.stderr}`;
  const passes = (out.match(/^PASS /gm) || []).length;
  const fails = out.split("\n").filter((l) => l.startsWith("FAIL"));
  const ok = run.status === 0 && fails.length === 0;
  if (!ok) failed++;
  results.push({ suite, ok, passes, fails: fails.length, seconds: ((Date.now() - started) / 1000).toFixed(1) });
  console.log(`${ok ? "✔" : "✘"} ${suite}  ${passes} passed, ${fails.length} failed  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  for (const line of fails) console.log(`    ${line}`);
  if (!ok && fails.length === 0) console.log(out.split("\n").slice(-25).join("\n"));
}
const total = results.reduce((s, r) => s + r.passes, 0);
console.log(`\n${failed ? `${failed} suite(s) FAILED` : "All suites passed"} – ${total} checks`);
process.exit(failed ? 1 : 0);
