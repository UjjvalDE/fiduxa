// Post-service feedback pop-ups (customer + cleaner) and the admin evaluation
// (plain averages / counts – no AI analysis).
//
// · Customer: a completed booking with a cleaner, completed in the last
//   PROMPT_DAYS days, without a Review and without a customer JobFeedback →
//   the account shows the pop-up until it is submitted or dismissed.
// · Cleaner: same for their completed jobs without a worker JobFeedback; the
//   completion response tells the cleaner app to open the pop-up right away.
// Cleaner answers about the customer are INTERNAL ONLY.
import Booking from "../models/booking.model.js";
import JobFeedback from "../models/job-feedback.model.js";
import Review from "../models/review.model.js";
import User from "../models/user.model.js";
import { DAY_MS, httpError } from "../utils/helpers.js";

export const PROMPT_DAYS = 30;

const promptFilter = (extra) => ({
  status: "completed",
  assignedWorker: { $ne: null },
  "job.completedAt": { $gte: new Date(Date.now() - PROMPT_DAYS * DAY_MS) },
  ...extra,
});

const promptRow = (b) => ({
  bookingId: b._id,
  reference: b.reference,
  serviceId: b.serviceId,
  preferredDate: b.preferredDate,
  completedAt: b.job?.completedAt ?? null,
});

/** Customer: completed bookings that still wait for feedback (newest first) */
export const pendingCustomerFeedback = async (customerId) => {
  const bookings = await Booking.find(promptFilter({ customer: customerId }))
    .select("reference serviceId preferredDate job.completedAt assignedWorker")
    .populate("assignedWorker", "name")
    .sort({ "job.completedAt": -1 })
    .limit(20)
    .lean();
  if (!bookings.length) return [];
  const ids = bookings.map((b) => b._id);
  const [reviewed, answered] = await Promise.all([
    Review.find({ booking: { $in: ids } }).distinct("booking"),
    JobFeedback.find({ booking: { $in: ids }, role: "customer" }).distinct("booking"),
  ]);
  const done = new Set([...reviewed, ...answered].map(String));
  return bookings
    .filter((b) => !done.has(String(b._id)))
    .map((b) => ({ ...promptRow(b), cleanerName: b.assignedWorker?.name?.split(" ")[0] ?? "" }));
};

/** Cleaner: own completed jobs that still wait for the cleaner's feedback */
export const pendingWorkerFeedback = async (workerId) => {
  const bookings = await Booking.find(promptFilter({ assignedWorker: workerId }))
    .select("reference serviceId preferredDate job.completedAt")
    .sort({ "job.completedAt": -1 })
    .limit(20)
    .lean();
  if (!bookings.length) return [];
  const answered = new Set(
    (await JobFeedback.find({ booking: { $in: bookings.map((b) => b._id) }, role: "worker" }).distinct("booking")).map(String)
  );
  return bookings.filter((b) => !answered.has(String(b._id))).map(promptRow);
};

const base = (booking, role) => ({
  booking: booking._id,
  role,
  customer: booking.customer,
  worker: booking.assignedWorker,
  postcode: booking.customerDetails?.postcode ?? "",
  serviceId: booking.serviceId ?? "",
});

const assertPromptable = (booking) => {
  if (booking.status !== "completed" || !booking.assignedWorker) {
    throw httpError(409, "Feedback is only possible for completed cleanings.");
  }
};

/** Store a submitted answer set (insert only – one per booking and side). */
const insertFeedback = async (doc) => {
  const existing = await JobFeedback.findOne({ booking: doc.booking, role: doc.role });
  if (existing?.status === "submitted") throw httpError(409, "Feedback for this cleaning was already submitted.");
  if (existing) {
    // A dismissed pop-up can still be answered later (e.g. from the booking page)
    existing.set({ ...doc, dismissedAt: undefined });
    return existing.save();
  }
  return JobFeedback.create(doc).catch((error) => {
    if (error.code === 11000) throw httpError(409, "Feedback for this cleaning was already submitted.");
    throw error;
  });
};

/** Customer answers (called by the review endpoint after the Review was created) */
export const saveCustomerFeedback = async (booking, answers) => {
  assertPromptable(booking);
  return insertFeedback({ ...base(booking, "customer"), status: "submitted", submittedAt: new Date(), customerAnswers: answers });
};

/** Cleaner answers (internal) */
export const saveWorkerFeedback = async (booking, answers) => {
  assertPromptable(booking);
  return insertFeedback({ ...base(booking, "worker"), status: "submitted", submittedAt: new Date(), workerAnswers: answers });
};

/** Close the pop-up without answering (idempotent; never overwrites answers) */
export const dismissFeedback = async (booking, role) => {
  assertPromptable(booking);
  await JobFeedback.updateOne(
    { booking: booking._id, role },
    { $setOnInsert: { ...base(booking, role), status: "dismissed", dismissedAt: new Date() } },
    { upsert: true }
  );
};

// ---------------------------------------------------------------------------
// Admin evaluation
// ---------------------------------------------------------------------------

const CUSTOMER_SCORES = ["overallExperience", "cleanerRating", "professionalPunctual"];
const WORKER_SCORES = ["experience", "customerRating", "homeCondition", "cooperative", "jobDifficulty"];
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

