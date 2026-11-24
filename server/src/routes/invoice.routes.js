import { Router } from "express";

import { protect } from "../middleware/auth.middleware.js";
import {
  downloadMyInvoice,
  downloadMyTaxStatement,
  listMyInvoices,
  myTaxStatementSummary,
} from "../controllers/invoice.controller.js";

// Mounted at /api/v1/customer – invoices and the § 35a EStG statement
export const customerInvoiceRouter = Router();

customerInvoiceRouter.use(protect);

customerInvoiceRouter.get("/bookings/:id/invoice", downloadMyInvoice);
customerInvoiceRouter.get("/invoices", listMyInvoices);
customerInvoiceRouter.get("/tax-statement/summary", myTaxStatementSummary);
customerInvoiceRouter.get("/tax-statement", downloadMyTaxStatement);
