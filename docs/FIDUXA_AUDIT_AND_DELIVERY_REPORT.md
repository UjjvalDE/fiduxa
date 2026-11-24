# Fiduxa: audit, promotions & gift cards, testing and load-test report

*As of 20 Nov 2026. Everything in this report was measured or tested on the date shown. Nothing is estimated unless it says so.*

---

## 1. Audit findings

### Existing functionality (working before this phase)
- **Public site:** multilingual (DE main, EN, PL), services, prices and FAQ pages, and B2B request and contact forms.
- **Booking:** hours-first booking wizard, start times computed from the total duration inside admin-managed availability windows, and server-side price calculation.
- **Payments:** PayPal (Orders v2 with server-side capture), Stripe Checkout with a signed webhook, cash after the job, and invoice mode. Refunds run automatically on cancellation.
- **Customer account:** bookings, cancellation, Q&A messages with the cleaner and the office, and reviews.
- **Cleaner portal:**
  - Setup, profile and photo, working hours and holidays, and a calendar.
  - Open-job marketplace, job flow with checklist, and cash collection.
  - Earnings and payouts after 30 days.
- **Admin:**
  - Dashboard, bookings, and availability windows.
  - Cleaners, customers, payments, and payouts.
  - Reviews, messages, the audit log, platform settings (prices, extras, rules), and admin accounts.

### Broken or incomplete (found and fixed)
| # | Finding | Fix |
|---|---|---|
| 1 | Customers could not confirm their email address (`emailVerified` was always false for customers) | Verification email + `/email-bestaetigen` page + resend |
| 2 | No promotions, coupons or gift cards (blueprint phase 6 missing) | Built (§2) |
| 3 | The homepage hotlinked 3 images from images.pexels.com. Every visit leaked the visitor's IP to a third party (GDPR) and depended on an external CDN | Images are now served locally from `public/images` (69–89 KB each) |
| 4 | The homepage was one large client component | Split: static parts render on the server, with small client islands |
| 5 | Open-job matching ran one DB query per cleaner or per job (an N+1 pattern), and loaded 100 full Mongoose documents per request | Batched queries + `.lean()` (§12) |
| 6 | Availability recomputed all bookings of the next 90 days on every request; this got slow as bookings grew | 15 s cache, cleared on every capacity change (§12) |
| 7 | Promotion image URLs given as site paths (`/images/x.jpg`) were rejected, and CTA links allowed protocol-relative URLs like `//evil.com` | Validation fixed |
| 8 | The PayPal `invoice_id` was the booking reference. A second order for the same booking could clash after a refund | The id is now unique per attempt |
| 9 | Customer-facing "Reinigungskräfte" (cleaners) section in the navigation | Replaced by "Gutscheine"; the list page redirects to `/` |
| 10 | Password-reset links pointed to the API port (`CLIENT_URL=…:3100`) | Fixed earlier, using `PUBLIC_SITE_URL` |

### Security observations
- **Good already:**
  - helmet and per-route rate limits;
  - zod validation on all write endpoints;
  - IDOR-safe queries, with every customer query filtered by the customer's own id;
  - signed Stripe webhook;
  - PayPal amount verified server-side;
  - passwords hashed with bcrypt;
  - token revocation (`tokenVersion`);
  - IBANs encrypted with AES-GCM.
- **Added:** security headers on the website (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) and removed `X-Powered-By`. Also added a rate limit for gift-card balance checks (20 per 15 min), verification and quote limits, and abuse protection for the welcome offer.
- **Still open (§14):**
  - the login token is stored in `localStorage` (an httpOnly cookie would be safer against XSS);
  - there is no Content-Security-Policy yet;
  - registering with an existing email reveals that the account exists (common UX trade-off).

### Performance observations
See §12 for measured before/after numbers. The N+1 query in job matching and the uncached availability lookups were the two real bottlenecks under load.

### Database improvements
New indexes:
- `bookings`: `{status, assignedWorker, preferredDate}`, `{customer, status}`, `{createdAt, status}`;
- `promotionredemptions`: `{promotion, customer, status}`, plus indexes on the welcome-abuse markers;
- `giftcards`: `code` (unique), `{status, deliverAt, deliveryStatus}`;
- `giftcardtransactions`: `idempotencyKey` (unique, partial), `booking`;
- `promotions`: `code` (unique, partial), `{active, startsAt, endsAt}`.

