import { Router } from "express";

import { protect, requireCompleteProfile } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import {
  captureGiftCardPayPal,
  checkGiftCard,
  getGiftCardConfig,
  getMyGiftCard,
  listMyGiftCards,
  purchaseGiftCard,
  retryGiftCardPayment,
} from "../controllers/gift-card.controller.js";

// Mounted at /api/v1/gift-cards
export const giftCardRouter = Router();

giftCardRouter.get("/config", getGiftCardConfig);
giftCardRouter.post("/check", checkGiftCard); // rate limited in app.js

const customer = [protect, authorize("consumer")];
giftCardRouter.get("/mine", customer, listMyGiftCards);
giftCardRouter.post("/", customer, requireCompleteProfile, purchaseGiftCard);
giftCardRouter.get("/:id", customer, getMyGiftCard);
giftCardRouter.post("/:id/pay", customer, requireCompleteProfile, retryGiftCardPayment);
giftCardRouter.post("/:id/paypal/capture", customer, requireCompleteProfile, captureGiftCardPayPal);
