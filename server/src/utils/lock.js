// Short-lived distributed lock in MongoDB (works on a standalone server
// without transactions). Used for booking slots, promotions and gift cards.
import mongoose from "mongoose";
import ReservationLock from "../models/reservation-lock.model.js";
import { httpError } from "./helpers.js";

const LOCK_MS = 10_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const withLock = async (key, fn) => {
  const token = new mongoose.Types.ObjectId();
  let locked = false;
  for (let attempt = 0; attempt < 80 && !locked; attempt++) {
    try {
      const res = await ReservationLock.findOneAndUpdate(
        { key, until: { $lt: new Date() } },
        { $set: { until: new Date(Date.now() + LOCK_MS), token } },
        { upsert: true, returnDocument: "after" }
      );
      locked = String(res.token) === String(token);
    } catch (error) {
      if (error.code !== 11000) throw error; // held by someone else
    }
    if (!locked) await sleep(30 + Math.random() * 70);
  }
  if (!locked) throw httpError(503, "Booking is busy right now. Please try again in a moment.");
  try {
    return await fn();
  } finally {
    await ReservationLock.updateOne({ key, token }, { $set: { until: new Date(0) } });
  }
};

/** Acquire several locks in a fixed order (avoids deadlocks) */
export const withLocks = async (keys, fn) => {
  const sorted = [...new Set(keys)].sort();
  const run = (i) => (i >= sorted.length ? fn() : withLock(sorted[i], () => run(i + 1)));
  return run(0);
};
