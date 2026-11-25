// One-off, idempotent migration for the owner decisions of Nov 2026:
//   · cancellation: one tier only (free until 24 h, 20 % inside 24 h) –
//     the "very late" keys are removed; a stored lateFeePct from the old
//     shape (saved together with veryLate*) is reset to the new default 20 %.
//   · payouts: monthly on the 5th – the weekly/fast-payout keys are removed
//     and payoutDayOfMonth is set to 5 when missing.
// Only touches the single settings document { key: "platform" }. Bookings,
// payouts and other data are never changed. Running it twice changes nothing.
//
//   node src/scripts/migrate-policies-2026-11.js            → apply
//   node src/scripts/migrate-policies-2026-11.js --dry-run  → only show the change
import "dotenv/config";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import { POLICIES } from "../config/pricing.js";

const dryRun = process.argv.includes("--dry-run");
await connectDB();
const col = mongoose.connection.collection("settings");
const doc = await col.findOne({ key: "platform" });
const c = doc?.policies?.cancellation;
const p = doc?.policies?.payouts;
const $set = {};
const $unset = {};

if (c && ("veryLateHours" in c || "veryLateFeePct" in c)) {
  $unset["policies.cancellation.veryLateHours"] = "";
  $unset["policies.cancellation.veryLateFeePct"] = "";
  $set["policies.cancellation.lateFeePct"] = POLICIES.defaults.cancellation.lateFeePct;
}
if (p) {
  for (const k of ["eligibilityDays", "fastPayoutDays", "fastPayoutPct", "fastPayoutMinTier"]) {
    if (k in p) $unset[`policies.payouts.${k}`] = "";
  }
  if (p.payoutDayOfMonth === undefined) $set["policies.payouts.payoutDayOfMonth"] = POLICIES.defaults.payouts.payoutDayOfMonth;
}

const update = {};
if (Object.keys($set).length) update.$set = $set;
if (Object.keys($unset).length) update.$unset = $unset;
if (!doc) console.log("No stored settings document – defaults apply, nothing to do.");
else if (!Object.keys(update).length) console.log("Settings already migrated – nothing to do.");
else {
  console.log(dryRun ? "[dry-run] would apply:" : "Applying:", JSON.stringify(update));
  if (!dryRun) await col.updateOne({ _id: doc._id }, update);
}
await mongoose.disconnect();
