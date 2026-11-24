// Cleaner view of the reliability rules and their own strikes (package E)
import { reliabilityView } from "../services/reliability.service.js";

// GET /api/v1/worker/reliability
export const getMyReliability = (req, res) => res.json({ success: true, reliability: reliabilityView(req.user) });
