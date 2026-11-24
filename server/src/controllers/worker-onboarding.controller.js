import { z } from "zod";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

import User from "../models/user.model.js";
import { encryptBankDetails } from "../utils/bank-encryption.js";

const hashToken = (value) => createHash("sha256").update(value).digest("hex");

// 1. Worker accepts the invitation and creates a password
export const acceptWorkerInvitation = async (req, res, next) => {
  try {
    const data = z
      .object({
        token: z.string().min(1),
        password: z.string().min(12).max(128),
      })
      .parse(req.body);

    const worker = await User.findOne({
      invitationTokenHash: hashToken(data.token),
      invitationExpires: { $gt: new Date() },
      role: "worker",
      workerStatus: "invited",
    }).select("+invitationTokenHash +invitationExpires");

    if (!worker) {
      return res.status(400).json({
        success: false,
        message: "Invitation is invalid or expired.",
      });
    }

    worker.password = await bcrypt.hash(data.password, 12);
    worker.emailVerified = true;
    worker.invitationTokenHash = undefined;
    worker.invitationExpires = undefined;
    worker.workerStatus = "pending_review";

    await worker.save();

    return res.status(200).json({
      success: true,
      message:
        "Your account has been created and your email is verified. Please complete your profile.",
      emailVerified: true,
      workerStatus: worker.workerStatus,
    });
  } catch (error) {
    next(error);
  }
};

// 3. Worker saves bank details securely
export const saveWorkerBankDetails = async (req, res, next) => {
  try {
    const schema = z.object({
      accountHolder: z.string().trim().min(2).max(100),
      iban: z
        .string()
        .trim()
        .transform((value) => value.replace(/\s/g, "").toUpperCase())
        .pipe(
          z
            .string()
            .regex(
              /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/,
              "Please enter a valid IBAN format.",
            ),
        ),
      bic: z.string().trim().max(11).optional().default(""),
    });

    const data = schema.parse(req.body);

    const worker = await User.findById(req.user._id);

    if (!worker || worker.role !== "worker") {
      return res.status(403).json({
        success: false,
        message: "Worker account required.",
      });
    }

    if (!worker.emailVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first.",
      });
    }

    if (
      worker.workerStatus === "invited" ||
      worker.workerStatus === "rejected" ||
      worker.workerStatus === "suspended"
    ) {
      return res.status(403).json({
        success: false,
        message: "Your worker account cannot be updated at this stage.",
      });
    }

    const encrypted = encryptBankDetails({
      accountHolder: data.accountHolder,
      iban: data.iban,
      bic: data.bic,
    });

    worker.bankDetailsEncrypted = encrypted.encrypted;
    worker.bankDetailsIv = encrypted.iv;
    worker.bankDetailsAuthTag = encrypted.authTag;
    worker.bankAccountLast4 = data.iban.slice(-4);
    worker.bankAccountHolder = data.accountHolder;

    await worker.save();

    return res.status(200).json({
      success: true,
      message: "Bank details saved securely.",
      bankDetails: {
        accountHolder: worker.bankAccountHolder,
        iban: `•••• •••• •••• ${worker.bankAccountLast4}`,
        bic: "Saved securely",
        status: "saved",
      },
    });
  } catch (error) {
    next(error);
  }
};
