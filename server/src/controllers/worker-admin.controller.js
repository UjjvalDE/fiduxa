import { z } from "zod";
import mongoose from "mongoose";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";

import User from "../models/user.model.js";
import { sendWorkerInvitationEmail } from "../services/email.service.js";
import { recordAudit } from "../services/audit.service.js";
import { escapeRegex, getPagination, paginationMeta, todayInBerlin } from "../utils/helpers.js";
import { avatarUrl, getWorkerStats } from "../services/worker-profile.service.js";
import { workerRateCents } from "../services/payout.service.js";

const WORKER_STATUSES = [
  "invited",
  "pending_review",
  "approved",
  "rejected",
  "suspended",
];

const createInvitationToken = () => {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
};

const WORKER_REVIEW_FIELDS =
  "name email phone emailVerified workerStatus workerProfile bankAccountHolder bankAccountLast4 workerReview createdAt avatarUpdatedAt availability holidays workerPayRateCents";

const createWorkerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(30).optional().default(""),
  locale: z.enum(["de", "en", "pl"]).optional().default("de"),
});

const reviewWorkerSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional().default(""),
});

// Masked bank summary – never expose the full IBAN to the admin UI
const toBankSummary = (worker) => ({
  accountHolder: worker.bankAccountHolder || "",
  iban: worker.bankAccountLast4
    ? `•••• •••• •••• ${worker.bankAccountLast4}`
    : "Not provided",
  status: worker.bankAccountLast4 ? "saved" : "missing",
});

// 1. Admin invites a worker
export const createWorker = async (req, res, next) => {
  try {
    const data = createWorkerSchema.parse(req.body);

    if (!process.env.WORKER_INVITATION_URL) {
      return res.status(500).json({
        success: false,
        message: "Worker invitation URL is not configured.",
      });
    }

    const existing = await User.findOne({ email: data.email });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const { token, tokenHash, expires } = createInvitationToken();

    // Unusable random password until the worker accepts the invitation
    const temporaryPassword = randomBytes(48).toString("hex");
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const worker = await User.create({
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: passwordHash,
      role: "worker",
      preferredLanguage: data.locale,
      workerStatus: "invited",
      emailVerified: false,
      invitationTokenHash: tokenHash,
      invitationExpires: expires,
    });

    const invitationUrl = `${process.env.WORKER_INVITATION_URL}?token=${token}`;

    try {
      await sendWorkerInvitationEmail({
        to: worker.email,
        name: worker.name,
        invitationUrl,
        locale: worker.preferredLanguage,
      });
    } catch (emailError) {
      await User.deleteOne({ _id: worker._id });
      throw emailError;
    }

    await recordAudit({
      actor: req.user._id,
      action: "worker.invited",
      entityType: "User",
      entityId: worker._id,
      after: { email: worker.email, workerStatus: worker.workerStatus },
    });

    return res.status(201).json({
      success: true,
      message: "Worker invitation sent.",
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        workerStatus: worker.workerStatus,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    next(error);
  }
};

// 2. Admin lists workers waiting for approval
export const getPendingWorkers = async (req, res, next) => {
  try {
    const workers = await User.find({
      role: "worker",
      workerStatus: "pending_review",
    })
      .select(WORKER_REVIEW_FIELDS)
      .sort({ createdAt: -1 })
      .lean();

    const result = workers.map((worker) => ({
      id: worker._id,
      name: worker.name,
      email: worker.email,
      phone: worker.phone,
      emailVerified: worker.emailVerified,
      workerStatus: worker.workerStatus,
      workerProfile: worker.workerProfile,
      bankDetails: toBankSummary(worker),
      submittedAt: worker.createdAt,
    }));

    return res.json({
      success: true,
      count: result.length,
      workers: result,
    });
  } catch (error) {
    next(error);
  }
};

// 3. Admin views an individual worker before review
export const getWorkerForReview = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid worker ID.",
      });
    }

    const worker = await User.findOne({
      _id: req.params.id,
      role: "worker",
    })
      .select(WORKER_REVIEW_FIELDS)
      .lean();

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Worker not found.",
      });
    }

    return res.json({
      success: true,
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        emailVerified: worker.emailVerified,
        workerStatus: worker.workerStatus,
        workerProfile: worker.workerProfile,
        bankDetails: toBankSummary(worker),
        workerReview: worker.workerReview,
        createdAt: worker.createdAt,
        avatarUrl: avatarUrl(worker),
        availability: worker.availability ?? [],
        holidays: (worker.holidays ?? [])
          .filter((h) => h.to >= todayInBerlin())
          .map((h) => ({ id: h._id, from: h.from.toISOString().slice(0, 10), to: h.to.toISOString().slice(0, 10), note: h.note })),
        payRateCents: workerRateCents(worker),
        customPayRate: worker.workerPayRateCents != null,
      },
      stats: await getWorkerStats(worker._id),
    });
  } catch (error) {
    next(error);
  }
};

