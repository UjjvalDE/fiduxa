import { activePromotionsForDisplay } from "../services/promotion.service.js";

// GET /api/v1/promotions/active – live campaigns for homepage / checkout banners
export const getActivePromotions = async (req, res, next) => {
  try {
    const promotions = await activePromotionsForDisplay();
    res.set("Cache-Control", "public, max-age=60");
    return res.json({ success: true, promotions });
  } catch (error) {
    next(error);
  }
};
