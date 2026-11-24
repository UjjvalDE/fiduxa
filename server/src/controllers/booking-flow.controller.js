import { z } from "zod";
import mongoose from "mongoose";

import Booking from "../models/booking.model.js";
import { createEstimate } from "../services/estimate.service.js";
import {
  assertBookableDate,
  bookableRange,
  getAvailableDays,
  getSlotsForDate,
  reserveAndCreate,
} from "../services/availability.service.js";
import {
  createCheckoutForBooking,
  isOnlinePaymentAvailable,
  pickMethod,
  assertMethodEnabled,
} from "../services/payment.service.js";
import { confirmBooking } from "../services/booking-lifecycle.service.js";
import { findExtra, findService } from "../data/catalogue.js";
import { ACTIVE_BOOKING_STATUSES, OPERATIONS, PRICING, SUPPORTED_LOCALES } from "../config/pricing.js";
import { generateBookingReference } from "../utils/booking-reference.js";
import { parseCalendarDate, todayInBerlin } from "../utils/helpers.js";
import { unreadCounts } from "../services/booking-message.service.js";
import { buildQuote, pricingSnapshot, publicQuote } from "../services/quote.service.js";
import { reserveBookingDiscounts, rollbackBookingDiscounts } from "../services/booking-discounts.service.js";
import { withLocks } from "../utils/lock.js";
import { POLICIES } from "../config/pricing.js";

const HOUSEHOLD_SERVICE_IDS = ["home-cleaning", "deep-cleaning", "end-of-tenancy"];

const propertySchema = {
  serviceId: z.enum(HOUSEHOLD_SERVICE_IDS, {
    message:
      "Unknown service. Business cleaning uses /api/v1/business-requests.",
  }),
  areaM2: z.coerce.number().min(15).max(1000),
  bathrooms: z.coerce.number().int().min(1).max(6).default(1),
  condition: z.enum(["basic", "normal", "moderate", "heavy"]).default("normal"),
  frequency: z
    .enum(["one-time", "weekly", "biweekly", "monthly"])
    .default("one-time"),
  // Hours chosen by the customer (optional, minutes, 30-minute steps)
  // Limits come from the admin settings → checked at request time
  durationMinutes: z.coerce
    .number()
    .int()
    .superRefine((m, ctx) => {
      if (m < PRICING.minimumMinutes || m > PRICING.maximumMinutes) {
        ctx.addIssue({ code: "custom", message: `Duration must be between ${PRICING.minimumMinutes} and ${PRICING.maximumMinutes} minutes.` });
      } else if (m % PRICING.roundingMinutes !== 0) {
        ctx.addIssue({ code: "custom", message: `Duration must be in ${PRICING.roundingMinutes}-minute steps.` });
      }
    })
    .optional(),
  extras: z
    .array(z.string())
    .max(20)
    .default([])
    .refine((ids) => ids.every((id) => findExtra(id) && findExtra(id).active !== false), {
      message: "One or more selected extras are not available.",
    }),
};

const estimateSchema = z.object(propertySchema);

const discountInputs = {
  promoCode: z.string().trim().max(40).optional(),
  giftCardCodes: z.array(z.string().trim().max(40)).max(5).optional().default([]),
};

const quoteSchema = z.object({
  ...propertySchema,
  ...discountInputs,
  contact: z
    .object({
      email: z.string().trim().max(254).optional(),
      phone: z.string().trim().max(30).optional(),
      address: z.string().trim().max(250).optional(),
      postcode: z.string().trim().max(10).optional(),
    })
    .optional(),
});

