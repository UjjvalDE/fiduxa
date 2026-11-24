// Unit tests: price engine maths (no database needed). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

import { createEstimate } from "../../src/services/estimate.service.js";
import { computeDiscount } from "../../src/services/promotion.service.js";
import { vatContained } from "../../src/services/quote.service.js";
import { PRICING } from "../../src/config/pricing.js";

test("default hourly price is €25", () => {
  assert.equal(PRICING.hourlyRateCents, Number(process.env.HOURLY_RATE_CENTS) || 2500);
});

test("labour = hours × rate, minimum 2 hours", () => {
  const e = createEstimate({ areaM2: 20, durationMinutes: 60 });
  assert.equal(e.durationMinutes, PRICING.minimumMinutes);
  assert.equal(e.labourCents, Math.round((PRICING.minimumMinutes / 60) * PRICING.hourlyRateCents));
});

test("extras add time to the recommendation and round up to the step", () => {
  const plain = createEstimate({ areaM2: 60 });
  const withOven = createEstimate({ areaM2: 60, extras: ["inside-oven"] });
  assert.equal(plain.recommendedMinutes, 120);
  assert.equal(withOven.recommendedMinutes, 180); // 120 + 40 → 160 → rounded to 180
});

test("customer can choose more hours than recommended (clamped to max)", () => {
  const e = createEstimate({ areaM2: 60, durationMinutes: 10_000 });
  assert.equal(e.durationMinutes, PRICING.maximumMinutes);
});

test("weekly frequency discount is applied server-side", () => {
  const e = createEstimate({ areaM2: 60, durationMinutes: 120, frequency: "weekly" });
  assert.equal(e.discountCents, Math.round(e.subtotalCents * PRICING.frequencyDiscount.weekly));
  assert.equal(e.totalCents, e.subtotalCents - e.discountCents);
});

test("percent discount, capped by maxDiscount", () => {
  assert.equal(computeDiscount({ discountType: "percent", discountValue: 10 }, 7500), 750);
  assert.equal(computeDiscount({ discountType: "percent", discountValue: 50, maxDiscountCents: 2000 }, 10000), 2000);
});

test("fixed discount never exceeds the order (no negative prices)", () => {
  assert.equal(computeDiscount({ discountType: "fixed", discountValue: 5000 }, 3000), 3000);
  assert.equal(computeDiscount({ discountType: "fixed", discountValue: 2000 }, 0), 0);
  assert.equal(computeDiscount({ discountType: "percent", discountValue: 150 }, 1000), 1000);
});

test("VAT contained in a gross price (19 %)", () => {
  assert.equal(vatContained(11900, 0.19), 1900);
  assert.equal(vatContained(6750, 0.19), 1078);
  assert.equal(vatContained(5000, 0), 0); // Kleinunternehmer
});
