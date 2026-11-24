// Lifecycle of the promotion + gift cards attached to a booking.
//   create   → reserveBookingDiscounts   (promo counted, gift card balances taken)
//   paid/confirmed → finalizeBookingDiscounts (promo applied, gift cards captured)
//   cancelled/expired → releaseBookingDiscounts (promo freed, gift card money back)
import Booking from "../models/booking.model.js";
import {
  applyPromotionForBooking,
  reacquirePromotionForBooking,
  releasePromotionForBooking,
  reservePromotion,
} from "./promotion.service.js";
import {
  captureGiftCardAmount,
  releaseGiftCardAmount,
  reserveGiftCardAmount,
} from "./gift-card.service.js";

/** Reserve everything for a new booking; rolls back on failure. Returns the reserved gift cards. */
export const reserveBookingDiscounts = async ({ quote, user, bookingId, contact, serviceId }) => {
  let promoReserved = false;
  const reserved = [];
  try {
    if (quote.promotionRef) {
      await reservePromotion(quote.promotionRef, {
        user,
        bookingId,
        discountCents: quote.promotion.discountCents,
        orderCents: quote.lines.priceCents,
        contact,
        serviceId,
        personalCodeId: quote.promotion.personalCodeId,
        code: quote.promotion.code,
      });
      promoReserved = true;
    }
    for (const g of quote.giftCards) {
      if (!g.ok || g.appliedCents <= 0) continue;
      await reserveGiftCardAmount({ cardId: g.id, bookingId, amountCents: g.appliedCents, actor: user._id });
      reserved.push(g);
    }
    return reserved;
  } catch (error) {
    await rollback({ bookingId, promoReserved, reserved, actor: user._id });
    throw error;
  }
};

const rollback = async ({ bookingId, promoReserved, reserved, actor }) => {
  if (promoReserved) await releasePromotionForBooking(bookingId);
  for (const g of reserved) {
    await releaseGiftCardAmount({ cardId: g.id, bookingId, amountCents: g.appliedCents, actor, note: "Booking not created" });
  }
};

/** Undo reservations of a booking that was never created (e.g. slot taken) */
export const rollbackBookingDiscounts = ({ bookingId, quote, reserved, actor }) =>
  rollback({ bookingId, promoReserved: Boolean(quote.promotionRef), reserved, actor });

/** Booking confirmed (paid, cash, invoice, fully covered) */
export const finalizeBookingDiscounts = async (booking) => {
  await applyPromotionForBooking(booking._id);
  const cards = booking.pricing?.giftCards ?? [];
  for (const entry of cards) {
    if (entry.state !== "reserved") continue;
    await captureGiftCardAmount({ cardId: entry.giftCard, bookingId: booking._id, amountCents: entry.amountCents, attempt: entry.attempt ?? 0 });
    entry.state = "captured";
  }
  if (cards.length) booking.markModified("pricing.giftCards");
};

/**
 * Booking cancelled/expired: free the promotion (unless the job was completed)
 * and credit gift card amounts back. Does NOT save the booking.
 */
export const releaseBookingDiscounts = async (booking, { actor, note = "" } = {}) => {
  if (booking.status !== "completed") await releasePromotionForBooking(booking._id);
  const cards = booking.pricing?.giftCards ?? [];
  for (const entry of cards) {
    if (entry.state === "released") continue;
    await releaseGiftCardAmount({
      cardId: entry.giftCard,
      bookingId: booking._id,
      amountCents: entry.amountCents,
      attempt: entry.attempt ?? 0,
      actor,
      type: entry.state === "captured" ? "refund" : "release",
      note: note || `Booking ${booking.reference} ${booking.status}`,
    });
    entry.state = "released";
  }
  if (cards.length) booking.markModified("pricing.giftCards");
};

/**
 * Late payment after the hold expired: take the promotion and gift card
 * amounts back. Returns false if that is no longer possible.
 */
export const reacquireBookingDiscounts = async (booking) => {
  if (!(await reacquirePromotionForBooking(booking._id))) return false;
  const cards = booking.pricing?.giftCards ?? [];
  const taken = [];
  try {
    for (const entry of cards) {
      if (entry.state !== "released") continue;
      const attempt = (entry.attempt ?? 0) + 1;
      await reserveGiftCardAmount({ cardId: entry.giftCard, bookingId: booking._id, amountCents: entry.amountCents, attempt });
      taken.push({ entry, attempt });
    }
  } catch {
    for (const { entry, attempt } of taken) {
      await releaseGiftCardAmount({ cardId: entry.giftCard, bookingId: booking._id, amountCents: entry.amountCents, attempt, note: "Late payment rollback" });
    }
    await releasePromotionForBooking(booking._id);
    return false;
  }
  for (const { entry, attempt } of taken) {
    entry.state = "reserved";
    entry.attempt = attempt;
  }
  if (taken.length) booking.markModified("pricing.giftCards");
  return true;
};

export { Booking };
