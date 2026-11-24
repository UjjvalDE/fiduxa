# Fiduxa payment-system testing report

*Executed 20 Nov 2026 · Apple M3, Node 22.22.3 · All suites run with `npm test` and `MONGODB_TEST_URI=mongodb://127.0.0.1:27999 npm run test:e2e` in `server/`.*

**No real money moved at any point.** Every suite runs against a throwaway test database (the harness refuses any database whose name lacks `test`/`e2e`/`load` and refuses `MONGODB_URI`), a local **fake Stripe server**, a local **PayPal mock** (Orders + Payouts APIs), and with SMTP and all live keys stripped from the environment — the harness explicitly deletes `PAYPAL_MODE`, `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET_KEY` so tests can never touch the live PayPal account. Test gift cards exist only in test databases that are dropped after each run, so they can never be redeemed in production.

## Scenario results (TEST 1–17 from the specification)

| # | Scenario | Where it runs | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | Booking paid with a test card (Stripe) | `booking-payment-stripe.e2e.mjs` (fake Stripe + signed webhook) | Checkout session created for the server-side amount; signed webhook marks paid and confirms; wrong signature rejected; replay idempotent; amount mismatch flagged | All of that, 45 checks | PASS |
| 2 | Booking paid with PayPal (sandbox/mock) | `promotions-giftcards.e2e.mjs`, `payout-settlement.e2e.mjs` | Order for the payable amount only; capture verified server-side; booking confirmed | Order amount checked (e.g. €42.50 after gift card), capture → confirmed | PASS |
| 3 | Customer purchases a gift card | `promotions-giftcards.e2e.mjs` | Pending card, hidden code, provider order over the full amount; invalid amounts rejected | €75 order created; €12.34 rejected (422); code hidden until paid | PASS |
| 4 | Gift card generated and delivered | same | Unique `FIDX-` code, activation on payment, buyer email, scheduled recipient delivery | Active with €75 balance; delivery correctly scheduled, not sent early | PASS |
| 5 | Gift card used in a booking | same | Balance check, redemption at checkout | €50 card redeemed; €17.50 remainder paid in cash | PASS |
| 6 | Partial redemption updates balance | same | Remaining balance kept | €100 card: €67.50 captured, €32.50 left; empty card refused afterwards | PASS |
| 7 | Remaining amount paid with a test method | same | Payable = total − gift cards; provider charges exactly that | PayPal order 42.50 for a €67.50 total with a €25 card | PASS |
| 8 | Cleaner earnings generated on completion | `payout-settlement.e2e.mjs` | Record with gross, pay, commission, eligibility date | Gross €75, pay €54, commission €21, due = completion + 30 days | PASS |
| 9 | Earnings pending during the waiting period | same | Visible to cleaner as pending, not withdrawable; settlement refused | `pendingCents` 5400, `dueCents` 0; settle → 409 | PASS |
| 10 | Eligible after the configured period | same (date fixture on `dueAt`, no real waiting) | Status flips to eligible ("due") | `dueCents` 5400, job status `due` | PASS |
| 11 | Admin reviews eligible earnings | same | Dashboard shows upcoming and eligible amounts, payout route, gross/commission | Group shows all of it (PayPal target masked) | PASS |
| 12 | Admin settles via sandbox payout | same (PayPal Payouts mock) | Confirmation-gated settle; provider called once; status updated only after provider response | 1 provider batch; payout `paid` with `providerBatchId`/`providerItemId` | PASS |
| 13 | Successful payout updates history | same | Cleaner + admin history with references | Both histories show paid payout + provider refs | PASS |
| 14 | Failed payout leaves earnings unpaid, safe retry | same | DENIED / API error → payout `failed`, earnings released; retry pays once | Both failure kinds released the job; retry paid it exactly once | PASS |
| 15 | No duplicate payouts | same | Repeat and concurrent settlements cannot pay twice | Re-settle → 409 with no new provider call; parallel race → exactly 1 success; `processing` jobs unclaimable | PASS |
| 16 | Refunds/disputes adjust eligibility | same | Refund of a completed job holds its unpaid earnings; admin releases | Refund → `on_hold`; settle refused; after release, bank settlement works | PASS |
| 17 | Unauthorized users blocked | same + `promotions-giftcards.e2e.mjs` | Customers/cleaners cannot reach payout or promotion admin APIs | All → 403 | PASS |

Additional settlement checks beyond the list: slow provider → payout stays `processing` with jobs locked, `refresh` endpoint finalises it; cleaner payout-method onboarding (PayPal email validated, bank requires saved IBAN, admin sees only a masked target); zero/negative amounts refused for PayPal (bank "Verrechnung" instead).

## Full suite summary (all executed, 20 Nov 2026)

