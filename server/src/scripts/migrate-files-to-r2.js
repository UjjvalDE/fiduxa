// Move file bytes that still live inline in MongoDB to object storage (R2).
//
//   node src/scripts/migrate-files-to-r2.js --dry-run     # counts only, changes nothing
//   node src/scripts/migrate-files-to-r2.js [--batch=50] [--limit=N]
//
// Covers: cleaner documents, avatars, complaint photos, application CVs,
// invoice PDFs and e-mail outbox attachments. For every file: upload under the
// structured key, verify with HEAD (size must match), then set
// storageKey/sha256/size and unset the inline bytes. Idempotent: records that
// already have a storageKey are skipped; a re-run continues where it stopped.
// Refuses to run when object storage is not configured.
import "dotenv/config";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import User from "../models/user.model.js";
import Complaint from "../models/complaint.model.js";
import WorkerApplication from "../models/worker-application.model.js";
import Booking from "../models/booking.model.js";
import EmailMessage from "../models/email.model.js";
import { headObject, putObject, storageDriver } from "../services/storage.service.js";
import { keys, sha256 } from "../services/file-store.service.js";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const BATCH = Math.max(1, Number(args.find((a) => a.startsWith("--batch="))?.split("=")[1]) || 50);
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1]) || Infinity;

const driver = storageDriver();
if (driver !== "r2") {
  console.error(`Refusing to run: object storage is not configured (driver: ${driver ?? "none"}). Set S3_ENDPOINT, ACCESS_KEY_ID_S3, ACCESS_SECRET_KEY_S3, R2_BUCKET_NAME.`);
  process.exit(1);
}

const toBuffer = (data) => {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data.buffer instanceof Uint8Array) return Buffer.from(data.buffer.buffer, data.buffer.byteOffset, data.buffer.byteLength);
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(data);
};

const stats = {};
const stat = (name) => (stats[name] ??= { found: 0, bytes: 0, migrated: 0, failed: 0 });
let processed = 0;

/** Upload + verify. Returns { storageKey, sha256, size } or null on failure. */
const upload = async (name, key, buffer, contentType) => {
  const s = stat(name);
  s.found++;
  s.bytes += buffer.length;
  processed++;
  if (DRY) return null;
  try {
    await putObject(key, buffer, contentType);
    const head = await headObject(key);
    if (!head || Number(head.size) !== buffer.length) throw new Error(`verification failed (head size ${head?.size} ≠ ${buffer.length})`);
    s.migrated++;
    return { storageKey: key, sha256: sha256(buffer), size: buffer.length };
  } catch (error) {
    s.failed++;
    console.error(`  ✘ ${name} ${key}: ${error.message}`);
    return null;
  }
};

const each = async (cursor, fn) => {
  for await (const doc of cursor) {
    if (processed >= LIMIT) break;
    await fn(doc);
  }
};