/** Build the $match for the admin filters (date range of submission) */
export const feedbackMatch = ({ from, to } = {}) => {
  const match = { status: "submitted" };
  if (from || to) {
    match.submittedAt = {};
    if (from) match.submittedAt.$gte = from;
    if (to) match.submittedAt.$lt = to;
  }
  return match;
};

const groupAverages = async (match, role, groupKey, fields) => {
  const prefix = role === "customer" ? "customerAnswers" : "workerAnswers";
  const rows = await JobFeedback.aggregate([
    { $match: { ...match, role } },
    {
      $group: {
        _id: `$${groupKey}`,
        count: { $sum: 1 },
        ...Object.fromEntries(fields.map((f) => [f, { $avg: `$${prefix}.${f}` }])),
        ...(role === "customer" && { notAsExpected: { $sum: { $cond: [{ $in: ["$customerAnswers.completedAsExpected", ["partly", "no"]] }, 1, 0] } } }),
        ...(role === "worker" && { withDifficulties: { $sum: { $cond: ["$workerAnswers.hadDifficulties", 1, 0] } } }),
      },
    },
    { $sort: { count: -1 } },
    { $limit: 200 },
  ]);
  return rows.map((r) => ({ key: r._id, ...Object.fromEntries(Object.entries(r).filter(([k]) => k !== "_id").map(([k, v]) => [k, typeof v === "number" && fields.includes(k) ? round2(v) : v])) }));
};

const tagCounts = async (match, role, path) => {
  const rows = await JobFeedback.aggregate([
    { $match: { ...match, role } },
    { $unwind: `$${path}` },
    { $group: { _id: `$${path}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return rows.map((r) => ({ tag: r._id, count: r.count }));
};

const withNames = async (rows) => {
  const users = await User.find({ _id: { $in: rows.map((r) => r.key).filter(Boolean) } }).select("name email").lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return rows.map((r) => ({ ...r, name: byId.get(String(r.key))?.name ?? "–", email: byId.get(String(r.key))?.email ?? "" }));
};

/**
 * Averages per cleaner (customer answers), per customer (cleaner answers),
 * per postcode area (both sides) and problem-tag counts.
 */
export const feedbackSummary = async (filters = {}) => {
  const match = feedbackMatch(filters);
  const [perCleaner, perCustomer, districtCustomer, districtWorker, customerIssues, workerDifficulties, workerConditions, totals, dismissed] = await Promise.all([
    groupAverages(match, "customer", "worker", CUSTOMER_SCORES).then(withNames),
    groupAverages(match, "worker", "customer", WORKER_SCORES).then(withNames),
    groupAverages(match, "customer", "postcode", CUSTOMER_SCORES),
    groupAverages(match, "worker", "postcode", WORKER_SCORES),
    tagCounts(match, "customer", "customerAnswers.issueTags"),
    tagCounts(match, "worker", "workerAnswers.difficultyTags"),
    tagCounts(match, "worker", "workerAnswers.conditionTags"),
    Promise.all([
      groupAverages(match, "customer", "role", CUSTOMER_SCORES),
      groupAverages(match, "worker", "role", WORKER_SCORES),
    ]),
    JobFeedback.aggregate([{ $match: { status: "dismissed" } }, { $group: { _id: "$role", count: { $sum: 1 } } }]),
  ]);
  const districts = new Map();
  for (const r of districtCustomer) districts.set(r.key, { postcode: r.key, customer: r });
  for (const r of districtWorker) districts.set(r.key, { ...(districts.get(r.key) ?? { postcode: r.key }), worker: r });
  return {
    overall: { customer: totals[0][0] ?? null, worker: totals[1][0] ?? null },
    dismissed: Object.fromEntries(dismissed.map((d) => [d._id, d.count])),
    perCleaner,
    perCustomer,
    perDistrict: [...districts.values()].sort((a, b) => String(a.postcode).localeCompare(String(b.postcode))),
    tags: { customerIssues, workerDifficulties, workerConditions },
  };
};

const csvCell = (v) => {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join("|") : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formulas and quote everything
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const CSV_COLUMNS = [
  "submittedAt", "role", "reference", "postcode", "serviceId", "customerEmail", "cleanerEmail",
  "overallExperience", "cleanerRating", "professionalPunctual", "completedAsExpected", "issueTags", "issueText",
  "experience", "customerRating", "homeCondition", "cooperative", "hadDifficulties", "difficultyTags", "difficultyText", "conditionTags", "conditionText", "jobDifficulty",
];

/** One row per submitted feedback (both sides), UTF-8 CSV with BOM */
export const feedbackCsv = async (filters = {}) => {
  const docs = await JobFeedback.find(feedbackMatch(filters))
    .sort({ submittedAt: -1 })
    .limit(50000)
    .populate("booking", "reference")
    .populate("customer", "email")
    .populate("worker", "email")
    .lean();
  const lines = [CSV_COLUMNS.join(",")];
  for (const d of docs) {
    const c = d.customerAnswers ?? {};
    const w = d.workerAnswers ?? {};
    const row = {
      submittedAt: d.submittedAt, role: d.role, reference: d.booking?.reference, postcode: d.postcode, serviceId: d.serviceId,
      customerEmail: d.customer?.email, cleanerEmail: d.worker?.email,
      ...(d.role === "customer" ? c : {}),
      ...(d.role === "worker" ? w : {}),
    };
    lines.push(CSV_COLUMNS.map((k) => csvCell(row[k])).join(","));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
};