const bookingSchema = z.object({
  ...propertySchema,

  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  phone: z.string().trim().min(5).max(30),
  postcode: z
    .string()
    .trim()
    .regex(
      OPERATIONS.servicePostcodeRegex,
      "This postcode is outside our current service area."
    ),
  address: z.string().trim().min(5).max(250),
  accessNotes: z.string().trim().max(1000).optional().default(""),

  preferredDate: z.string().trim(),
  // Availability window + chosen start time (from GET /bookings/availability)
  slotId: z.string().refine((id) => mongoose.isValidObjectId(id), "Please choose a time slot."),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  notes: z.string().trim().max(1000).optional().default(""),
  locale: z.enum(SUPPORTED_LOCALES).optional().default("de"),
  pets: z.boolean().optional().default(false),
  paymentMethod: z.enum(["stripe", "paypal", "cash"]).optional(),
  ...discountInputs,
  // Amount the customer saw – booking is refused (409) if the price changed meanwhile
  expectedPayableCents: z.number().int().min(0).optional(),
  // § 356 Abs. 4 BGB – express request to start before the withdrawal period ends
  earlyStartConsent: z.literal(true, {
    message: "Please confirm that the service may start before the withdrawal period ends.",
  }),
});

// Frequency must be allowed for the selected service
const assertFrequencyAllowed = (serviceId, frequency) => {
  const service = findService(serviceId);
  if (!service.frequencies.includes(frequency)) {
    throw Object.assign(
      new Error(`${service.nameEn} can only be booked as: ${service.frequencies.join(", ")}.`),
      { statusCode: 422 }
    );
  }
};

