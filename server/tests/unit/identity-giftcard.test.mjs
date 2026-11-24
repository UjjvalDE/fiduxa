// Unit tests: duplicate-account markers and gift card codes. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

import { normAddress, normEmail, normPhone } from "../../src/utils/identity.js";
import { expiryFor, maskCode, normalizeGiftCardCode } from "../../src/services/gift-card.service.js";
import { allowedAmount } from "../../src/services/gift-card-purchase.service.js";

test("gmail dots and +tags are the same mailbox", () => {
  assert.equal(normEmail("Max.Muster+promo@gmail.com"), "maxmuster@gmail.com");
  assert.equal(normEmail("maxmuster@googlemail.com"), "maxmuster@gmail.com");
  assert.equal(normEmail("a.b+x@web.de"), "a.b@web.de");
});

test("German phone formats are normalised", () => {
  assert.equal(normPhone("+49 (30) 123-4567"), "0301234567");
  assert.equal(normPhone("0049 30 1234567"), "0301234567");
  assert.equal(normPhone("030 1234567"), "0301234567");
  assert.equal(normPhone("12"), "");
});

test("street spellings are normalised", () => {
  assert.equal(normAddress("Invalidenstraße 5", "10115"), normAddress("invalidenstr. 5", "10115"));
  assert.notEqual(normAddress("Invalidenstraße 5", "10115"), normAddress("Invalidenstraße 5", "10117"));
});

test("gift card codes accept spaces, lowercase and missing prefix", () => {
  assert.equal(normalizeGiftCardCode("fidx 7kq2 m9tp 4wxc"), "FIDX-7KQ2-M9TP-4WXC");
  assert.equal(normalizeGiftCardCode("7KQ2M9TP4WXC"), "FIDX-7KQ2-M9TP-4WXC");
  assert.equal(normalizeGiftCardCode("FIDX-123"), null);
  assert.equal(maskCode("FIDX-7KQ2-M9TP-4WXC"), "FIDX-••••-••••-4WXC");
});

test("gift cards are valid until the end of the 3rd year", () => {
  const exp = expiryFor(new Date(Date.UTC(2026, 10, 20)), 3);
  assert.equal(exp.getUTCFullYear(), 2029);
  assert.equal(exp.getUTCMonth(), 11);
});

test("gift card amounts: presets or whole euros within limits", () => {
  assert.equal(allowedAmount(5000), true);
  assert.equal(allowedAmount(3300), true);
  assert.equal(allowedAmount(3350), false);
  assert.equal(allowedAmount(1000), false);
  assert.equal(allowedAmount(999999), false);
});