### Unused dependencies (not removed)
`@supabase/supabase-js`, `@hookform/resolvers` and frontend `zod` are not imported anywhere. They are not bundled because nothing imports them, so removing them is cosmetic. Recommended for the next cleanup.

---

## 2. Implemented features (this phase)

1. **Central price engine:** one server function for every price shown or charged (§6).
2. **Customer email verification:** a confirmation link on registration, valid for 24 hours, with a resend option and a reminder banner in the account.
3. **Welcome offer, 10 % automatically:** applies to the first booking after email verification, once per customer, with duplicate-account protection.
4. **Promotion system:**
   - Kinds: welcome / campaign / coupon; percent or fixed; min order, max discount; service restriction; first-booking-only; verified-email-only; schedule; usage limit and per-customer limit.
   - Banner content per language with theme, image, CTA and badge, placed as hero / banner / card with a priority.
   - Expired campaigns disappear automatically, and the next campaign takes their place.
5. **Christmas campaign (pre-created, editable):** the hero text and CTA exactly as specified, code **XMAS10** = 10 % (max €50, min order €50), valid until 24 Dec 2026 23:59.
6. **Dynamic homepage:** campaign hero (festive theme), welcome card, banners and cards, a gift-card teaser, and a fallback hero when nothing is live.
7. **Gift cards:**
   - Shop at `/gutscheine`: preset or custom amount, 4 designs with a live preview, recipient, sender, message and delivery date, paid with PayPal (Stripe is ready once its keys are added).
   - Branded email to the recipient (immediately or at 08:00 on the chosen day) and a confirmation to the buyer.
   - Balance check, redemption in the checkout (several cards, partial use), and "Meine Gutscheine" in the account.
8. **Checkout:** transparent breakdown, coupon field, gift-card fields, welcome hints, a price-changed guard, and "pay with gift card" when nothing is left to pay.
9. **Admin:** Aktionen (CRUD, templates, live preview, redemptions), Gutscheine (search, ledger, block/unblock, ± adjustment with reason, resend, goodwill cards), Auswertungen (analytics), VAT and gift-card settings, and the price breakdown on each booking.
10. **Tests:** an automated test suite (unit + API end-to-end) and a reusable load test (§11–12).

---

## 3. Files

### Backend: created
- **`src/models/`:** `promotion.model.js`, `promotion-redemption.model.js`, `gift-card.model.js`, `gift-card-transaction.model.js`
- **`src/services/`:** `quote.service.js`, `promotion.service.js`, `gift-card.service.js`, `gift-card-purchase.service.js`, `booking-discounts.service.js`
- **`src/utils/`:** `lock.js` (shared MongoDB lock), `identity.js` (email/phone/address normalisation)
- **`src/controllers/`:** `gift-card.controller.js`, `promotion-public.controller.js`, `admin-promotion.controller.js`, `admin-gift-card.controller.js`, `admin-analytics.controller.js`
- **`src/routes/`:** `gift-card.routes.js`
- **`tests/helpers/`:** `harness.mjs` (test DB guard, PayPal mock)
- **`tests/e2e/`** (5 suites): `booking-payment-stripe`, `job-dispatch`, `cleaner-profile-messages-payouts`, `settings-availability-cash-auth`, `promotions-giftcards`
- **`tests/`:** `run-e2e.mjs`, `unit/pricing.test.mjs`, `unit/identity-giftcard.test.mjs`
- **`tests/load/`:** `server.mjs`, `load-test.mjs`

### Backend: modified
- **Models:** `booking` (`pricing` snapshot, `gift_card` method, indexes), `user` (email verification), `payment` (`purpose`, `giftCard`), `settings` (VAT, gift cards, seeds)
- **Services:** `availability` (cache, release discounts on expiry, shared lock), `booking-lifecycle`, `payment` (generic Stripe session, payable amount), `paypal` (generic order), `email` (verification, welcome, gift-card and price-breakdown emails), `settings`, `job-dispatch` (batched queries)
- **Controllers:** `auth`, `user`, `booking-flow` (quote endpoint, booking through the engine), `payment` (gift-card branch, late-payment reclaim), `worker-job`, `admin-settings`, `admin-slot`
- **Other:** `middleware/auth.middleware.js` (`optionalAuth`); the `auth`, `booking-flow`, `public` and `admin` routes; `app.js` (routes, rate limits, test-only rate-limit bypass); `main.js` (seeding, gift-card jobs); `config/pricing.js` (VAT, `GIFT_CARDS`); `package.json` (test scripts); `.env.example`; `API.md`; `.gitignore`

