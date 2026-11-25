// Global Mongoose defaults – imported before any model is compiled
// (db.js and app.js import this first).
//
// - Every query/aggregation gets a server-side time limit (maxTimeMS), so a
//   slow query fails fast instead of piling up connections under load.
//   DB_MAX_TIME_MS (default 15000 ms, 0 = off). An explicit .maxTimeMS() wins.
// - Commands issued while disconnected wait at most DB_BUFFER_TIMEOUT_MS
//   (default 5000 ms) instead of Mongoose's 10 s.
import mongoose from "mongoose";

export const dbMaxTimeMS = () => {
  const raw = Number(process.env.DB_MAX_TIME_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 15_000;
};

mongoose.set("bufferTimeoutMS", Number(process.env.DB_BUFFER_TIMEOUT_MS) || 5_000);

const QUERY_OPS = [
  "find", "findOne", "countDocuments", "estimatedDocumentCount", "distinct",
  "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace",
  "updateOne", "updateMany", "deleteOne", "deleteMany", "replaceOne",
];

if (!mongoose.__fiduxaMaxTimePlugin) {
  mongoose.__fiduxaMaxTimePlugin = true;
  mongoose.plugin((schema) => {
    schema.pre(QUERY_OPS, function applyMaxTime() {
      const ms = dbMaxTimeMS();
      if (ms > 0 && this.getOptions().maxTimeMS == null) this.maxTimeMS(ms);
    });
    schema.pre("aggregate", function applyAggregateMaxTime() {
      const ms = dbMaxTimeMS();
      if (ms > 0 && this.options.maxTimeMS == null) this.option({ maxTimeMS: ms });
    });
  });
}

/** True for errors that mean "the database is unreachable right now". */
export const isDbUnavailableError = (err) => {
  if (!err) return false;
  const name = String(err.name || "");
  return (
    /MongoNetworkError|MongoServerSelectionError|MongooseServerSelectionError|MongoNotConnectedError|MongoNetworkTimeoutError|MongoTopologyClosedError|PoolClearedError/.test(name) ||
    /buffering timed out|Client must be connected|connection .* closed|Topology is closed/i.test(String(err.message || ""))
  );
};

/** True for "query exceeded maxTimeMS" (MongoDB error code 50). */
export const isDbTimeoutError = (err) => err?.code === 50 || err?.codeName === "MaxTimeMSExpired";
