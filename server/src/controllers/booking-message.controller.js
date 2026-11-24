import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import { getThread, postMessage } from "../services/booking-message.service.js";

// Who may read/write the thread of a booking
const loaders = {
  customer: (req) => ({ _id: req.params.id, customer: req.user._id }),
  worker: (req) => ({ _id: req.params.id, assignedWorker: req.user._id }),
  admin: (req) => ({ _id: req.params.id }),
};

const MESSAGE_FIELDS = "reference customer customerDetails.email customerDetails.name locale assignedWorker status";

const load = async (kind, req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid booking ID." });
    return null;
  }
  const booking = await Booking.findOne(loaders[kind](req)).select(MESSAGE_FIELDS);
  if (!booking) {
    res.status(404).json({ success: false, message: "Booking not found." });
    return null;
  }
  return booking;
};

const CLOSED = ["cancelled", "expired", "rejected"];

export const messageHandlers = (kind) => ({
  list: async (req, res, next) => {
    try {
      const booking = await load(kind, req, res);
      if (!booking) return;
      const messages = await getThread(booking, req.user);
      return res.json({
        success: true,
        messages,
        canWrite: kind === "admin" || !CLOSED.includes(booking.status),
        hasCleaner: Boolean(booking.assignedWorker),
      });
    } catch (error) {
      next(error);
    }
  },
  create: async (req, res, next) => {
    try {
      const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
      const booking = await load(kind, req, res);
      if (!booking) return;
      if (kind !== "admin" && CLOSED.includes(booking.status)) {
        return res.status(409).json({ success: false, message: "This booking is closed. Please contact us." });
      }
      const message = await postMessage(booking, req.user, body);
      return res.status(201).json({ success: true, message });
    } catch (error) {
      next(error);
    }
  },
});