### Frontend: created
- **Gift card shop:** `app/(site)/gutscheine/{page.tsx, _messages.ts, _lib/config.ts, bezahlt/page.tsx, _components/gift-card-shop.tsx, gift-card-visual.tsx, balance-check.tsx, gift-card-return.tsx}`
- **Email verification:** `app/(site)/email-bestaetigen/{page.tsx, _messages.ts, _components/verify-email-view.tsx}`
- **Account:** `app/(site)/konto/gutscheine/page.tsx`, `konto/_components/{gift-cards-list.tsx, verify-email-banner.tsx}`
- **Shared and checkout:** `app/(site)/_shared/{price-breakdown.tsx, pricing-messages.ts, promotions.ts, server-api.ts}`, `app/(site)/buchung/_components/checkout-discounts.tsx`
- **Homepage:** `app/_home/{home-page.tsx, home-islands.tsx, promo-sections.tsx, promo-messages.ts, promotions.ts}`
- **Images:** `public/images/{home-hero.jpg, home-detail.jpg, home-story.jpg}`
- **Admin promotions:**
  - `app/admin/aktionen/{page.tsx, neu/page.tsx, [id]/page.tsx, [id]/bearbeiten/page.tsx, _messages.ts, _templates.ts}`
  - `app/admin/aktionen/_components/{promotion-form.tsx, promotion-preview.tsx, promotion-parts.tsx}`
- **Admin gift cards:** `app/admin/gutscheine/{page.tsx, [id]/page.tsx, _messages.ts, _components/issue-dialog.tsx}`
- **Admin analytics:** `app/admin/auswertungen/{page.tsx, _messages.ts}`
- **Admin shared:** `app/admin/_components/{promo-utils.ts, booking-pricing.tsx, marketing-teaser.tsx}`, `app/admin/_pricing-messages.ts`

### Frontend: modified
- **Root and shared:** `app/page.tsx`, `next.config.js` (security headers), `lib/types.ts`, `lib/api.ts` (full error body), `lib/i18n/api-errors.ts`, `lib/i18n/messages/common.ts`, header and footer
- **Booking wizard:** `_lib/hooks.ts` (`useQuote`), `_lib/wizard.ts`, `booking-wizard.tsx`, `estimate-panel.tsx`, `steps/step-checkout.tsx`, `steps/confirmation.tsx`
- **Account:** `layout.tsx`, `_messages.ts`, `account-nav.tsx`, `booking-detail.tsx`
- **Cleaner profile pages:** `reinigungskraefte/*` (the profile is now noindex; the list redirects)
- **Admin:** `admin-shell.tsx`, `_messages.ts`, `einstellungen/*`, `buchungen/[id]/page.tsx`, `booking-payment.tsx`, dashboard

### Removed
- `app/_home/home-content.tsx`, replaced by the server-rendered homepage
- `app/(site)/reinigungskraefte/_components/cleaner-directory.tsx` and `cleaner-card.tsx` (public cleaner list)

---

## 4. Database schema changes (all additive, so old records stay valid)

- **`promotions` (new):**
  - Core fields: `name`, `kind` (welcome|campaign|coupon), `code` (unique, optional), `discountType`, `discountValue`, `maxDiscountCents`, `minOrderCents`, `services[]`.
  - Rules: `firstBookingOnly`, `requiresVerifiedEmail`, `startsAt`, `endsAt`, `active`, `usageLimit`, `perCustomerLimit`, `usedCount`.
  - Banner content: `display { placement, priority, title/text/ctaText/badge {de,en,pl}, ctaHref, imageUrl, theme }`.
