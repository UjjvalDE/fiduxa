// One-off, idempotent migration for the automatic assignment (round 3).
// For every cleaner (real and dummy):
//   · weekly pattern: the existing weekly hours ARE the pattern (every week);
//     cleaners without hours are listed – they count as not available until
//     they set a pattern (their dashboard shows a prompt)
//   · location: homePostcode from the postcode in their address; travel
//     radius from their service districts (farthest district, 10–25 km),
//     otherwise 10 km
//   · skills: services they do not list in their profile specialties are
//     excluded (only when the profile lists at least one service)
// Running it twice changes nothing. Bookings are not touched – confirmed
// bookings without a cleaner are picked up by the assignmentWatch job.
//
//   node src/scripts/migrate-assignment-2026-11.js            → apply
//   node src/scripts/migrate-assignment-2026-11.js --dry-run  → only show the changes
import "dotenv/config";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import User from "../models/user.model.js";
import { DISTRICT_POSTCODES, distanceKm, postcodeFromAddress } from "../data/berlin-postcodes.js";

const dryRun = process.argv.includes("--dry-run");
const SERVICE_SPECIALTIES = { "home-cleaning": "home-cleaning", "deep-cleaning": "deep-cleaning", "end-of-tenancy": "end-of-tenancy", "business-cleaning": "office-cleaning" };

await connectDB();
// lean → raw stored values (no schema defaults), so "missing" really means missing
const workers = await User.find({ role: "worker", anonymisedAt: null }).select("name email workerStatus availability workerProfile").lean();
let changed = 0;
const noPattern = [];
for (const w of workers) {
  const set = {};
  const p = w.workerProfile ?? {};
  const home = (p.homePostcode || "").trim() || postcodeFromAddress(p.address);
  if (!p.homePostcode && home) set["workerProfile.homePostcode"] = home;
  const raw = p;
  if (raw.maxTravelKm === undefined || raw.maxTravelKm === null) {
    const distances = (p.serviceAreas ?? []).map((d) => (home && DISTRICT_POSTCODES[d] ? distanceKm(home, DISTRICT_POSTCODES[d]) : null)).filter((km) => km !== null);
    set["workerProfile.maxTravelKm"] = distances.length ? Math.min(25, Math.max(10, Math.ceil(Math.max(...distances)))) : 10;
  }
  const listed = (p.specialties ?? []).filter((s) => Object.values(SERVICE_SPECIALTIES).includes(s));
  if ((raw.excludedServices === undefined || raw.excludedServices === null) && listed.length) {
    set["workerProfile.excludedServices"] = Object.entries(SERVICE_SPECIALTIES).filter(([, spec]) => !listed.includes(spec)).map(([id]) => id);
  }
  if (!(w.availability ?? []).length && w.workerStatus === "approved") noPattern.push(`${w.name} <${w.email}>`);
  if (Object.keys(set).length) {
    changed += 1;
    console.log(`${dryRun ? "[dry-run] " : ""}${w.name}: ${JSON.stringify(set)}`);
    if (!dryRun) await User.updateOne({ _id: w._id }, { $set: set });
  }
}
console.log(`\n${changed} of ${workers.length} cleaners ${dryRun ? "would be " : ""}updated.`);
if (noPattern.length) console.log(`Approved cleaners WITHOUT weekly hours (not available until they set a pattern):\n  ${noPattern.join("\n  ")}`);
await mongoose.disconnect();