const run = async () => {
  await connectDB();
  console.log(`${DRY ? "DRY RUN – nothing is changed. " : ""}Batch size ${BATCH}${Number.isFinite(LIMIT) ? `, limit ${LIMIT}` : ""}`);

  // 1. Cleaner documents
  await each(User.find({ documents: { $elemMatch: { data: { $exists: true, $ne: null }, storageKey: { $in: [null, ""] } } } }).select("+documents.data").lean().cursor({ batchSize: BATCH }), async (u) => {
    for (const d of u.documents ?? []) {
      const buf = toBuffer(d.data);
      if (!buf?.length || d.storageKey) continue;
      const done = await upload("documents", keys.document(u._id, d._id, d.type), buf, d.type);
      if (done) {
        await User.updateOne(
          { _id: u._id, "documents._id": d._id },
          { $set: { "documents.$.storageKey": done.storageKey, "documents.$.sha256": done.sha256, "documents.$.size": done.size }, $unset: { "documents.$.data": "" } }
        );
      }
    }
  });

  // 2. Avatars
  await each(User.find({ avatarData: { $exists: true, $ne: null }, avatarKey: { $in: [null, ""] } }).select("+avatarData avatarType avatarUpdatedAt").lean().cursor({ batchSize: BATCH }), async (u) => {
    const buf = toBuffer(u.avatarData);
    if (!buf?.length) return;
    const type = u.avatarType || "image/jpeg";
    const done = await upload("avatars", keys.avatar(u._id, new Date(u.avatarUpdatedAt ?? Date.now()).getTime(), type), buf, type);
    if (done) await User.updateOne({ _id: u._id }, { $set: { avatarKey: done.storageKey }, $unset: { avatarData: "" } });
  });

  // 3. Complaint photos
  await each(Complaint.find({ photos: { $elemMatch: { data: { $exists: true, $ne: null }, storageKey: { $in: [null, ""] } } } }).select("+photos.data").lean().cursor({ batchSize: BATCH }), async (c) => {
    for (const [i, p] of (c.photos ?? []).entries()) {
      const buf = toBuffer(p.data);
      if (!buf?.length || p.storageKey) continue;
      const done = await upload("complaintPhotos", keys.complaintPhoto(c._id, i + 1, p.type), buf, p.type);
      if (done) {
        await Complaint.updateOne(
          { _id: c._id, "photos._id": p._id },
          { $set: { "photos.$.storageKey": done.storageKey, "photos.$.sha256": done.sha256, "photos.$.size": done.size }, $unset: { "photos.$.data": "" } }
        );
      }
    }
  });

  // 4. Application CVs
  await each(WorkerApplication.find({ "cv.data": { $exists: true, $ne: null }, "cv.storageKey": { $in: [null, ""] } }).select("+cv.data").lean().cursor({ batchSize: BATCH }), async (a) => {
    const buf = toBuffer(a.cv?.data);
    if (!buf?.length) return;
    const done = await upload("applicationCvs", keys.applicationCv(a._id, a.cv.type), buf, a.cv.type);
    if (done) {
      await WorkerApplication.updateOne({ _id: a._id }, { $set: { "cv.storageKey": done.storageKey, "cv.sha256": done.sha256, "cv.size": done.size }, $unset: { "cv.data": "" } }, { timestamps: false });
    }
  });

  // 5. Invoice PDFs
  await each(Booking.find({ "invoice.pdf": { $exists: true, $ne: null }, "invoice.storageKey": { $in: [null, ""] } }).select("+invoice.pdf invoice.number invoice.issuedAt").lean().cursor({ batchSize: BATCH }), async (b) => {
    const buf = toBuffer(b.invoice?.pdf);
    if (!buf?.length || !b.invoice.number) return;
    // Blank pre-fix PDFs (< 2 KB) are moved too; the download still re-renders them
    const done = await upload("invoices", keys.invoice(b.invoice.number, b.invoice.issuedAt), buf, "application/pdf");
    if (done) {
      await Booking.updateOne(
        { _id: b._id, "invoice.number": b.invoice.number },
        { $set: { "invoice.storageKey": done.storageKey, "invoice.sha256": done.sha256, "invoice.size": done.size }, $unset: { "invoice.pdf": "" } },
        { timestamps: false }
      );
    }
  });

  // 6. E-mail outbox attachments
  await each(EmailMessage.find({ "attachments.content": { $exists: true, $ne: null } }).select("attachments").lean().cursor({ batchSize: BATCH }), async (m) => {
    const next = [];
    let changed = false;
    for (const [i, att] of (m.attachments ?? []).entries()) {
      const buf = toBuffer(att.content);
      if (!buf?.length || att.storageKey) {
        next.push(att);
        continue;
      }
      const done = await upload("emailAttachments", keys.emailAttachment(m._id, i + 1, att.contentType), buf, att.contentType);
      if (done) {
        next.push({ filename: att.filename, contentType: att.contentType, storageKey: done.storageKey });
        changed = true;
      } else next.push(att);
    }
    if (changed) await EmailMessage.updateOne({ _id: m._id }, { $set: { attachments: next } }, { timestamps: false });
  });

  console.log(`\n${DRY ? "Would migrate" : "Result"}:`);
  for (const name of ["documents", "avatars", "complaintPhotos", "applicationCvs", "invoices", "emailAttachments"]) {
    const s = stat(name);
    console.log(`  ${name.padEnd(17)} files ${String(s.found).padStart(5)}  ${(s.bytes / 1024 / 1024).toFixed(2).padStart(8)} MB${DRY ? "" : `  migrated ${s.migrated}  failed ${s.failed}`}`);
  }
  if (Number.isFinite(LIMIT) && processed >= LIMIT) console.log(`Stopped at --limit=${LIMIT}; run again to continue.`);
  const failed = Object.values(stats).reduce((n, s) => n + s.failed, 0);
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