- **`promotionredemptions` (new):** `promotion`, `kind`, `code`, `customer`, `booking` (unique), `discountCents`, `orderCents`, `status` (reserved|applied|released), `fingerprint { email, phone, address }`.
- **`giftcards` (new):** `code` (unique), `status`, `initialCents`, `balanceCents`, purchaser, sender and recipient, `message`, `design`, `locale`, `deliverAt`/`deliveredAt`/`deliveryStatus`, `payment`, `expiresAt`, `disabledReason`, `issuedBy`.
- **`giftcardtransactions` (new, ledger):** `giftCard`, `type` (purchase|issue|reserve|capture|release|refund|adjust|expire), signed `amountCents`, `balanceAfterCents`, `booking`, `actor`, `note`, `idempotencyKey` (unique).
- **`bookings`:** `pricing { subtotalCents, recurringDiscountCents, priceCents, promotion, promotionDiscountCents, totalCents, vatRate, vatCents, giftCards[{giftCard, codeLast4, amountCents, state, attempt}], giftCardCents, payableCents }`; `payment.method` gains `gift_card`.
- **`users`:** `emailVerificationTokenHash`, `emailVerificationExpires`, `emailVerifiedAt`.
- **`payments`:** `purpose` (booking|gift_card), `giftCard`; `booking` is now optional.
- **`settings`:** `pricing.vatRate`, `giftCards {…}`, `seeds[]`.

No migration script is needed. Bookings without `pricing` fall back to `estimate.totalCents`.

---

## 5. New and modified API endpoints

The full reference is in `server/API.md` → "Price engine, promotions & gift cards".

- **Public / customer:**
  - `POST /bookings/quote` (new);
  - `POST /bookings` (now also takes `promoCode`, `giftCardCodes` and `expectedPayableCents`, and answers with the error codes `PRICE_CHANGED`, `PROMO_INVALID` or `GIFT_CARD_INVALID` when something changed);
  - `GET /promotions/active`;
  - `POST /auth/verify-email`, `POST /auth/resend-verification`;
  - `GET /gift-cards/config`, `POST /gift-cards/check`, `POST /gift-cards`, `GET /gift-cards/mine`, `GET /gift-cards/:id`, `POST /gift-cards/:id/pay`, `POST /gift-cards/:id/paypal/capture`.
- **Admin:**
  - `GET|POST /admin/promotions`, `GET|PATCH|DELETE /admin/promotions/:id`, `PATCH /admin/promotions/:id/active`;
  - `GET /admin/gift-cards`, `GET /admin/gift-cards/:id`, `POST /admin/gift-cards/issue|:id/disable|:id/enable|:id/adjust|:id/resend`;
  - `GET /admin/analytics`;
  - `PUT /admin/settings` (new `pricing.vatRate` and `giftCards` section).

---

## 6. How prices and discounts are calculated

All calculation happens in `server/src/services/quote.service.js`; the browser only displays the result.

```
labour (hours × hourly rate, default €25)  + extra fees      = subtotal
− recurring discount (e.g. weekly −10 %)                      = price
− ONE promotional discount (the best of: welcome / automatic campaign / entered code)
= TOTAL incl. VAT        → VAT shown as contained: total − total / (1 + rate)
− gift cards (a means of payment, not a discount)
= PAYABLE (online or cash), never below 0
```

Example from the test suite: 3 h × €25 = **€75.00** → welcome −10 % = **€67.50 incl. €10.78 VAT** → gift card −€50.00 → **€17.50 payable** (cash).

**Rules:**
- **No stacking:** promotions don't stack. The highest discount wins, and the customer is told when a better automatic offer replaced their code.
- **VAT:** discounts reduce the price and therefore the VAT (taxable amount = what the customer actually pays). Gift cards are *Mehrzweck-Gutscheine* (§ 3 Abs. 15 UStG): no VAT when sold, and VAT arises on redemption. That's why gift cards are deducted **after** the VAT calculation. Please confirm both treatments with your tax adviser.
- **VAT rate:** 19 % by default, configurable in Admin → Einstellungen (0 % for Kleinunternehmer).
- **Manipulation-proof:**
  - Price fields sent by the browser are ignored.
  - The booking is refused with 409 `PRICE_CHANGED` if the price differs from the one the customer saw.
  - Fixed discounts are capped at the order value, so prices are never negative.
  - The promotion is re-checked and counted atomically when the booking is created.
- **Welcome offer:**
  - Eligible: a customer with a verified email and no previous confirmed, started or completed booking.
  - Blocked: when another account already used it with the same phone number, mailbox (gmail dots and `+tags` are ignored) or street address with postcode.
  - Cancellation: if a booking is cancelled or expires *before* the cleaning, the offer is released and can be used again. Once the cleaning has been done, it stays used even after a refund.

---

## 7. Gift cards: purchase and redemption

- **Purchase:**
  - `/gutscheine` → the card is created as `pending_payment`; its code is hidden until payment → PayPal (or Stripe) → payment verified server-side → `active` (ledger entry `purchase`).
  - Emails: the recipient gets theirs immediately or at 08:00 on the chosen day (a scheduler runs every minute); the buyer gets a confirmation with the code.
  - Unpaid purchases are cancelled after 60 minutes.
