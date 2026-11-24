// Recurring cleaning plans ("Putzplan"): a confirmed weekly / biweekly /
// monthly booking becomes a series; occurrences are created RECURRING.generateDaysAhead
// days ahead through the real pricing + slot reservation, paid per occurrence.
//
//   confirmBooking()  → ensureSeriesForBooking()   (once per first booking)
//   hourly job        → generateDueOccurrences()   (idempotent per series + date)
//   customer / admin  → pauseSeries / resumeSeries / endSeries / skipOccurrence
import mongoose from "mongoose";

import Booking from "../models/booking.model.js";
import BookingSeries from "../models/booking-series.model.js";
import AvailabilitySlot from "../models/availability-slot.model.js";
import { OPERATIONS, PRICING, RECURRING } from "../config/pricing.js";
import { createEstimate } from "./estimate.service.js";
import { pricingSnapshot, vatContained } from "./quote.service.js";
import { getSlotsForDate, reserveAndCreate } from "./availability.service.js";
import { cancelBooking, confirmBooking } from "./booking-lifecycle.service.js";
import { createCheckoutForBooking, isOnlinePaymentAvailable, pickMethod } from "./payment.service.js";
import { offerJob } from "./job-dispatch.service.js";
import { sendAdminNotificationEmail, sendSeriesPaymentEmail, trySend } from "./email.service.js";
import { generateBookingReference } from "../utils/booking-reference.js";
import { DAY_MS, formatGermanDate, httpError, parseCalendarDate, slotStartInstant, slotStartTime, todayInBerlin } from "../utils/helpers.js";
import { withLock } from "../utils/lock.js";

export const INTERVAL_DAYS = { weekly: 7, biweekly: 14, monthly: 28 };

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

/** First date in the series rhythm strictly after `after` (default: today) */
export const nextDateAfter = (series, after = todayInBerlin()) => {
  const step = INTERVAL_DAYS[series.template.frequency] ?? 7;
  let next = new Date(series.nextDate);
  while (next.getTime() <= after.getTime()) next = addDays(next, step);
  return next;
};

const paymentMethodOf = (booking) => {
  const m = booking.payment?.method;
  if (m === "cash") return "cash";
  if (m === "stripe" || m === "paypal") return "online";
  // invoice, gift_card (one-off cover) and legacy records → invoice (confirmed, billed)
  return "invoice";
};

/**
 * Create the plan for a confirmed recurring booking – exactly once per
 * booking, whichever confirmation path ran (cash, invoice, payment webhook,
 * admin). Occurrences themselves never start a new plan.
 */
