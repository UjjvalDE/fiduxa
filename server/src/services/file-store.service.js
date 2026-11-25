// File bytes: object storage (R2) when configured, MongoDB otherwise.
//
// A stored file record carries { storageKey, sha256, size } (bytes in the
// private bucket) OR the legacy inline bytes (e.g. `data: Buffer`). Reads
// accept both, so records written before the move keep working until the
// migration script (scripts/migrate-files-to-r2.js) has moved them.
// Downloads always go through the authenticated API routes (permission check
// first, then streamed from the bucket) – no public or presigned URLs.
import { createHash } from "node:crypto";

import PendingDelete from "../models/pending-delete.model.js";
import { logger } from "../utils/logger.js";
import { deleteObject, getObject, getObjectStream, isNotFound, isStorageConfigured, putObject } from "./storage.service.js";

export const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const EXT = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
export const extFor = (contentType) => EXT[contentType] ?? "bin";

/** Structured, private keys */
export const keys = {
  document: (userId, docId, type) => `documents/${userId}/${docId}.${extFor(type)}`,
  complaintPhoto: (complaintId, n, type) => `complaints/${complaintId}/${n}.${extFor(type)}`,
  applicationCv: (appId, type) => `applications/${appId}/cv.${extFor(type)}`,
  avatar: (userId, stamp, type) => `avatars/${userId}/${stamp}.${extFor(type)}`,
  invoice: (number, issuedAt) => `invoices/${/^FX-(\d{4})-/.exec(number)?.[1] ?? new Date(issuedAt ?? Date.now()).getUTCFullYear()}/${number}.pdf`,
  emailAttachment: (emailId, i, type) => `emails/${emailId}/${i}.${extFor(type)}`,
};

/**
 * Store bytes. Returns the fields to persist on the record:
 *   storage configured → { storageKey, sha256, size }
 *   otherwise (or upload failed) → { [inlineField]: buffer, sha256, size }
 */
export const storeBytes = async (key, buffer, contentType, { inlineField = "data" } = {}) => {
  const meta = { size: buffer.length, sha256: sha256(buffer) };
  if (isStorageConfigured()) {
    try {
      await putObject(key, buffer, contentType);
      return { ...meta, storageKey: key };
    } catch (error) {
      // Never lose an upload: keep it in MongoDB, the migration script moves it later
      logger.error({ err: error, key }, "Object storage upload failed – keeping the file in MongoDB");
    }
  }
  return { ...meta, [inlineField]: buffer };
};

// Mongoose Buffer, plain Uint8Array or a BSON Binary (lean queries)
const inlineBuffer = (data) => {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data.buffer instanceof Uint8Array) return Buffer.from(data.buffer.buffer, data.buffer.byteOffset, data.buffer.byteLength);
  return Buffer.from(data);
};

/** Bytes of a record (storage or inline). null = missing. */
export const loadBytes = async (record, { inlineField = "data" } = {}) => {
  if (record?.storageKey) {
    try {
      return (await getObject(record.storageKey)).body;
    } catch (error) {
      if (isNotFound(error)) {
        logger.warn({ key: record.storageKey }, "Stored file missing in object storage");
        return null;
      }
      throw error;
    }
  }
  const buf = inlineBuffer(record?.[inlineField]);
  return buf?.length ? buf : null;
};

/** The record has bytes somewhere (key or inline) */
export const hasBytes = (record, { inlineField = "data" } = {}) => Boolean(record?.storageKey || inlineBuffer(record?.[inlineField])?.length);

/**
 * Send a record's bytes. Headers are set by the caller BEFORE (permission
 * checks already passed). Streams from the bucket. Returns false when the
 * file is missing (caller answers 404).
 */
export const sendStoredFile = async (res, record, { inlineField = "data" } = {}) => {
  if (record?.storageKey) {
    let obj;
    try {
      obj = await getObjectStream(record.storageKey);
    } catch (error) {
      if (isNotFound(error)) {
        logger.warn({ key: record.storageKey }, "Stored file missing in object storage");
        return false;
      }
      throw error;
    }
    if (obj.contentLength != null) res.setHeader("Content-Length", String(obj.contentLength));
    await new Promise((resolve, reject) => {
      obj.stream.on("error", reject);
      res.on("finish", resolve);
      res.on("close", resolve);
      obj.stream.pipe(res);
    });
    return true;
  }
  const buf = inlineBuffer(record?.[inlineField]);
  if (!buf?.length) return false;
  res.send(buf);
  return true;
};

/**
 * Best-effort delete. Failures (or storage not configured right now) are
 * queued in PendingDelete and retried by the housekeeping job.
 */
export const removeStoredKeys = async (keyList, reason = "") => {
  const list = [...new Set((keyList ?? []).filter(Boolean))];
  let deleted = 0;
  for (const key of list) {
    try {
      if (!isStorageConfigured()) throw new Error("Object storage is not configured");
      await deleteObject(key);
      deleted++;
    } catch (error) {
      logger.warn({ err: error, key, reason }, "Object delete failed – queued for retry");
      await PendingDelete.updateOne(
        { key },
        { $setOnInsert: { key, reason }, $set: { lastError: String(error?.message ?? error).slice(0, 1000), nextAttemptAt: new Date(Date.now() + 5 * 60_000) }, $inc: { attempts: 1 } },
        { upsert: true }
      ).catch((e) => logger.error({ err: e, key }, "Could not queue object delete"));
    }
  }
  return { deleted, queued: list.length - deleted };
};

const RETRY_LIMIT = 100;
/** Housekeeping job: retry queued deletes (exponential back-off, max 1 day) */
export const processPendingDeletes = async () => {
  if (!isStorageConfigured()) return { skipped: true };
  const due = await PendingDelete.find({ nextAttemptAt: { $lte: new Date() } }).sort({ nextAttemptAt: 1 }).limit(RETRY_LIMIT);
  let deleted = 0;
  let failed = 0;
  for (const p of due) {
    try {
      await deleteObject(p.key);
      await PendingDelete.deleteOne({ _id: p._id });
      deleted++;
    } catch (error) {
      failed++;
      p.attempts += 1;
      p.lastError = String(error?.message ?? error).slice(0, 1000);
      p.nextAttemptAt = new Date(Date.now() + Math.min(2 ** p.attempts * 60_000, 24 * 3600_000));
      await p.save();
      logger.warn({ err: error, key: p.key, attempts: p.attempts }, "Queued object delete failed again");
    }
  }
  return { deleted, failed };
};