- **Validity:** until 31 December of the 3rd year after purchase (the standard German limitation period).
- **Redemption:**
  - Codes are entered in the checkout (`FIDX-XXXX-XXXX-XXXX`; spaces and lowercase are fine), up to 3 per booking.
  - When the booking is created, the amount is **reserved**. This is an atomic `balance ≥ amount` update under a per-card lock, with a ledger entry carrying an idempotency key.
  - When the booking is paid or confirmed, the amount is **captured**; when it is cancelled or expires, it is **released or refunded** back onto the card.
  - A partly used card keeps its remaining balance.
  - Tested: two parallel bookings with the same card → exactly one succeeds, and the balance never goes negative.
- **Admin:** search, ledger, block/unblock, ± adjustment with a reason (stored in the ledger and the audit log), resend, and goodwill cards.

---

## 8. Payment flow improvements

- The online amount is always the **payable** amount (after the promotion and gift cards). Both PayPal and Stripe verify that exact amount server-side.
- **Duplicate protection:** capture requests are idempotent. PayPal uses its request id and the order is checked for "already captured"; Stripe uses idempotency keys plus an idempotent webhook. Tested: a repeated capture causes no second charge.
- **Failures:** a declined payment returns 402. The booking stays unpaid (`payment_pending`) and can be retried; nothing is confirmed.
- **Expiry:** an unpaid hold expires after 35 minutes. The slot, promotion and gift-card amounts are released.
- **Late payment:** if a payment arrives after expiry, the slot, promotion and gift card are all taken back, or the payment is refunded automatically.
- **Cancellations:** paid bookings are refunded automatically through the original provider, and gift-card amounts go back onto the card.
- **Fully covered by gift cards:** the booking is confirmed immediately, with no payment provider involved.
- **Gift-card purchases** reuse the same verified payment paths (generic PayPal order and Stripe session helpers).

---

## 9. Admin dashboard changes

- **Aktionen:** list with status (live/scheduled/ended/inactive), usage and discount totals; a form with 9 seasonal templates and a live banner preview in de/en/pl; redemptions per promotion; activate/deactivate; delete only when unused.
- **Gutscheine:** totals, search by code, email or name; detail page with full code, ledger and payments; block, adjust, resend, issue.
- **Auswertungen:** booking conversion, revenue before and after discounts, paid with gift cards, promotion redemptions and discount total, new customers and welcome offers used, gift cards sold, redemption %, and per-campaign performance.
- **Einstellungen:** VAT rate and a gift cards section.
- **Bookings:** price breakdown card.
- **Dashboard:** marketing teaser.

---

## 10. Security improvements

- **Welcome offer:** abuse protection (phone, mailbox and address markers) and atomic promotion counting under a per-customer lock.
- **Gift cards:** codes are 12 random characters from a 32-character alphabet (≈ 60 bits). Balance checks are rate-limited and expose only the last 4 characters. All balance changes are conditional atomic updates recorded in the ledger.
- **Admin input:** promotion images must be `https://` or a site path; CTA links must be site paths (no `//` external redirects).
- **Website headers:** security headers added and `X-Powered-By` removed.
- **Rate limits:** a test-only bypass, active only with `NODE_ENV=test` plus `DISABLE_RATE_LIMIT=1`.
- **Tests:** they refuse to run against the real database (the database name must contain test/e2e/load, and the URI must differ from `MONGODB_URI`). They never send email and use PayPal/Stripe mocks.

---

## 11. Automated testing results (executed)

| Suite | Checks | Result |
|---|---|---|
| Unit (`npm test`) | 14 | 14 passed |
| E2E: booking + Stripe (fake Stripe API) | 45 | passed |
| E2E: open-job dispatch | 27 | passed |
| E2E: cleaner profile, messages, payouts, PayPal | 51 | passed |
| E2E: settings, availability windows, concurrency, cash, password reset, admin accounts | 53 | passed |
| E2E: verification, welcome offer, coupons, gift cards, PayPal success/failure/duplicates/refund, admin permissions | 64 | passed |
| **Total** | **254** | **all passed** |

The suites cover the areas in your list: customer authentication and email verification, the first-booking discount, pricing and extra costs, the seasonal campaign, coupon redemption, gift card purchase, full and partial redemption, payment success and failure, duplicate payments, booking creation and cancellation, and admin permissions.

