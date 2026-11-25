// S3-compatible object storage (Cloudflare R2). Configured via
// S3_ENDPOINT, ACCESS_KEY_ID_S3, ACCESS_SECRET_KEY_S3, R2_BUCKET_NAME.
// The bucket is PRIVATE: files are only ever served through the authenticated
// API routes (file-store.service.js), never via public or presigned URLs.
//
// Drivers:
//   "r2"     – the real bucket (S3 env set; never under NODE_ENV=test)
//   "memory" – STORAGE_DRIVER=memory, an in-process Map for the e2e suites
//   null     – not configured → callers keep the bytes in MongoDB (fallback)
import { Readable } from "node:stream";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

let client = null;
const memory = new Map();

const r2Env = () =>
  Boolean(process.env.S3_ENDPOINT && process.env.ACCESS_KEY_ID_S3 && process.env.ACCESS_SECRET_KEY_S3 && process.env.R2_BUCKET_NAME);

export const storageDriver = () => {
  if (process.env.STORAGE_DRIVER === "memory") return "memory";
  if (process.env.STORAGE_DRIVER === "mongo") return null; // explicit opt-out
  // Automated tests never touch the real bucket
  if (process.env.NODE_ENV === "test") return null;
  return r2Env() ? "r2" : null;
};

export const isStorageConfigured = () => storageDriver() !== null;

/** Test helper: the in-memory bucket (STORAGE_DRIVER=memory) */
export const memoryBucket = memory;

const s3 = () => {
  if (!r2Env()) throw new Error("Object storage is not configured");
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: process.env.ACCESS_KEY_ID_S3, secretAccessKey: process.env.ACCESS_SECRET_KEY_S3 },
    });
  }
  return client;
};

const Bucket = () => process.env.R2_BUCKET_NAME;

const notFound = (key) => Object.assign(new Error(`Object not found: ${key}`), { code: "NoSuchKey", status: 404 });
export const isNotFound = (error) =>
  error?.code === "NoSuchKey" || error?.name === "NoSuchKey" || error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404;

const requireDriver = () => {
  const d = storageDriver();
  if (!d) throw new Error("Object storage is not configured");
  return d;
};

export async function putObject(key, body, contentType = "application/octet-stream") {
  if (requireDriver() === "memory") {
    memory.set(key, { body: Buffer.from(body), contentType });
    return key;
  }
  await s3().send(new PutObjectCommand({ Bucket: Bucket(), Key: key, Body: body, ContentType: contentType, ContentLength: body.length }));
  return key;
}

/** Whole object as a Buffer. Throws a NoSuchKey error when missing. */
export async function getObject(key) {
  if (requireDriver() === "memory") {
    const o = memory.get(key);
    if (!o) throw notFound(key);
    return { body: Buffer.from(o.body), contentType: o.contentType };
  }
  const res = await s3().send(new GetObjectCommand({ Bucket: Bucket(), Key: key }));
  return { body: Buffer.from(await res.Body.transformToByteArray()), contentType: res.ContentType };
}

/** Readable stream + length (for piping a download). Throws NoSuchKey when missing. */
export async function getObjectStream(key) {
  if (requireDriver() === "memory") {
    const o = memory.get(key);
    if (!o) throw notFound(key);
    return { stream: Readable.from([o.body]), contentType: o.contentType, contentLength: o.body.length };
  }
  const res = await s3().send(new GetObjectCommand({ Bucket: Bucket(), Key: key }));
  return { stream: res.Body, contentType: res.ContentType, contentLength: res.ContentLength };
}

/** { size, contentType } or null when the object does not exist */
export async function headObject(key) {
  if (requireDriver() === "memory") {
    const o = memory.get(key);
    return o ? { size: o.body.length, contentType: o.contentType } : null;
  }
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: Bucket(), Key: key }));
    return { size: res.ContentLength, contentType: res.ContentType };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function deleteObject(key) {
  if (requireDriver() === "memory") {
    if (process.env.STORAGE_FAIL_DELETES === "1") throw new Error("simulated delete failure");
    memory.delete(key);
    return;
  }
  await s3().send(new DeleteObjectCommand({ Bucket: Bucket(), Key: key }));
}
