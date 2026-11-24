// Bring the database indexes in line with the models:
// creates missing indexes and drops ones that are no longer defined
// (e.g. redundant single-field indexes). Data is never changed.
//
//   node src/scripts/sync-indexes.js            → apply
//   node src/scripts/sync-indexes.js --dry-run  → only show the differences
import "dotenv/config";
import mongoose from "mongoose";

import connectDB from "../config/db.js";

const dryRun = process.argv.includes("--dry-run");

const modelFiles = [
  "user", "booking", "availability-slot", "payment", "promotion", "promotion-redemption", "personal-code",
  "gift-card", "gift-card-transaction", "review", "booking-message", "payout", "audit-log", "business-request",
  "contact-message", "settings", "reservation-lock", "counter",
];
for (const f of modelFiles) {
  try {
    await import(`../models/${f}.model.js`);
  } catch {
    /* model file not present */
  }
}

await connectDB();
for (const model of Object.values(mongoose.models)) {
  const diff = await model.diffIndexes();
  const label = model.collection.collectionName.padEnd(24);
  if (!diff.toDrop.length && !diff.toCreate.length) {
    console.log(`${label} ok`);
    continue;
  }
  console.log(`${label} drop: ${diff.toDrop.join(", ") || "-"} | create: ${diff.toCreate.map((i) => JSON.stringify(i)).join(", ") || "-"}`);
  if (!dryRun) await model.syncIndexes();
}
console.log(dryRun ? "\nDry run – nothing changed." : "\nIndexes synchronised.");
await mongoose.disconnect();
