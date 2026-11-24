import Booking from "../models/booking.model.js";
import { COMMISSION_TIER_ORDER, WORKER_PAY } from "../config/pricing.js";
import { workerPerformance } from "../services/commission.service.js";

// GET /api/v1/worker/performance – tier, trust score, progress, earnings totals
export const getWorkerPerformance = async (req, res, next) => {
  try {
    const perf = await workerPerformance(req.user._id);
    if (!perf) return res.status(404).json({ success: false, message: "Cleaner not found." });
    const money = await Booking.aggregate([
      { $match: { assignedWorker: req.user._id, "workerPayout.status": { $exists: true } } },
      {
        $group: {
          _id: null,
          grossCents: { $sum: { $ifNull: ["$workerPayout.grossCents", 0] } },
          earningsCents: { $sum: { $ifNull: ["$workerPayout.amountCents", 0] } },
          commissionCents: { $sum: { $ifNull: ["$workerPayout.commissionCents", 0] } },
        },
      },
    ]);
    const m = money[0];
    return res.json({
      success: true,
      ...perf,
      payModel: WORKER_PAY.payModel,
      tierOrder: COMMISSION_TIER_ORDER,
      tiers: WORKER_PAY.commissionTiers,
      totals: {
        grossCents: m?.grossCents ?? 0,
        earningsCents: m?.earningsCents ?? 0,
        commissionCents: m?.commissionCents ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
};
