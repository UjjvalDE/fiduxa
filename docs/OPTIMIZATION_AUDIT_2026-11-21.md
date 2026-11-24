# Fiduxa optimization & testing round — audit (21 Nov 2026)

Baseline: 329 e2e + 14 unit checks green; prior load test and security checks documented in FIDUXA_AUDIT_AND_DELIVERY_REPORT.md and PAYMENT_TESTING_REPORT.md.

## Findings (to fix in this round)

| # | Area | Finding | Severity |
|---|---|---|---|
| 1 | Auth | JWT (24 h expiry ✓) stored in **localStorage** (`fiduxa_token`) — readable by any XSS; spec requires HttpOnly cookies and no localStorage | High |
| 2 | Auth | **No server-side logout** — logout only deletes the local token; the JWT stays valid until expiry | Medium |
| 3 | Auth | Session restore only runs when a local token exists (`refresh()` skips `/auth/me` otherwise) — fine today, breaks once tokens leave localStorage | Medium |
| 4 | Promotions | Christmas campaign (XMAS10) seeded + live with hero/banner placements — must be fully removed | Required change |
| 5 | Promotions | Welcome offer advertised in too many places: homepage offer card, compact hint on **every** booking step (wizard aside), konto **layout** (= every account page) | Required change |
| 6 | Promotions | Checkout welcome prompt lacks an explicit "continue without discount" choice | Low |
| 7 | Services | Deep cleaning and move-out cleaning behave identically to home cleaning: same extras, same duration, same price — selecting a different service changes nothing but the label | High |
| 8 | Services | Extras are not validated against the service (any extra accepted for any household service) | Medium |
| 9 | Booking | **No booking editing** for customers (only cancel) or admins (only status/assign/notes) — spec requires editable date/time/duration/extras with recalculation, validation and history | Feature gap |
| 10 | Feedback | No post-cleaning feedback flow: no "how was it" email, no actual-duration confirmation (customer or cleaner), no duration-mismatch flag, no recurring keep-cleaner preference | Feature gap |
| 11 | Performance | `GET /admin/commission` runs per-worker count queries in a loop (N+1: 4 queries × workers) | Medium |
| 12 | Email | Completion status email exists; no duplicate-protection flag for a future feedback email (to add with the feature) | Low |

## Verified healthy (no action)

- Server-side pricing/quotes with `expectedPayableCents` guard (409 PRICE_CHANGED), promotion/gift-card reservation + release, payment flows (Stripe signed webhook, PayPal server-side capture, cash), payout settlement with per-worker locks, commission tiers with immutable per-booking records.
- Role middleware on all admin/worker routes (403s covered by tests); customer booking queries always filter by `customer: req.user._id` (no IDOR found); IBANs AES-GCM encrypted; rate limits on auth endpoints.
- Welcome offer is already opt-in server-side — it never auto-applies; it only applies when the customer submits their personal code. Duplicate/abuse protection: one per customer, identity checks (phone/mailbox with gmail normalization/address), atomic usage counting.
- The booking draft, i18n (de/en/pl), availability cache + hold expiry, index coverage from sync-indexes.

Fix log and test results: see OPTIMIZATION_REPORT_2026-11-21.md (written at the end of this round).