// POST /api/v1/bookings/estimate (public)
export const getEstimate = (req, res, next) => {
  try {
    const data = estimateSchema.parse(req.body);
    assertFrequencyAllowed(data.serviceId, data.frequency);

    return res.json({
      success: true,
      data: createEstimate(data),
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/bookings/availability?date=YYYY-MM-DD&duration=MINUTES (public)
// Start times that fit a job of that total duration on that day.
export const getAvailableSlots = async (req, res, next) => {
  try {
    const date = assertBookableDate(req.query.date);
    const slots = await getSlotsForDate(date, Number(req.query.duration) || undefined);

    return res.json({ success: true, data: slots });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/bookings/availability/days?from=&to= (public)
// Days that still have free slots – for highlighting the calendar.
export const getAvailableDaysHandler = async (req, res, next) => {
  try {
    const range = bookableRange();
    const from = parseCalendarDate(req.query.from) ?? range.from;
    const to = parseCalendarDate(req.query.to) ?? range.to;

    const days = await getAvailableDays(
      from < range.from ? range.from : from,
      to > range.to ? range.to : to,
      Number(req.query.duration) || undefined
    );

    return res.json({ success: true, data: days });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/bookings (customer)
// Instant booking: reserve the slot, then pay via Stripe Checkout.
// Without Stripe configured the booking is confirmed directly (invoice).
export const createBookingRequest = async (req, res, next) => {
  try {
    const data = bookingSchema.parse(req.body);
    assertFrequencyAllowed(data.serviceId, data.frequency);

    const preferredDate = assertBookableDate(data.preferredDate);

    const wantsCash = data.paymentMethod === "cash";
    // Payment-method policy (POLICIES.paymentMethods – currently PayPal only)
    assertMethodEnabled(data.paymentMethod);

    const contact = { email: data.email, phone: data.phone, address: data.address, postcode: data.postcode };
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
      user: req.user,
      promoCode: data.promoCode,
      giftCardCodes: data.giftCardCodes,
      contact,
    };

    const bookingId = new mongoose.Types.ObjectId();
    const giftCodes = (data.giftCardCodes ?? []).map((c) => `gift:${String(c).toUpperCase().replace(/[^A-Z0-9]/g, "")}`);

    // Customer + gift card locks: the same offer / balance cannot be used twice in parallel
    const outcome = await withLocks([`customer:${req.user._id}`, ...giftCodes], async () => {
      // Price is always recalculated on the server – never trust the client.
      const quote = await buildQuote(quoteInput);

      // The customer must have seen exactly this price
      if (data.expectedPayableCents != null && data.expectedPayableCents !== quote.lines.payableCents) {
        return { priceChanged: true, quote };
      }
      if (data.promoCode && quote.codeResult && !quote.codeResult.ok) {
        return { invalidCode: quote.codeResult, quote };
      }
      const badCard = quote.giftCards.find((g) => !g.ok);
      if (badCard) return { invalidGiftCard: badCard, quote };

      const payable = quote.lines.payableCents;
      // Cash only up to the policy limit (policies.cash.maxTotalCents)
      if (wantsCash && quote.lines.totalCents > POLICIES.cash.maxTotalCents) return { cashLimit: true, quote };
      const fullyCovered = payable === 0;
      const paymentMethod = fullyCovered || wantsCash ? null : pickMethod(data.paymentMethod);
      const onlinePayment = !fullyCovered && !wantsCash && isOnlinePaymentAvailable() && Boolean(paymentMethod);
      const method = fullyCovered ? "gift_card" : wantsCash ? "cash" : paymentMethod ?? "invoice";

      const reserved = await reserveBookingDiscounts({
        quote,
        user: req.user,
        bookingId,
        contact,
        serviceId: data.serviceId,
      });

      const reference = await generateBookingReference();
      const estimate = quote.estimate;

      // Take the start time inside the admin's availability window (locked → no overbooking)
      const booking = await reserveAndCreate(
        { slotId: data.slotId, date: preferredDate, startTime: data.startTime, durationMinutes: estimate.durationMinutes },
        async (slot, { startTime, endTime }) => {
          const doc = new Booking({
            _id: bookingId,
            reference,
            customer: req.user._id,

            serviceId: data.serviceId,
            areaM2: data.areaM2,
            bathrooms: data.bathrooms,
            condition: data.condition,
            frequency: data.frequency,
            extras: estimate.extras.map((extra) => extra.id),

            customerDetails: {
              name: data.name,
              email: data.email.toLowerCase(),
              phone: data.phone,
              postcode: data.postcode,
              address: data.address,
              accessNotes: data.accessNotes,
            },

            preferredDate,
            slot: startTime,
            slotEnd: endTime,
            availabilitySlot: slot._id,
            notes: data.notes,
            pets: data.pets,
            estimate,
            pricing: pricingSnapshot(quote, reserved),
            locale: data.locale,
            consents: { earlyStartRequestedAt: new Date() },
            payment: {
              status: fullyCovered ? "paid" : "unpaid",
              method,
              amountCents: payable,
              currency: "EUR",
              ...(fullyCovered && { paidAt: new Date() }),
            },
            holdExpiresAt: onlinePayment ? new Date(Date.now() + OPERATIONS.holdMinutes * 60 * 1000) : null,
          });
          doc.setStatus("payment_pending", req.user._id, "Booked online");
          await doc.save();
          return doc;
        }
      );

      if (!booking) {
        await rollbackBookingDiscounts({ bookingId, quote, reserved, actor: req.user._id });
        return { slotTaken: true };
      }
      return { booking, method, onlinePayment, fullyCovered, quote };
    });

    if (outcome.priceChanged) {
      return res.status(409).json({
        success: false,
        code: "PRICE_CHANGED",
        message: "The price has changed. Please check the new price.",
        quote: publicQuote(outcome.quote),
      });
    }
    if (outcome.invalidCode) {
      return res.status(422).json({
        success: false,
        code: "PROMO_INVALID",
        reason: outcome.invalidCode.reason,
        message: "This promotional code cannot be used.",
        quote: publicQuote(outcome.quote),
      });
    }
    if (outcome.invalidGiftCard) {
      return res.status(422).json({
        success: false,
        code: "GIFT_CARD_INVALID",
        reason: outcome.invalidGiftCard.reason,
        message: "This gift card cannot be used.",
        quote: publicQuote(outcome.quote),
      });
    }
    if (outcome.slotTaken) {
      return res.status(409).json({
        success: false,
        message: "This time slot is no longer available. Please choose another slot.",
      });
    }
    if (outcome.cashLimit) {
      return res.status(422).json({
        success: false,
        code: "CASH_LIMIT",
        maxTotalCents: POLICIES.cash.maxTotalCents,
        message: `Cash payment is only possible up to ${(POLICIES.cash.maxTotalCents / 100).toFixed(2)} €.`,
        quote: publicQuote(outcome.quote),
      });
    }

    const { booking, method, onlinePayment } = outcome;

    // Fully paid by gift card, cash after the job, or invoice: confirm right away
    if (!onlinePayment) {
      const notes = {
        gift_card: "Confirmed – paid with gift card",
        cash: "Confirmed – cash payment after the cleaning",
        invoice: "Confirmed – payment by invoice",
      };
      await confirmBooking(booking, {
        actorId: req.user._id,
        note: notes[method] ?? notes.invoice,
        paid: method === "gift_card",
      });

      return res.status(201).json({
        success: true,
        message: "Your booking is confirmed.",
        checkoutUrl: null,
        booking: bookingResponse(booking),
      });
    }

    // Online payment: create the Stripe Checkout / PayPal order right away
    let checkoutUrl = null;
    try {
      ({ url: checkoutUrl } = await createCheckoutForBooking(booking, req.user._id, { method }));
      await booking.save();
    } catch (error) {
      // Booking + hold stay valid; the customer can retry on /zahlung/:id
      console.error(`Checkout creation failed for ${booking.reference}:`, error.message);
    }

    return res.status(201).json({
      success: true,
      message: "Your slot is reserved. Please complete the payment.",
      checkoutUrl,
      booking: bookingResponse(booking),
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/bookings/quote (public, personalised when logged in)
// Full price breakdown incl. welcome offer, campaign/code and gift cards.
export const getQuote = async (req, res, next) => {
  try {
    const data = quoteSchema.parse(req.body);
    assertFrequencyAllowed(data.serviceId, data.frequency);
    const quote = await buildQuote({
      input: {
        serviceId: data.serviceId,
        areaM2: data.areaM2,
        bathrooms: data.bathrooms,
        condition: data.condition,
        frequency: data.frequency,
        extras: data.extras,
        durationMinutes: data.durationMinutes,
      },
      user: req.user?.role === "consumer" ? req.user : null,
      promoCode: data.promoCode,
      giftCardCodes: data.giftCardCodes,
      contact: data.contact,
    });
    return res.json({ success: true, quote: publicQuote(quote) });
  } catch (error) {
    next(error);
  }
};

const bookingResponse = (booking) => ({
  id: booking._id,
  reference: booking.reference,
  status: booking.status,
  estimate: booking.estimate,
  pricing: booking.pricing,
  preferredDate: booking.preferredDate,
  slot: booking.slot,
  slotEnd: booking.slotEnd,
  holdExpiresAt: booking.holdExpiresAt,
  payment: booking.payment,
});

// GET /api/v1/bookings/my-bookings (customer)
export const getMyBookings = async (req, res, next) => {
  try {
    const filter = { customer: req.user._id };

    // Upcoming = active AND (today or later, or the cleaning is running right now).
    // A past-dated booking the cleaner has not confirmed yet is "past" with the
    // label "awaiting cleaner confirmation" (awaitingConfirmation: true).
    const today = todayInBerlin();
    if (req.query.scope === "upcoming") {
      filter.status = { $in: ACTIVE_BOOKING_STATUSES };
      // (in_progress counts as upcoming only on the job day – a running job never ends up in "past")
      filter.$or = [{ preferredDate: { $gte: today } }, { preferredDate: null }];
    } else if (req.query.scope === "past") {
      filter.$or = [
        { status: { $in: ["completed", "cancelled", "expired", "rejected"] } },
        { status: { $in: ACTIVE_BOOKING_STATUSES }, preferredDate: { $lt: today } },
      ];
    }

    const bookings = await Booking.find(filter)
      .select("-adminNotes -statusHistory.changedBy -quotation.sentBy -assignedBy -quotationHistory -jobOffer -job.issueReported")
      .populate("assignedWorker", "name avatarUpdatedAt")
      .sort({ preferredDate: -1, createdAt: -1 });

    const unread = await unreadCounts(bookings.map((b) => b._id), req.user._id);

    const list = bookings.map((b) => {
      const json = b.toJSON();
      json.awaitingConfirmation =
        ["confirmed", "in_progress"].includes(b.status) && Boolean(b.preferredDate) && b.preferredDate.getTime() < today.getTime();
      return json;
    });

    return res.status(200).json({
      success: true,
      count: list.length,
      bookings: list,
      unread,
    });
  } catch (error) {
    next(error);
  }
};
