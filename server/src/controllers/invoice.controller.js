// Invoice downloads (customer + admin), the customer's invoice list and the
// yearly § 35a EStG statement.
import mongoose from "mongoose";

import Booking from "../models/booking.model.js";
import {
  listInvoicesForCustomer,
  loadInvoicePdf,
  parseStatementYear,
  renderTaxStatementPdf,
} from "../services/invoice.service.js";

const sendPdf = (res, filename, pdf) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Length", String(pdf.length));
  return res.end(pdf);
};

const notFound = (res) => res.status(404).json({ success: false, message: "Invoice not found." });

// GET /api/v1/customer/bookings/:id/invoice  (owner only)
export const downloadMyInvoice = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
    const owned = await Booking.exists({ _id: req.params.id, customer: req.user._id, "invoice.number": { $exists: true } });
    if (!owned) return notFound(res);
    const file = await loadInvoicePdf(req.params.id);
    if (!file) return notFound(res);
    return sendPdf(res, `${file.number}.pdf`, file.pdf);
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/bookings/:id/invoice
export const downloadInvoiceAsAdmin = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
    const file = await loadInvoicePdf(req.params.id);
    if (!file) return notFound(res);
    return sendPdf(res, `${file.number}.pdf`, file.pdf);
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/customer/invoices[?year=YYYY]
export const listMyInvoices = async (req, res, next) => {
  try {
    const year = req.query.year ? parseStatementYear(req.query.year) : undefined;
    const invoices = await listInvoicesForCustomer(req.user._id, { year });
    const years = [...new Set(invoices.map((i) => new Date(i.issuedAt).getUTCFullYear()))].sort((a, b) => b - a);
    return res.json({ success: true, invoices, years });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/customer/tax-statement?year=YYYY  → PDF (§ 35a EStG, non-cash invoices only)
export const downloadMyTaxStatement = async (req, res, next) => {
  try {
    const year = parseStatementYear(req.query.year);
    const invoices = await listInvoicesForCustomer(req.user._id, { year });
    const { pdf } = await renderTaxStatementPdf({
      user: req.user,
      year,
      invoices,
      locale: req.user.preferredLanguage,
    });
    return sendPdf(res, `Fiduxa-35a-EStG-${year}.pdf`, pdf);
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/customer/tax-statement/summary?year=YYYY  (numbers for the account page)
export const myTaxStatementSummary = async (req, res, next) => {
  try {
    const year = parseStatementYear(req.query.year);
    const invoices = await listInvoicesForCustomer(req.user._id, { year });
    const eligible = invoices.filter((i) => i.taxDeductible && i.paymentStatus === "paid");
    return res.json({
      success: true,
      year,
      summary: {
        count: eligible.length,
        labourCents: eligible.reduce((s, i) => s + (i.totalCents ?? 0), 0),
        vatCents: eligible.reduce((s, i) => s + (i.vatCents ?? 0), 0),
        excludedCash: invoices.filter((i) => !i.taxDeductible).length,
      },
    });
  } catch (error) {
    next(error);
  }
};
