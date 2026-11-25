// Public cleaner profiles (no login): photo, first name, skills, ratings, reliability.
import mongoose from "mongoose";

import User from "../models/user.model.js";
import Review from "../models/review.model.js";
import { sendStoredFile } from "../services/file-store.service.js";
import { firstName, getWorkerStats, publicWorkerCard, PUBLIC_WORKER_FIELDS } from "../services/worker-profile.service.js";

const PUBLIC_FILTER = {
  role: "worker",
  workerStatus: "approved",
  isActive: true,
  "workerProfile.publicVisible": { $ne: false },
};

// GET /api/v1/cleaners
export const listCleaners = async (req, res, next) => {
  try {
    const workers = await User.find(PUBLIC_FILTER).select(PUBLIC_WORKER_FIELDS).limit(200).lean();
    const cleaners = [];
    for (const worker of workers) {
      const stats = await getWorkerStats(worker._id);
      cleaners.push({ ...publicWorkerCard(worker, stats), serviceAreas: worker.workerProfile?.serviceAreas ?? [] });
    }
    cleaners.sort((a, b) => (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) || b.jobsCompleted - a.jobsCompleted);
    res.set("Cache-Control", "public, max-age=60");
    return res.json({ success: true, count: cleaners.length, cleaners });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/cleaners/:id
export const getCleaner = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Cleaner not found." });
    }
    const worker = await User.findOne({ _id: req.params.id, ...PUBLIC_FILTER }).select(PUBLIC_WORKER_FIELDS).lean();
    if (!worker) return res.status(404).json({ success: false, message: "Cleaner not found." });

    const [stats, reviews] = await Promise.all([
      getWorkerStats(worker._id),
      Review.find({ worker: worker._id, hidden: false })
        .populate("customer", "name")
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
    ]);

    res.set("Cache-Control", "public, max-age=60");
    return res.json({
      success: true,
      cleaner: {
        ...publicWorkerCard(worker, stats),
        bio: worker.workerProfile?.bio ?? "",
        serviceAreas: worker.workerProfile?.serviceAreas ?? [],
        bringsSupplies: Boolean(worker.workerProfile?.bringsSupplies),
        memberSince: worker.createdAt,
        stats,
        reviews: reviews.map((r) => {
          const parts = String(r.customer?.name ?? "").trim().split(/\s+/);
          return {
            _id: r._id,
            rating: r.rating,
            comment: r.comment,
            // "Klara M." – never the full customer name
            author: parts[0] ? `${parts[0]}${parts[1] ? ` ${parts[1][0]}.` : ""}` : "",
            createdAt: r.createdAt,
          };
        }),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/cleaners/:id/avatar – any cleaner photo (admin also sees pending ones)
export const getCleanerAvatar = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
    const worker = await User.findOne({ _id: req.params.id, role: "worker" }).select("+avatarData avatarType avatarKey");
    if (!worker?.avatarKey && !worker?.avatarData?.length) return res.status(404).end();
    res.set({
      "Content-Type": worker.avatarType || "image/jpeg",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    });
    if (await sendStoredFile(res, { storageKey: worker.avatarKey, data: worker.avatarData })) return;
    res.removeHeader("Cache-Control");
    return res.status(404).end();
  } catch (error) {
    next(error);
  }
};

export { firstName };
