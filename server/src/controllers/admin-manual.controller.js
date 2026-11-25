// Phone orders: the office creates customers and bookings on their behalf.
//   POST /admin/customers  → consumer account + "welcome, set your password" mail
//   POST /admin/bookings   → booking through the real quote/reservation path
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";

import Booking from "../models/booking.model.js";
import User from "../models/user.model.js";
import { OPERATIONS, PRICING, SUPPORTED_LOCALES } from "../config/pricing.js";
import { findExtra, findService } from "../data/catalogue.js";
import { recordAudit } from "../services/audit.service.js";
import { reserveAndCreate } from "../services/availability.service.js";
import { reserveBookingDiscounts, rollbackBookingDiscounts } from "../services/booking-discounts.service.js";
import { confirmBooking } from "../services/booking-lifecycle.service.js";
import { sendPasswordResetEmail, trySend } from "../services/email.service.js";
import { sendPaymentLinkEmail } from "../services/invoice-email.service.js";
import { assertMethodEnabled, createCheckoutForBooking, isOnlinePaymentAvailable } from "../services/payment.service.js";
import { buildQuote, pricingSnapshot, publicQuote } from "../services/quote.service.js";
import { generateBookingReference } from "../utils/booking-reference.js";
import { getSiteUrl } from "../utils/site-url.js";
import { DAY_MS, httpError, parseCalendarDate, todayInBerlin } from "../utils/helpers.js";
import { withLocks } from "../utils/lock.js";

const hashToken = (value) => createHash("sha256").update(value).digest("hex");
const HOUSEHOLD_SERVICE_IDS = ["home-cleaning", "deep-cleaning", "end-of-tenancy"];
const LINK_HOLD_HOURS = 24;

const WELCOME = {
  de: {
    subject: "Willkommen bei Fiduxa – bitte Passwort festlegen",
    intro: "unser Team hat ein Fiduxa-Konto für Sie angelegt. Bitte legen Sie über den folgenden Link Ihr Passwort fest, um Buchungen, Rechnungen und Termine online zu verwalten. Der Link ist 48 Stunden gültig.",
  },
  en: {
    subject: "Welcome to Fiduxa – please set your password",
    intro: "our team has created a Fiduxa account for you. Please set your password via the link below to manage bookings, invoices and appointments online. The link is valid for 48 hours.",
  },
  pl: {
    subject: "Witamy w Fiduxa – ustaw hasło",
    intro: "nasz zespół utworzył dla Ciebie konto Fiduxa. Ustaw hasło przez poniższy link, aby zarządzać rezerwacjami, fakturami i terminami online. Link jest ważny 48 godzin.",
  },
};

const customerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).optional().default(""),
  locale: z.enum(SUPPORTED_LOCALES).optional().default("de"),
});

// POST /api/v1/admin/customers
export const createCustomerByAdmin = async (req, res, next) => {
  try {
    const data = customerSchema.parse(req.body);
    const email = data.email.toLowerCase();
    if (await User.exists({ email })) {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }
    const token = randomBytes(32).toString("hex");
    const user = await User.create({
      name: data.name,
      email,
      phone: data.phone,
      role: "consumer",
      preferredLanguage: data.locale,
      password: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
      passwordResetTokenHash: hashToken(token),
      passwordResetExpires: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    const baseUrl = process.env.PASSWORD_RESET_URL || `${getSiteUrl()}/passwort-zuruecksetzen`;
    const w = WELCOME[data.locale] ?? WELCOME.de;
    const emailStatus = await trySend("Set password", () =>
      sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl: `${baseUrl}?token=${token}`, locale: data.locale, intro: w.intro, subject: w.subject })
    );

    await recordAudit({ actor: req.user._id, action: "customer.created.manual", entityType: "User", entityId: user._id, after: { name: user.name, email: user.email } });

    return res.status(201).json({
      success: true,
      message: "Customer created. A link to set the password has been sent.",
      emailStatus,
      customer: { id: user._id, name: user.name, email: user.email, phone: user.phone, preferredLanguage: user.preferredLanguage, createdAt: user.createdAt },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/customer-search?q=  (name / email / phone – for the booking form)
export const searchCustomers = async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim().slice(0, 100);
    if (q.length < 2) return res.json({ success: true, customers: [] });
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const customers = await User.find({ role: "consumer", anonymisedAt: null, $or: [{ name: re }, { email: re }, { phone: re }] })
      .select("name email phone preferredLanguage household isActive")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    return res.json({ success: true, customers: customers.map((c) => ({ id: c._id, ...c, _id: undefined })) });
  } catch (error) {
    next(error);
  }
};

const manualBookingSchema = z.object({
  customerId: z.string().refine((id) => mongoose.isValidObjectId(id), "Please choose a customer."),
  serviceId: z.enum(HOUSEHOLD_SERVICE_IDS),
  areaM2: z.coerce.number().min(15).max(1000),
  bathrooms: z.coerce.number().int().min(1).max(6).default(1),
  condition: z.enum(["basic", "normal", "moderate", "heavy"]).default("normal"),
  frequency: z.enum(["one-time", "weekly", "biweekly", "monthly"]).default("one-time"),
  extras: z.array(z.string()).max(20).default([]).refine((ids) => ids.every((id) => findExtra(id) && findExtra(id).active !== false), "One or more selected extras are not available."),
  durationMinutes: z.coerce.number().int().optional(),
  preferredDate: z.string().trim(),
  slotId: z.string().refine((id) => mongoose.isValidObjectId(id), "Please choose a time slot."),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  notes: z.string().trim().max(1000).optional().default(""),
  pets: z.boolean().optional().default(false),
  promoCode: z.string().trim().max(40).optional(),
  paymentMethod: z.enum(["cash", "invoice", "link"]),
  customerDetails: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(5).max(30),
    postcode: z.string().trim().regex(OPERATIONS.servicePostcodeRegex, "This postcode is outside our current service area."),
    address: z.string().trim().min(5).max(250),
    accessNotes: z.string().trim().max(1000).optional().default(""),
  }),
});

