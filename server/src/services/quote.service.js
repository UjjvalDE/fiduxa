// Central price engine. Every price the customer sees and pays comes from
// buildQuote() – the frontend only displays it.
//
//   labour (hours × rate) + extra fees              = subtotal
//   − recurring (frequency) discount                = price
//   − ONE promotional discount (best of welcome / campaign / code)
//   = total incl. VAT  (discounts reduce the taxable amount; VAT is contained)
//   − gift cards (a payment method, applied after VAT – Mehrzweck-Gutschein)
//   = payable now (online / cash)  ≥ 0
import { createEstimate } from "./estimate.service.js";
import { findBestPromotion } from "./promotion.service.js";
import { findUsableGiftCard, maskCode, normalizeGiftCardCode } from "./gift-card.service.js";
import { GIFT_CARDS, PRICING } from "../config/pricing.js";

export const vatContained = (grossCents, rate = PRICING.vatRate) =>
  rate > 0 ? Math.round(grossCents - grossCents / (1 + rate)) : 0;

/**
 * @param input        estimate input { serviceId, areaM2, condition, frequency, extras, durationMinutes }
 * @param user         logged-in customer or null
 * @param promoCode    optional coupon code
 * @param giftCardCodes optional list of gift card codes
 * @param contact      { email, phone, address, postcode } for welcome-abuse checks
 * @param excludeBookingId booking being re-priced (ignored for "first booking" checks)
 */
export const buildQuote = async ({ input, user = null, promoCode, giftCardCodes = [], contact, excludeBookingId }) => {
  const estimate = createEstimate(input);
  const priceCents = estimate.totalCents; // after recurring discount

  const promo = await findBestPromotion({
    user,
    serviceId: input.serviceId,
    orderCents: priceCents,
    code: promoCode,
    contact,
    excludeBookingId,
  });
  const promotionDiscountCents = promo.applied?.discountCents ?? 0;
  const totalCents = Math.max(0, priceCents - promotionDiscountCents);

  // Gift cards, in the order entered, until the total is covered
  const seen = new Set();
  const giftCards = [];
  let remaining = totalCents;
  for (const raw of giftCardCodes.slice(0, 10)) {
    const code = normalizeGiftCardCode(raw);
    if (!code) {
      giftCards.push({ code: String(raw).slice(0, 24), ok: false, reason: "invalid", appliedCents: 0 });
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);
    if (giftCards.filter((g) => g.ok).length >= GIFT_CARDS.maxPerBooking) {
      giftCards.push({ code: maskCode(code), ok: false, reason: "too_many", appliedCents: 0 });
      continue;
    }
    const found = await findUsableGiftCard(code);
    if (!found.card) {
      giftCards.push({ code: maskCode(code), ok: false, reason: found.reason, appliedCents: 0 });
      continue;
    }
    const appliedCents = Math.min(found.card.balanceCents, remaining);
    remaining -= appliedCents;
    giftCards.push({
      id: found.card._id,
      code: maskCode(code),
      codeLast4: code.slice(-4),
      ok: true,
      reason: appliedCents === 0 ? "not_needed" : null,
      balanceCents: found.card.balanceCents,
      appliedCents,
      remainingAfterCents: found.card.balanceCents - appliedCents,
      expiresAt: found.card.expiresAt,
    });
  }
  const giftCardCents = totalCents - remaining;
  const payableCents = remaining;

  return {
    estimate,
    currency: "EUR",
    lines: {
      labourCents: estimate.labourCents,
      extraFeesCents: estimate.extraFeesCents,
      subtotalCents: estimate.subtotalCents,
      recurringDiscountCents: estimate.discountCents,
      priceCents,
      promotionDiscountCents,
      totalCents,
      vatRate: PRICING.vatRate,
      vatCents: vatContained(totalCents),
      giftCardCents,
      payableCents,
    },
    promotion: promo.applied ? { ...promo.applied, promo: undefined } : null,
    promotionRef: promo.applied?.promo ?? null, // internal (not sent to clients)
    codeResult: promo.codeResult,
    welcome: promo.welcome,
    giftCards,
  };
};

/** Client-safe version of a quote */
export const publicQuote = (quote) => {
  const { promotionRef, ...rest } = quote;
  return rest;
};

/** Snapshot stored on the booking */
export const pricingSnapshot = (quote, reservedGiftCards) => ({
  subtotalCents: quote.lines.subtotalCents,
  recurringDiscountCents: quote.lines.recurringDiscountCents,
  priceCents: quote.lines.priceCents,
  promotion: quote.promotion
    ? {
        id: quote.promotion.id,
        kind: quote.promotion.kind,
        name: quote.promotion.name,
        code: quote.promotion.code,
        discountType: quote.promotion.discountType,
        discountValue: quote.promotion.discountValue,
        discountCents: quote.promotion.discountCents,
      }
    : null,
  promotionDiscountCents: quote.lines.promotionDiscountCents,
  totalCents: quote.lines.totalCents,
  vatRate: quote.lines.vatRate,
  vatCents: quote.lines.vatCents,
  giftCards: reservedGiftCards.map((g) => ({
    giftCard: g.id,
    codeLast4: g.codeLast4,
    amountCents: g.appliedCents,
    state: "reserved",
  })),
  giftCardCents: quote.lines.giftCardCents,
  payableCents: quote.lines.payableCents,
});