// 4. Admin approves or rejects a worker
export const reviewWorker = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid worker ID.",
      });
    }

    const data = reviewWorkerSchema.parse(req.body);

    const worker = await User.findOne({
      _id: req.params.id,
      role: "worker",
    });

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Worker not found.",
      });
    }

    if (worker.workerStatus !== "pending_review") {
      return res.status(409).json({
        success: false,
        message: "Only workers awaiting review can be reviewed.",
      });
    }

    if (data.status === "approved") {
      const profileComplete =
        Boolean(worker.workerProfile?.address) &&
        Array.isArray(worker.workerProfile?.serviceAreas) &&
        worker.workerProfile.serviceAreas.length > 0;

      const bankDetailsComplete = Boolean(
        worker.bankAccountLast4 && worker.bankAccountHolder
      );

      if (!worker.emailVerified || !profileComplete || !bankDetailsComplete) {
        return res.status(400).json({
          success: false,
          message:
            "Worker must verify email and complete their profile and bank details before approval.",
        });
      }
    }

    const previousStatus = worker.workerStatus;
    worker.workerStatus = data.status;
    worker.workerReview = {
      reviewedAt: new Date(),
      reviewedBy: req.user._id,
      note: data.note,
    };

    await worker.save();

    await recordAudit({
      actor: req.user._id,
      action: `worker.${data.status}`,
      entityType: "User",
      entityId: worker._id,
      before: { workerStatus: previousStatus },
      after: { workerStatus: worker.workerStatus, note: data.note },
    });

    return res.json({
      success: true,
      message:
        data.status === "approved"
          ? "Worker approved successfully."
          : "Worker rejected successfully.",
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        workerStatus: worker.workerStatus,
        workerReview: worker.workerReview,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 5. Admin lists all workers (optionally filtered)
// GET /api/v1/admin/workers?status=approved&search=&page=&limit=
export const listWorkers = async (req, res, next) => {
  try {
    const pagination = getPagination(req.query, { defaultLimit: 20 });
    const filter = { role: "worker" };

    if (req.query.status) {
      if (!WORKER_STATUSES.includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid worker status.",
        });
      }
      filter.workerStatus = req.query.status;
    }

    if (req.query.search) {
      const regex = new RegExp(escapeRegex(String(req.query.search).trim()), "i");
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const [workers, total] = await Promise.all([
      User.find(filter)
        .select(`${WORKER_REVIEW_FIELDS} isActive`)
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      pagination: paginationMeta(pagination, total),
      workers: workers.map((worker) => ({
        id: worker._id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        isActive: worker.isActive,
        emailVerified: worker.emailVerified,
        workerStatus: worker.workerStatus,
        workerProfile: worker.workerProfile,
        bankDetails: toBankSummary(worker),
        createdAt: worker.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// 6. Admin suspends or reactivates an approved worker
// PATCH /api/v1/admin/workers/:id/status  { action: "suspend" | "reactivate", note? }
export const setWorkerStatus = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid worker ID.",
      });
    }

    const data = z
      .object({
        action: z.enum(["suspend", "reactivate"]),
        note: z.string().trim().max(500).optional().default(""),
      })
      .parse(req.body);

    const worker = await User.findOne({ _id: req.params.id, role: "worker" });

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Worker not found.",
      });
    }

    const before = {
      workerStatus: worker.workerStatus,
      isActive: worker.isActive,
    };

    if (data.action === "suspend") {
      if (worker.workerStatus !== "approved") {
        return res.status(409).json({
          success: false,
          message: "Only approved workers can be suspended.",
        });
      }
      worker.workerStatus = "suspended";
      worker.isActive = false; // blocks login and API access
    } else {
      if (worker.workerStatus !== "suspended") {
        return res.status(409).json({
          success: false,
          message: "Only suspended workers can be reactivated.",
        });
      }
      worker.workerStatus = "approved";
      worker.isActive = true;
    }

    worker.workerReview = {
      reviewedAt: new Date(),
      reviewedBy: req.user._id,
      note: data.note,
    };

    await worker.save();

    await recordAudit({
      actor: req.user._id,
      action: `worker.${data.action === "suspend" ? "suspended" : "reactivated"}`,
      entityType: "User",
      entityId: worker._id,
      before,
      after: {
        workerStatus: worker.workerStatus,
        isActive: worker.isActive,
        note: data.note,
      },
    });

    return res.json({
      success: true,
      message:
        data.action === "suspend" ? "Worker suspended." : "Worker reactivated.",
      worker: {
        id: worker._id,
        workerStatus: worker.workerStatus,
        isActive: worker.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 7. Admin resends an invitation (new 24h token)
// POST /api/v1/admin/workers/:id/resend-invitation
export const resendWorkerInvitation = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid worker ID.",
      });
    }

    if (!process.env.WORKER_INVITATION_URL) {
      return res.status(500).json({
        success: false,
        message: "Worker invitation URL is not configured.",
      });
    }

    const worker = await User.findOne({
      _id: req.params.id,
      role: "worker",
      workerStatus: "invited",
    });

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "No open invitation found for this worker.",
      });
    }

    const { token, tokenHash, expires } = createInvitationToken();
    worker.invitationTokenHash = tokenHash;
    worker.invitationExpires = expires;
    await worker.save();

    await sendWorkerInvitationEmail({
      to: worker.email,
      name: worker.name,
      invitationUrl: `${process.env.WORKER_INVITATION_URL}?token=${token}`,
      locale: worker.preferredLanguage,
    });

    return res.json({
      success: true,
      message: "Invitation resent.",
    });
  } catch (error) {
    next(error);
  }
};