**Not included:** browser end-to-end tests (e.g. Playwright). These need a browser download and test accounts; they are recommended as the next step (§14).

---

## 12. Load testing: 10 and 20 concurrent users (executed)

**Setup:**
- Machine: Apple M3, 8 cores, 8.6 GB, Node 22.22.3. Your dev servers were running on the same laptop, so expect some noise.
- Test API: a separate process and test database seeded with 40 customers, 30 cleaners and 30 days of 07:00–20:00 windows.
- PayPal mock; no emails, no real payments.
- Next.js production build (`next start`); 15 s per scenario.

**Tool and re-running:** `server/tests/load/load-test.mjs`, run with `MONGODB_TEST_URI=… FRONTEND_URL=… npm run test:load`.

**Results after the optimisations (run 2026-11-20 20:04):**

| Users | Scenario | Requests | Req/s | Avg | Median | p95 | p99 | Errors |
|---|---|---|---|---|---|---|---|---|
| 10 | Services / pricing / promotions | 66,428 | 4,429 | 2.3 ms | 1.9 | 4.9 | 6.9 | 0 % |
| 10 | Availability (days + times) | 65,521 | 4,368 | 2.3 ms | 1.9 | 4.4 | 6.2 | 0 % |
| 10 | Quote (coupon + gift card) | 10,754 | 717 | 14.0 ms | 13.3 | 20.6 | 26.3 | 0 % |
| 10 | Coupon / gift card validation | 19,343 | 1,290 | 7.8 ms | 6.9 | 14.7 | 18.9 | 0 % |
| 10 | Booking creation (cash + PayPal session) | 1,151 | 77 | 130.5 ms | 119.7 | 232.1 | 280.0 | 0 % |
| 10 | Cleaner open jobs | 1,084 | 72 | 139.0 ms | 128.8 | 212.6 | 343.6 | 0 % |
| 10 | Homepage / booking / gift cards / prices (Next.js) | 2,057 | 137 | 73.2 ms | 69.3 | 110.5 | 142.4 | 0 % |
| 20 | Services / pricing / promotions | 62,602 | 4,174 | 4.8 ms | 4.2 | 9.6 | 13.0 | 0 % |
| 20 | Availability | 59,202 | 3,947 | 5.1 ms | 4.1 | 8.7 | 11.8 | 0 % |
| 20 | Quote | 10,287 | 686 | 29.2 ms | 28.1 | 40.8 | 54.2 | 0 % |
| 20 | Coupon / gift card validation | 13,937 | 929 | 21.5 ms | 18.3 | 47.6 | 79.7 | 0 % |
| 20 | Booking creation | 1,044 | 70 | 289.6 ms | 272.1 | 464.1 | 544.6 | 0 % |
| 20 | Cleaner open jobs | 991 | 66 | 305.9 ms | 301.3 | 417.8 | 474.4 | 0 % |
| 20 | Homepage etc. (Next.js) | 1,742 | 116 | 172.4 ms | 161.6 | 279.7 | 352.7 | 0 % |

**Booking conflicts:** about 0.1 % of booking requests got 409, meaning "this time was just taken". That is the correct answer under contention, not an error.

**Resources (API process):**
- CPU averaged 86–105 % of one core, i.e. Node's single thread was saturated by the load generator, as intended.
- **Heap after a forced garbage collection: 34.6 MB before → 39.9 MB after about 3,000 bookings. No memory leak.** Process memory (RSS) peaked at about 600 MB during the open-jobs scenario because Node returns memory lazily; it fell back to 28 MB.

**Database:** 17 operations took over 20 ms during the run. Almost all were the short-lived booking locks (a write conflict when many bookings hit the same day), which is expected under artificial contention. There were no collection scans.

---

## 13. Before and after (measured on the same setup)

| Metric (20 users unless noted) | Before | After |
|---|---|---|
| Availability, req/s | 67 | **3,947** |
| Availability p95 | 492 ms | **8.7 ms** |
| Booking creation, req/s / p95 | 29 / 1,224 ms | **70 / 464 ms** |
| Cleaner open jobs, req/s / p95 | 34 / 901 ms | **66 / 418 ms** |
| Cleaner open jobs p95, 10 users (first dry run, before `.lean()`) | 588 ms | **213 ms** |
| Open-job matching, 100 open jobs (micro-benchmark) | 44–116 ms | **10–26 ms** |
| Homepage (Next.js) p95 | 596 ms | **280 ms** |
| Homepage images | 3 × hotlinked from pexels.com | 3 × local, 69–89 KB, hero preloaded, others lazy |