const bookingResponse = (booking) => ({
  id: booking._id,
  reference: booking.reference,
  status: booking.status,
  preferredDate: booking.preferredDate,
  slot: booking.slot,
  slotEnd: booking.slotEnd,
  holdExpiresAt: booking.holdExpiresAt,
  pricing: booking.pricing,
  estimate: booking.estimate,
  payment: booking.payment,
});

// POST /api/v1/admin/bookings
export const createManualBooking = async (req, res, next) => {
  try {
    const data = manualBookingSchema.parse(req.body);
    const service = findService(data.serviceId);
    if (!service.frequencies.includes(data.frequency)) {
      throw httpError(422, `${service.nameEn} can only be booked as: ${service.frequencies.join(", ")}.`);
    }
    if (data.durationMinutes != null) {
      if (data.durationMinutes < PRICING.minimumMinutes || data.durationMinutes > PRICING.maximumMinutes || data.durationMinutes % PRICING.roundingMinutes !== 0) {
        throw httpError(422, `Duration must be between ${PRICING.minimumMinutes} and ${PRICING.maximumMinutes} minutes in ${PRICING.roundingMinutes}-minute steps.`);
      }
    }
    // Payment-method policy (POLICIES.paymentMethods – currently PayPal only);
    // "link" = online pay link (only the enabled online methods), "invoice" = office arrangement
    if (data.paymentMethod === "cash") assertMethodEnabled("cash");
    if (data.paymentMethod === "link" && !isOnlinePaymentAvailable()) {
      return res.status(422).json({ success: false, message: "Online payment is not configured yet. Please choose cash or invoice." });
    }

    // The office may book from today onwards (phone orders), up to the normal horizon
    const preferredDate = parseCalendarDate(data.preferredDate);
    const today = todayInBerlin();
    if (!preferredDate) throw httpError(400, "Please provide a valid date (YYYY-MM-DD).");
    if (preferredDate < today || preferredDate > new Date(today.getTime() + OPERATIONS.maxBookingDaysAhead * DAY_MS)) {
      throw httpError(400, "The date is outside the bookable period.");
    }

    const customer = await User.findOne({ _id: data.customerId, role: "consumer" });
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });
    if (customer.anonymisedAt || !customer.isActive) {
      return res.status(409).json({ success: false, message: "This customer account is not active." });
    }

    const details = {
      name: data.customerDetails.name ?? customer.name,
      email: (data.customerDetails.email ?? customer.email).toLowerCase(),
      phone: data.customerDetails.phone,
      postcode: data.customerDetails.postcode,
      address: data.customerDetails.address,
      accessNotes: data.customerDetails.accessNotes,
    };
    const contact = { email: details.email, phone: details.phone, address: details.address, postcode: details.postcode };
    const quoteInput = {
      input: {
        serviceId: data.serviceId,
        areaM2: data.areaM2,
        bathrooms: data.bathrooms,
        condition: data.condition,
        frequency: data.frequency,
        extras: data.extras,
        durationMinutes: data.durationMinutes,
      },
      user: customer,
      promoCode: data.promoCode,
      giftCardCodes: [],
      contact,
    };
    const bookingId = new mongoose.Types.ObjectId();
    const method = data.paymentMethod;
    const onlinePayment = method === "link";

    const outcome = await withLocks([`customer:${customer._id}`], async () => {
      const quote = await buildQuote(quoteInput);
      if (data.promoCode && quote.codeResult && !quote.codeResult.ok) return { invalidCode: quote.codeResult, quote };
      const reserved = await reserveBookingDiscounts({ quote, user: customer, bookingId, contact, serviceId: data.serviceId });
      const reference = await generateBookingReference();
      const estimate = quote.estimate;
      const payable = quote.lines.payableCents;

      const booking = await reserveAndCreate(
        {
          slotId: data.slotId,
          date: preferredDate,
          startTime: data.startTime,
          durationMinutes: estimate.durationMinutes,
          job: { serviceId: data.serviceId, extras: estimate.extras.map((e) => e.id), postcode: details.postcode, pets: data.pets, customer: customer._id },
        },
        async (slot, { startTime, endTime }) => {
          const doc = new Booking({
            _id: bookingId,
            reference,
            customer: customer._id,
            serviceId: data.serviceId,
            areaM2: data.areaM2,
            bathrooms: data.bathrooms,
            condition: data.condition,
            frequency: data.frequency,
            extras: estimate.extras.map((e) => e.id),
            customerDetails: details,
            preferredDate,
            slot: startTime,
            slotEnd: endTime,
            availabilitySlot: slot._id,
            notes: data.notes,
            pets: data.pets,
            estimate,
            pricing: pricingSnapshot(quote, reserved),
            locale: customer.preferredLanguage ?? "de",
            consents: { earlyStartRequestedAt: new Date() },
            payment: { status: "unpaid", method: onlinePayment ? "stripe" : method, amountCents: payable, currency: "EUR" },
            holdExpiresAt: onlinePayment ? new Date(Date.now() + LINK_HOLD_HOURS * 60 * 60 * 1000) : null,
          });
          doc.setStatus("payment_pending", req.user._id, `Created by the office (${method})`);
          await doc.save();
          return doc;
        }
      );
      if (!booking) {
        await rollbackBookingDiscounts({ bookingId, quote, reserved, actor: req.user._id });
        return { slotTaken: true };
      }
      return { booking, quote };
    });

    if (outcome.invalidCode) {
      return res.status(422).json({ success: false, code: "PROMO_INVALID", reason: outcome.invalidCode.reason, message: "This promotional code cannot be used.", quote: publicQuote(outcome.quote) });
    }
    if (outcome.slotTaken) {
      return res.status(409).json({ success: false, message: "This time slot is no longer available. Please choose another slot." });
    }
    const { booking } = outcome;

    let payUrl = null;
    if (onlinePayment) {
      // Warm up the checkout (best effort) – the mail links to the payment page
      try {
        ({ url: payUrl } = await createCheckoutForBooking(booking, customer._id, {}));
      } catch (error) {
        console.error(`Checkout creation failed for ${booking.reference}:`, error.message);
      }
      booking.holdExpiresAt = new Date(Date.now() + LINK_HOLD_HOURS * 60 * 60 * 1000);
      await booking.save();
      await trySend("Payment link", () => sendPaymentLinkEmail({ booking }));
    } else {
      await confirmBooking(booking, {
        actorId: req.user._id,
        note: method === "cash" ? "Confirmed by the office – cash after the cleaning" : "Confirmed by the office – payment by invoice",
        paid: false,
      });
    }

    await recordAudit({
      actor: req.user._id,
      action: "booking.created.manual",
      entityType: "Booking",
      entityId: booking._id,
      after: { reference: booking.reference, customer: customer._id, paymentMethod: method, totalCents: booking.pricing?.totalCents },
    });

    return res.status(201).json({
      success: true,
      message: onlinePayment ? "Booking reserved. The customer received the payment link." : "Booking created and confirmed.",
      booking: bookingResponse(booking),
      payUrl: payUrl ?? (onlinePayment ? `${getSiteUrl()}/zahlung/${booking._id}` : null),
    });
  } catch (error) {
    next(error);
  }
};