| Suite | Checks | Result |
|---|---|---|
| Unit tests (pricing, VAT, codes, identity) | 14 | all pass |
| booking-payment-stripe | 45 | all pass |
| cleaner-profile-messages-payouts | 51 | all pass |
| job-dispatch | 27 | all pass |
| payout-settlement (new) | 33 | all pass |
| promotions-giftcards | 74 | all pass |
| settings-availability-cash-auth | 53 | all pass |
| **Total** | **297** | **all pass** |

## How the requirements are met

- **Server-side amounts only:** every charge uses the server's quote; client price fields are ignored (tested: manipulated fields → server price), and a changed price returns 409 `PRICE_CHANGED`.
- **Webhooks:** Stripe signature verified, retries idempotent, amount mismatches quarantined with an admin alert. PayPal captures are verified against the provider (amount + currency) before anything is marked paid. *(No PayPal webhook yet — see "Open points".)*
- **Declined/cancelled/pending/timeout:** declined → 402, booking stays unpaid and retryable; cancels release slot + promotion + gift cards; async/pending payments keep the reservation; unpaid holds expire after 35 min and release everything; late payments re-take everything or are auto-refunded.
- **Ledger (section H):** gift cards have a full signed ledger with idempotency keys; every customer payment is a `payments` record; payouts carry provider references; earnings store gross/commission/cash; admin corrections require a reason and land in ledger + audit log. All money is integer cents.
- **30-day rule (E):** `WORKER_PAYOUT_DELAY_DAYS` (default 30), changeable in Admin → Einstellungen; tests use date fixtures instead of waiting.
- **Payout statuses (D):** job level `pending → due (eligible) → processing → paid`, plus `on_hold`; payout level `processing → paid | failed` (failed = released for retry, i.e. the spec's FAILED/CANCELLED behaviour).
- **Bank security (G):** IBANs stored AES-GCM-encrypted with only the last 4 digits visible; no bank logins ever collected; PayPal payouts need only the cleaner's PayPal email; payout APIs are admin-only.
- **Environment separation (J):** dev/tests run on sandbox + mocks + isolated DBs; `PAYPAL_MODE=live` with separate live keys is the only way to move real money (currently **sandbox** on this machine); Stripe live keys are simply absent. Never mix the `.env` of two environments; see `server/.env.example`.

## Live end-to-end flow check (20 Nov 2026, dev stack on :3000/:3100)

Run against the running dev backend with real accounts (no mocks, no real money — cash/goodwill paths only):

- **Pricing exact to the cent**: base rate 25 €/h (admin-managed); 60 m² normal = 2 h = 50 €; 120 m² = 100 €; heavy condition ×1.5 = 75 €; extras add time/price (e.g. interior windows + door handles → 75 €); weekly frequency −10 % = 45 €; 19 % VAT correctly contained (7,98 € in 50 €).
- **Promo codes**: `XMAS10` recognised and −10 % applied; invalid code → `not_found`, price unchanged.
- **Personal welcome code (full real flow)**: verified an account through `POST /auth/verify-email` → the server issued the `FX-…` code and sent the welcome email; a **fresh first-time customer** gets 10 % off (50 € → 45 €); a customer **with prior bookings** is refused with `first_booking_only`; someone **else's** code is refused with `not_yours`.
- **Gift cards live**: admin goodwill card issued (20 €), public balance check OK; discount order correct (50 € − 5 € promo − 20 € card = **25 € payable**); real cash booking `FID-2026-00010` confirmed with the full pricing snapshot; card balance drained to 0 and an empty card is refused; manipulated `expectedPayableCents` → **409 PRICE_CHANGED**; customer cancel refunded the gift card to 20 € and released the promotion for reuse.
- Cleanup done: test booking cancelled, test card disabled, throwaway customer deactivated.

All 25 live checks behave correctly (two initially flagged items turned out to be correct platform behaviour: the first-booking-only rule and the empty-card refusal).

## Open points

1. **Stripe runs against a fake server in tests; no Stripe test keys are configured on this machine.** The integration is complete — to click through it in a browser, put Stripe *test* keys (`sk_test_…`) in `server/.env`.
2. **No PayPal webhook:** a customer who approves at PayPal but never returns is not charged (the hold simply expires). A webhook would also capture those.
3. **Live PayPal Payouts** additionally require PayPal's approval of the Payouts product on the business account; sandbox needs none.
4. **Browser verification done at the smoke level:** the full project type check and the production build pass; all key pages (booking, gift cards, admin payouts, admin cleaners, worker earnings, customer gift cards incl. the print view) respond in de/en/pl on the dev server; the admin payouts API serves the new totals (`processingCents`, `grossCents`, `commissionCents`). A manual click-through of the settle dialog with a real cleaner is recommended before go-live.
