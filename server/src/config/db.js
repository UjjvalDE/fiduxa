// MongoDB connection with sensible pool/timeout defaults, connection-event
// logging and a startup retry loop (the process never crashes just because
// MongoDB is not up yet – /health stays alive, /ready reports 503 until the
// database answers). The driver reconnects automatically after an outage.
//
// Tunables (env): DB_POOL_SIZE (20), DB_MIN_POOL_SIZE (0),
// DB_SERVER_SELECTION_TIMEOUT_MS (5000), DB_SOCKET_TIMEOUT_MS (45000),
// DB_MAX_IDLE_TIME_MS (60000), DB_CONNECT_RETRIES (0 = forever).
import "./mongoose-defaults.js";
import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

const num = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

export const connectionOptions = () => ({
  maxPoolSize: num("DB_POOL_SIZE", 20),
  minPoolSize: num("DB_MIN_POOL_SIZE", 0),
  serverSelectionTimeoutMS: num("DB_SERVER_SELECTION_TIMEOUT_MS", 5_000),
  socketTimeoutMS: num("DB_SOCKET_TIMEOUT_MS", 45_000),
  maxIdleTimeMS: num("DB_MAX_IDLE_TIME_MS", 60_000),
  heartbeatFrequencyMS: num("DB_HEARTBEAT_MS", 10_000),
  retryWrites: true,
});

let listenersAttached = false;
let everConnected = false;
const attachListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;
  const conn = mongoose.connection;
  conn.on("connected", () => {
    logger.info({ db: conn.name }, everConnected ? "MongoDB reconnected" : "MongoDB connected");
    everConnected = true;
  });
  conn.on("disconnected", () => logger.warn("MongoDB disconnected – requests answer 503 until it is back"));
  conn.on("reconnected", () => logger.info("MongoDB reconnected"));
  conn.on("error", (err) => logger.error({ err: err?.message }, "MongoDB connection error"));
};

/** True while Mongoose has a live connection. */
export const isDbConnected = () => mongoose.connection.readyState === 1;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connect, retrying with exponential backoff (1 s → 30 s). Resolves once
 * connected. Rejects only when DB_CONNECT_RETRIES (> 0) attempts all failed.
 */
const connectDB = async ({ retries = num("DB_CONNECT_RETRIES", 0), onRetry } = {}) => {
  attachListeners();
  for (let attempt = 1; ; attempt++) {
    try {
      const connection = await mongoose.connect(process.env.MONGODB_URI, connectionOptions());
      logger.info({ db: connection.connection.name, host: connection.connection.host }, "MongoDB ready");
      return connection;
    } catch (error) {
      if (retries > 0 && attempt >= retries) {
        logger.fatal({ err: error.message, attempt }, "MongoDB connection failed – giving up");
        throw error;
      }
      const wait = Math.min(30_000, 1_000 * 2 ** Math.min(attempt - 1, 5));
      logger.error({ err: error.message, attempt, retryInMs: wait }, "MongoDB connection failed – retrying");
      onRetry?.(attempt, error);
      await sleep(wait);
    }
  }
};

export default connectDB;