export const ensureSeriesForBooking = async (booking) => {
  if (!booking || booking.frequency === "one-time" || !INTERVAL_DAYS[booking.frequency]) return null;
  if (booking.series) return null; // an occurrence of an existing plan
  const existing = await BookingSeries.findOne({ createdFrom: booking._id });
  if (existing) return existing;

  const date = parseCalendarDate(booking.preferredDate);
  const startTime = slotStartTime(booking.slot);
  try {
    const series = await BookingSeries.create({
      customer: booking.customer,
      template: {
        serviceId: booking.serviceId,
        areaM2: booking.areaM2,
        condition: booking.condition,
        extras: booking.extras ?? [],
        notes: booking.notes ?? "",
        pets: Boolean(booking.pets),
        customerDetails: {
          name: booking.customerDetails.name,
          email: booking.customerDetails.email,
          phone: booking.customerDetails.phone,
          postcode: booking.customerDetails.postcode,
          address: booking.customerDetails.address,
          accessNotes: booking.customerDetails.accessNotes ?? "",
        },
        durationMinutes: booking.estimate?.durationMinutes ?? PRICING.minimumMinutes,
        startTime,
        weekday: date.getUTCDay(),
        frequency: booking.frequency,
        locale: booking.locale ?? "de",
        paymentMethod: paymentMethodOf(booking),
      },
      status: "active",
      preferredWorker: null,
      nextDate: addDays(date, INTERVAL_DAYS[booking.frequency]),
      createdFrom: booking._id,
      counters: { generated: 0, completed: 0 },
      ...(booking.testData && { testData: booking.testData }),
    });
    // The first booking is occurrence #0 of its plan
    await Booking.updateOne({ _id: booking._id, series: null }, { $set: { series: series._id, seriesIndex: 0 } });
    booking.series = series._id;
    booking.seriesIndex = 0;
    return series;
  } catch (error) {
    if (error.code === 11000) return BookingSeries.findOne({ createdFrom: booking._id }); // parallel confirm
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Pricing of an occurrence: the real estimate (current rates, recurring
// discount of the plan's frequency), VAT contained – no promotions, no gift cards.
// ---------------------------------------------------------------------------
export const occurrenceQuote = (template) => {
  const estimate = createEstimate({
    serviceId: template.serviceId,
    areaM2: template.areaM2,
    condition: template.condition,
    frequency: template.frequency,
    extras: template.extras ?? [],
    durationMinutes: template.durationMinutes,
  });
  const totalCents = estimate.totalCents;
  return {
    estimate,
    currency: "EUR",
    lines: {
      labourCents: estimate.labourCents,
      extraFeesCents: estimate.extraFeesCents,
      subtotalCents: estimate.subtotalCents,
      recurringDiscountCents: estimate.discountCents,
      priceCents: totalCents,
      promotionDiscountCents: 0,
      totalCents,
      vatRate: PRICING.vatRate,
      vatCents: vatContained(totalCents),
      giftCardCents: 0,
      payableCents: totalCents,
    },
    promotion: null,
    giftCards: [],
  };
};

const noteProblem = async (series, date, reason, message = "") => {
  const previous = series.lastProblem;
  const same = previous && previous.reason === reason && previous.date && previous.date.getTime() === date.getTime();
  series.lastProblem = { date, reason, message: String(message).slice(0, 500), at: new Date() };
  await series.save();
  if (same) return; // admin already knows about this occurrence
  await trySend("Admin notification", () =>
    sendAdminNotificationEmail({
      subject: `Putzplan: Termin konnte nicht angelegt werden (${formatGermanDate(date)})`,
      lines: [
        `Kunde: ${series.template.customerDetails.name} (${series.template.customerDetails.email})`,
        `Plan: ${series.template.frequency}, ${series.template.startTime} Uhr, PLZ ${series.template.customerDetails.postcode}`,
        `Datum: ${formatGermanDate(date)}`,
        `Grund: ${reason}${message ? ` – ${message}` : ""}`,
        "Bitte Zeitfenster prüfen oder den Termin manuell anlegen.",
      ],
    })
  );
};

/**
 * Create ONE occurrence of a series on `date`. Returns the booking, or null
 * when nothing could be created (problem recorded on the series).
 * Must run inside the series lock.
 */
const createOccurrence = async (series, date, now) => {
  const t = series.template;
  const index = (series.counters?.generated ?? 0) + 1;

  // Idempotent: the position or the day already exists → only advance
  const duplicate = await Booking.findOne({
    series: series._id,
    $or: [{ seriesIndex: index }, { preferredDate: date, status: { $ne: "cancelled" } }],
  }).select("_id");
  if (duplicate) return { booking: null, advance: true };

  // The window of that day whose start matches the plan's start time
  const options = await getSlotsForDate(date, t.durationMinutes);
  const option = options.find((o) => o.startTime === t.startTime);
  if (!option) {
    const hasWindow = await AvailabilitySlot.exists({ date, active: true, capacity: { $gt: 0 } });
    await noteProblem(series, date, hasWindow ? "no_capacity" : "no_window", `${t.startTime} Uhr, ${t.durationMinutes} Min.`);
    return { booking: null, advance: false };
  }

  let quote;
  try {
    quote = occurrenceQuote(t);
  } catch (error) {
    await noteProblem(series, date, "pricing", error.message);
    return { booking: null, advance: false };
  }
  const estimate = quote.estimate;
  const payable = quote.lines.payableCents;
  const online = t.paymentMethod === "online" && isOnlinePaymentAvailable() && payable >= 50;
  const method = t.paymentMethod === "cash" ? "cash" : online ? pickMethod() ?? "invoice" : "invoice";
  const reference = await generateBookingReference();
  const priority = series.preferredWorker && RECURRING.priorityHours > 0;

  const booking = await reserveAndCreate(
    { slotId: option.windowId, date, startTime: t.startTime, durationMinutes: estimate.durationMinutes },
    async (slot, { startTime, endTime }) => {
      const doc = new Booking({
        reference,
        customer: series.customer,
        serviceId: t.serviceId,
        areaM2: t.areaM2,
        condition: t.condition,
        frequency: t.frequency,
        extras: estimate.extras.map((e) => e.id),
        customerDetails: { ...t.customerDetails },
        preferredDate: date,
        slot: startTime,
        slotEnd: endTime,
        availabilitySlot: slot._id,
        notes: t.notes,
        pets: t.pets,
        estimate,
        pricing: pricingSnapshot(quote, []),
        locale: t.locale,
        series: series._id,
        seriesIndex: index,
        consents: { earlyStartRequestedAt: series.createdAt ?? now },
        payment: { status: "unpaid", method, amountCents: payable, currency: "EUR" },
        holdExpiresAt: online ? new Date(now.getTime() + RECURRING.onlineHoldDays * DAY_MS) : null,
        jobOffer: priority ? { priorityWorker: series.preferredWorker, priorityUntil: new Date(now.getTime() + RECURRING.priorityHours * 3600e3) } : {},
        ...(series.testData && { testData: series.testData }),
      });
      doc.setStatus("payment_pending", undefined, `Recurring plan – occurrence #${index}`);
      await doc.save();
      return doc;
    }
  );
  if (!booking) {
    await noteProblem(series, date, "no_capacity", `${t.startTime} Uhr belegt`);
    return { booking: null, advance: false };
  }

  if (!online) {
    await confirmBooking(booking, {
      actorId: undefined,
      note: method === "cash" ? "Recurring plan – confirmed, cash after the cleaning" : "Recurring plan – confirmed, payment by invoice",
      paid: false,
    });
  } else {
    // Pay link: the slot is held RECURRING.onlineHoldDays; the hold-expiry job frees it otherwise
    let url = null;
    try {
      ({ url } = await createCheckoutForBooking(booking, series.customer, {}));
    } catch (error) {
      console.error(`Recurring checkout failed for ${booking.reference}:`, error.message);
    }
    booking.holdExpiresAt = new Date(now.getTime() + RECURRING.onlineHoldDays * DAY_MS);
    await booking.save();
    await trySend("Series payment", () => sendSeriesPaymentEmail({ booking, url }));
  }
  return { booking, advance: true };
};

/**
 * Create the due occurrences of every active plan (hourly job; also used by
 * tests). Never throws for one broken plan – problems are recorded per series.
 */
export const generateDueOccurrences = async ({ now = new Date() } = {}) => {
  const today = todayInBerlin();
  const horizon = addDays(today, RECURRING.generateDaysAhead);
  const result = { created: 0, skipped: 0, problems: 0, reopened: 0 };

  // Paused plans whose pause has ended continue automatically
  await BookingSeries.updateMany(
    { status: "paused", pausedUntil: { $ne: null, $lte: today } },
    { $set: { status: "active", pausedUntil: null } }
  );

  const due = await BookingSeries.find({ status: "active", nextDate: { $lte: horizon } }).sort({ nextDate: 1 }).limit(500);
  for (const found of due) {
    try {
      await withLock(`series:${found._id}`, async () => {
        const series = await BookingSeries.findById(found._id);
        if (!series || series.status !== "active") return;
        const step = INTERVAL_DAYS[series.template.frequency] ?? 7;
        // At most a handful per run – a plan that was behind catches up over a few runs
        for (let guard = 0; guard < 4 && series.nextDate.getTime() <= horizon.getTime(); guard++) {
          const date = new Date(series.nextDate);
          if (date.getTime() <= today.getTime()) {
            // Bookings are possible from tomorrow – a missed day is skipped
            series.nextDate = addDays(date, step);
            result.skipped += 1;
            await series.save();
            continue;
          }
          const { booking, advance } = await createOccurrence(series, date, now);
          if (booking) {
            series.counters.generated = (series.counters.generated ?? 0) + 1;
            series.lastGeneratedDate = date;
            series.lastProblem = null;
            result.created += 1;
          }
          if (!advance) {
            result.problems += 1;
            break; // try again next run (window may be published later)
          }
          series.nextDate = addDays(date, step);
          await series.save();
        }
      });
    } catch (error) {
      console.error(`Recurring generation failed for series ${found._id}:`, error.message);
      result.problems += 1;
    }
  }

  // Priority window over → the job goes to the whole board (email once)
  const released = await Booking.find({
    status: "confirmed",
    assignedWorker: null,
    "jobOffer.priorityUntil": { $ne: null, $lte: now },
    preferredDate: { $gte: today },
    $expr: { $lt: ["$jobOffer.notifiedAt", "$jobOffer.priorityUntil"] },
  }).limit(100);
  for (const booking of released) {
    await offerJob(booking);
    if (!booking.jobOffer.notifiedAt || booking.jobOffer.notifiedAt < booking.jobOffer.priorityUntil) {
      booking.set("jobOffer.notifiedAt", new Date(Math.max(now.getTime(), booking.jobOffer.priorityUntil.getTime() + 1)));
    }
    await booking.save();
    result.reopened += 1;
  }

  return result;
};

// ---------------------------------------------------------------------------
// Customer / admin actions
// ---------------------------------------------------------------------------
const FUTURE_STATUSES = ["payment_pending", "confirmed"];

/** Whether an occurrence can still be cancelled without a fee (same rule as the customer cancel) */
export const occurrenceCancellable = (booking, now = Date.now()) => {
  if (booking.status === "payment_pending") return true;
  if (booking.status !== "confirmed") return false;
  const cutoff = slotStartInstant(booking.preferredDate, booking.slot).getTime() - OPERATIONS.cancellationCutoffHours * 3600e3;
  return now <= cutoff;
};

/** Generated occurrences of a plan that are still ahead */
export const upcomingOccurrences = (seriesId, { from = todayInBerlin(), until = null } = {}) =>
  Booking.find({
    series: seriesId,
    status: { $in: FUTURE_STATUSES },
    preferredDate: until ? { $gte: from, $lt: until } : { $gte: from },
  })
    .select("reference preferredDate slot slotEnd status payment.status payment.method pricing.totalCents holdExpiresAt assignedWorker seriesIndex")
    .sort({ preferredDate: 1 });

/** Cancel the generated occurrences in [today, until) that are still free to cancel */
const cancelFutureOccurrences = async (series, { until, actorId, reason }) => {
  const occurrences = await Booking.find({
    series: series._id,
    status: { $in: FUTURE_STATUSES },
    preferredDate: until ? { $gte: todayInBerlin(), $lt: until } : { $gte: todayInBerlin() },
  });
  const cancelled = [];
  const kept = [];
  for (const booking of occurrences) {
    if (occurrenceCancellable(booking)) {
      await cancelBooking(booking, { actorId, reason, note: reason, autoRefund: true });
      cancelled.push(booking.reference);
    } else {
      kept.push(booking.reference);
    }
  }
  return { cancelled, kept };
};

export const pauseSeries = async (series, { pausedUntil = null, actorId, byAdmin = false }) => {
  if (series.status === "ended") throw httpError(409, "This cleaning plan has already ended.");
  const until = pausedUntil ? parseCalendarDate(pausedUntil) : null;
  if (pausedUntil && !until) throw httpError(400, "Please provide a valid date (YYYY-MM-DD).");
  if (until && until.getTime() <= todayInBerlin().getTime()) throw httpError(422, "The pause must end on a future day.");
  series.status = "paused";
  series.pausedUntil = until;
  if (until) {
    // Occurrences after the pause keep the rhythm
    const step = INTERVAL_DAYS[series.template.frequency] ?? 7;
    let next = new Date(series.nextDate);
    while (next.getTime() < until.getTime()) next = addDays(next, step);
    series.nextDate = next;
  }
  await series.save();
  const reason = byAdmin ? "Cleaning plan paused by the office" : "Cleaning plan paused by customer";
  return cancelFutureOccurrences(series, { until, actorId, reason });
};

export const resumeSeries = async (series) => {
  if (series.status === "ended") throw httpError(409, "This cleaning plan has already ended.");
  if (series.status === "active") return series;
  series.status = "active";
  series.pausedUntil = null;
  series.nextDate = nextDateAfter(series);
  await series.save();
  return series;
};

export const endSeries = async (series, { actorId, byAdmin = false }) => {
  if (series.status === "ended") throw httpError(409, "This cleaning plan has already ended.");
  series.status = "ended";
  series.pausedUntil = null;
  series.endedAt = new Date();
  series.endedReason = byAdmin ? "admin" : "customer";
  await series.save();
  const reason = byAdmin ? "Cleaning plan ended by the office" : "Cleaning plan ended by customer";
  return cancelFutureOccurrences(series, { until: null, actorId, reason });
};

/**
 * Skip one occurrence: an already created booking on that day is cancelled
 * (free until the cutoff); a not yet created date just moves `nextDate` on.
 * Without a date the next upcoming occurrence is skipped.
 */
export const skipOccurrence = async (series, { date, actorId }) => {
  if (series.status === "ended") throw httpError(409, "This cleaning plan has already ended.");
  const today = todayInBerlin();
  let target = date ? parseCalendarDate(date) : null;
  if (date && !target) throw httpError(400, "Please provide a valid date (YYYY-MM-DD).");

  const generated = await Booking.find({ series: series._id, status: { $in: FUTURE_STATUSES }, preferredDate: { $gt: today } })
    .sort({ preferredDate: 1 })
    .limit(20);
  if (!target) {
    const first = generated[0]?.preferredDate;
    target = first && first.getTime() < series.nextDate.getTime() ? new Date(first) : new Date(series.nextDate);
  }

  const booking = generated.find((b) => b.preferredDate.getTime() === target.getTime());
  if (booking) {
    if (!occurrenceCancellable(booking)) {
      throw httpError(409, `This cleaning can no longer be skipped online (less than ${OPERATIONS.cancellationCutoffHours} hours before the start). Please contact us.`);
    }
    await cancelBooking(booking, { actorId, reason: "Skipped by customer", note: "Occurrence skipped (cleaning plan)", autoRefund: true });
    return { skippedDate: target, cancelledReference: booking.reference, nextDate: series.nextDate };
  }
  if (target.getTime() === series.nextDate.getTime()) {
    const step = INTERVAL_DAYS[series.template.frequency] ?? 7;
    series.nextDate = addDays(target, step);
    await series.save();
    return { skippedDate: target, cancelledReference: null, nextDate: series.nextDate };
  }
  throw httpError(422, "This date is not an upcoming cleaning of your plan.");
};

/** Plain view of a series for API responses */
export const seriesView = async (series, { admin = false } = {}) => {
  const [upcoming, completed] = await Promise.all([
    upcomingOccurrences(series._id).limit(6).populate("assignedWorker", "name").lean(),
    Booking.countDocuments({ series: series._id, status: "completed" }),
  ]);
  const t = series.template;
  const worker = series.preferredWorker && typeof series.preferredWorker === "object" ? series.preferredWorker : null;
  return {
    _id: series._id,
    status: series.status,
    frequency: t.frequency,
    intervalDays: INTERVAL_DAYS[t.frequency],
    serviceId: t.serviceId,
    areaM2: t.areaM2,
    condition: t.condition,
    extras: t.extras,
    durationMinutes: t.durationMinutes,
    startTime: t.startTime,
    weekday: t.weekday,
    paymentMethod: t.paymentMethod,
    pets: t.pets,
    address: { postcode: t.customerDetails.postcode, address: t.customerDetails.address },
    ...(admin && { customer: series.customer, customerDetails: t.customerDetails, lastProblem: series.lastProblem, notes: t.notes }),
    preferredWorker: worker ? { _id: worker._id, name: worker.name } : series.preferredWorker ? { _id: series.preferredWorker, name: null } : null,
    nextDate: series.nextDate,
    pausedUntil: series.pausedUntil,
    counters: { generated: series.counters?.generated ?? 0, completed },
    createdFrom: series.createdFrom,
    lastGeneratedDate: series.lastGeneratedDate,
    upcoming: upcoming.map((b) => ({
      _id: b._id,
      reference: b.reference,
      preferredDate: b.preferredDate,
      slot: b.slot,
      slotEnd: b.slotEnd,
      status: b.status,
      paymentStatus: b.payment?.status ?? "unpaid",
      paymentMethod: b.payment?.method,
      totalCents: b.pricing?.totalCents ?? null,
      holdExpiresAt: b.holdExpiresAt,
      cleaner: b.assignedWorker ? { _id: b.assignedWorker._id, name: b.assignedWorker.name } : null,
      cancellable: occurrenceCancellable(b),
    })),
    endedAt: series.endedAt,
    endedReason: series.endedReason,
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
  };
};

export const isSeriesId = (id) => mongoose.isValidObjectId(id);
