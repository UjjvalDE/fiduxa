import { Router } from "express";

import {
  checkServiceArea,
  getExtras,
  getPublicPricing,
  getService,
  getServices,
} from "../controllers/catalogue.controller.js";
import { createBusinessRequest } from "../controllers/business-request.controller.js";
import { createContactMessage } from "../controllers/contact.controller.js";
import { getCleaner, getCleanerAvatar, listCleaners } from "../controllers/cleaner-public.controller.js";
import { getActivePromotions } from "../controllers/promotion-public.controller.js";

// Public catalogue (no authentication)
export const catalogueRouter = Router();

catalogueRouter.get("/services", getServices);
catalogueRouter.get("/services/:serviceId", getService);
catalogueRouter.get("/extras", getExtras);
catalogueRouter.get("/pricing", getPublicPricing);
catalogueRouter.post("/service-area/check", checkServiceArea);
catalogueRouter.get("/promotions/active", getActivePromotions);
catalogueRouter.get("/cleaners", listCleaners);
catalogueRouter.get("/cleaners/:id", getCleaner);
catalogueRouter.get("/cleaners/:id/avatar", getCleanerAvatar);

// Public forms (stricter rate limit applied in app.js)
export const publicFormRouter = Router();

publicFormRouter.post("/business-requests", createBusinessRequest);
publicFormRouter.post("/contact", createContactMessage);
