// Gives every DUMMY cleaner (testData = TEST_DATA_TAG) approved test documents
// so they pass the work-eligibility gate in development:
//   - about half are EU citizens (ID only), the rest non-EU (ID + work permit)
//   - documents are verified with expiry dates 2–4 years ahead
//   - a few edge cases for testing the UI: one ID expiring in 20 days,
//     one permit pending review
// The file is a tiny placeholder PNG marked "TEST". Real cleaners are never touched.
//
//   npm run seed:dummy:documents          add (skips cleaners that already have docs)
//   npm run seed:dummy:documents -- --reset   replace the test documents
import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import { TEST_DATA_TAG } from "../models/plugins/test-data.plugin.js";

const reset = process.argv.includes("--reset");

// 1×1 PNG placeholder
const PLACEHOLDER = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const EU = ["DE", "PL", "RO", "IT", "ES", "BG", "HR", "PT"];
const NON_EU = ["TR", "UA", "IN", "SY", "VN", "BR", "NG"];

const yearsAhead = (n, i) => new Date(Date.UTC(new Date().getUTCFullYear() + n, (i * 3) % 12, 1 + (i % 27)));
const daysAhead = (n) => new Date(Date.now() + n * 86400000);

const doc = (kind, i, { status = "verified", expiresAt = null, idType = "" } = {}) => ({
  kind,
  name: `TEST-${kind}-${i + 1}.png`,
  type: "image/png",
  size: PLACEHOLDER.length,
  data: PLACEHOLDER,
  uploadedAt: new Date(),
  status,
  note: status === "verified" ? "Testdokument (Dummy-Daten)" : "",
  checkedAt: status === "verified" ? new Date() : null,
  idType,
  expiresAt,
});

const main = async () => {
  if (process.env.NODE_ENV === "production" || process.env.PAYPAL_MODE === "live") {
    console.error("Refusing: production environment. Test documents are for development only.");
    process.exit(2);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const dbName = mongoose.connection.db.databaseName;
  if (/prod/i.test(dbName)) {
    console.error(`Refusing: database name "${dbName}".`);
    process.exit(2);
  }

  const cleaners = await User.find({ role: "worker", testData: TEST_DATA_TAG }).select("name documents workEligibility").sort({ createdAt: 1 });
  let updated = 0;
  let skipped = 0;
  for (const [i, c] of cleaners.entries()) {
    if (!reset && c.documents?.length) {
      skipped++;
      continue;
    }
    const eu = i % 2 === 0;
    const nationality = eu ? EU[i % EU.length] : NON_EU[i % NON_EU.length];
    const docs = [];

    // Edge case: cleaner #3 has an ID expiring in 20 days ("expires soon")
    const idExpiry = i === 2 ? daysAhead(20) : yearsAhead(2 + (i % 3), i);
    docs.push(doc("id", i, { expiresAt: idExpiry, idType: eu && i % 4 === 0 ? "national_id" : "passport" }));

    if (!eu) {
      // Edge case: cleaner #6 has a renewed permit waiting for admin review
      docs.push(doc("permit", i, { expiresAt: yearsAhead(1 + (i % 3), i), idType: "residence_permit" }));
      if (i === 5) docs.push(doc("permit", i, { status: "pending", idType: "residence_permit" }));
    }

    c.documents = docs;
    c.workEligibility = { nationality, euCitizen: eu, declaredAt: new Date() };
    await c.save();
    updated++;
  }
  console.log(`Dummy cleaners: ${cleaners.length} · documents added: ${updated} · skipped (already had docs): ${skipped}`);
  await mongoose.disconnect();
};

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