"Before" is the run at 19:59, immediately before the availability cache and index changes (same data and settings). Part of the homepage difference is probably measurement noise from other processes on the laptop.

---

## 14. Remaining issues and recommendations

1. **Not clicked through in a browser yet.** All new screens compile, build, return 200 in DE/EN/PL, and the APIs behind them are tested. Please click through the checkout with codes, the gift-card purchase, the email links and the admin screens once.
2. **PayPal is in sandbox mode.** For live payments, set live keys and `PAYPAL_MODE=live`. Stripe is optional (`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`).
3. **No PayPal webhook.** If a customer approves a payment at PayPal and then closes the browser before returning, the order is never captured. No money moves and the hold expires. A PayPal webhook would capture these too.
4. **Tax treatment needs confirmation:** confirm the VAT treatment of discounts and gift cards, and the 19 % rate, with your tax adviser.
5. **Login token storage:** move the token from `localStorage` to an httpOnly cookie and add a Content-Security-Policy (needs nonce support for the inline scripts in `app/layout.tsx`).
6. **Browser end-to-end tests:** add Playwright tests for the customer journey.
7. **Existing customers aren't verified.** Customers registered before today have `emailVerified = false`. They see a banner with a resend button, so no action is needed unless you want to email them.
8. **Template dates in admin are fixed.** Black Friday and Easter don't follow each year's real dates; adjust them when creating a campaign.
9. **Booking throughput under extreme contention.** Booking creation is serialised per day and per customer to prevent overbooking and double spending. That handles about 70 bookings/s on one process, far beyond the expected load. For more, run several API processes; the locks work across processes.
10. **Unused dependencies** (§1) can be removed in a cleanup.

---

## 15. Deployment

1. **Backend (`server/`):** `npm ci && npm start` (or PM2 or systemd), with Node 20+ and MongoDB 6+. On start the server loads settings, creates the default promotions once, and starts the background jobs: hold expiry, unassigned-job alerts, gift-card delivery and expiry, and settings refresh.
2. **Frontend:** `npm ci && npm run build && npm start`, with `API_PROXY_TARGET` set to the API URL (or `NEXT_PUBLIC_API_URL`).
3. **Reverse proxy (Caddy/Nginx):** HTTPS; set `TRUST_PROXY=1` so rate limits see real client IPs.
4. **Stripe (if used):** register the webhook `POST /api/v1/payments/webhook`.
5. **Tests before each release:**
   - Start a separate MongoDB, e.g. `mongod --dbpath /tmp/fiduxa-test --port 27999`.
   - `cd server && npm test && MONGODB_TEST_URI=mongodb://127.0.0.1:27999 npm run test:e2e`.
   - Optionally `npm run test:load`.

---

## 16. Environment variables and credentials

| Variable | Purpose |
|---|---|
| `MONGODB_URI`, `JWT_SECRET`, `BANK_DETAILS_ENCRYPTION_KEY` | Required |
| `PUBLIC_SITE_URL` | Website origin for links in emails and payment redirects (e.g. `https://fiduxa.de`) |
| `CLIENT_URL` | Allowed browser origins (CORS) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ADMIN_NOTIFICATION_EMAIL` | Email (verification, gift cards, bookings) |
| `PAYPALAPIKEY`, `PAYPALSECRET_KEY`, `PAYPAL_MODE` (sandbox\|live) | PayPal |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe (optional) |
| `VAT_RATE` (default 0.19), `HOURLY_RATE_CENTS` (default 2500) | Defaults; admins can override both in Einstellungen |
| `WORKER_HOURLY_RATE_CENTS`, `WORKER_PAYOUT_DELAY_DAYS` | Cleaner pay defaults |
| `TRUST_PROXY` | Set to 1 behind a reverse proxy |
| Tests only: `MONGODB_TEST_URI`, `LOAD_DURATION`, `LOAD_USERS`, `FRONTEND_URL`, `LOAD_PORT` | Test settings |

**External accounts you need to provide:** live PayPal keys (for real payments), Stripe keys (optional), and a production SMTP account. Your current Gmail SMTP works for testing; for production volume, a transactional mail service is recommended.
