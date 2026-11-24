# Fiduxa optimization & testing round — final report (21 Nov 2026)

Companion to OPTIMIZATION_AUDIT_2026-11-21.md (findings). Everything below was implemented, executed and verified in this round. **Final state: 364 e2e checks across 8 suites + 14 unit tests all pass, full TypeScript check clean, ESLint clean, production build passes, load test 25/30 users with 0 % errors.**

## 1. Authentication & sessions (audit #1–3)

- **What was wrong:** JWT in localStorage (XSS-readable), no server-side logout, restore depended on the stored token.
- **Changed:** login/register/password-change now set a **24 h HttpOnly SameSite=Lax cookie** (`fiduxa_session`; Secure in production); `protect` accepts cookie or bearer; new `POST /auth/logout` clears the cookie; the frontend keeps the token **in memory only** (one-time localStorage cleanup), always restores via `/auth/me` (cookie), and calls the logout endpoint. Password changes still revoke all tokens via `tokenVersion`.
- Files: `server/src/utils/session-cookie.js` (new), `auth.middleware.js`, `auth.controller.js`, `user.controller.js`, `auth.routes.js`, `lib/api.ts`, `lib/auth.tsx`.
- **Tested:** e2e (cookie flags incl. Max-Age 86400, cookie-only access, logout → 401) + live against :3100 and through the :3000 proxy. PASS.

## 2. Welcome code & promotions (audit #4–6)

- Christmas campaign: seed removed from the code, live `XMAS10` deactivated, hero/banner no longer served (`/promotions/active` → `[]`); no hard-coded Christmas UI existed in the public site. The generic campaign system (admin "Aktionen") is untouched — the promotions suite now creates its own campaign.
- Welcome offer visibility reduced to exactly: signup email · customer profile page (`/konto/profil`, with available / used ("eingelöst") / expired states) · one checkout prompt with the explicit question and **"Anwenden" / "Ohne Rabatt fortfahren"**. Removed: homepage offer card, per-step wizard hint, konto-layout card. The offer remains strictly opt-in server-side (personal code, one per customer, abuse checks) — unchanged.

## 3. Service selection & filtering (audit #7–8)

- **What was wrong:** Deep/Move-Out behaved exactly like Home cleaning (same price, duration, extras).
- **Changed:** per-service `timeFactor` (deep-cleaning ×1.4, end-of-tenancy ×1.6) in estimate + quote + client preview; service-scoped extras (laundry/ironing/dishes/handles/baseboards = home only; fridge/oven/cabinets not offered where included in the base scope); `GET /extras?serviceId=` filters; quote/booking silently drop extras invalid for the service; the wizard prunes selections and re-derives duration/price on service switch.
- 60 m² normal: home 2 h €50 · deep 3 h €75 · move-out 3.5 h €87.50. Tested in e2e + unit. PASS.

## 4. Booking editing (audit #9)

- **Customer** (`PATCH /customer/bookings/:id` + edit dialog on the booking detail): reschedule (availability-validated), duration, extras, notes; preview + explicit confirm before saving; `expectedTotalCents` guard (409 PRICE_CHANGED); blocked after the cutoff (admin-configurable, default 24 h), for online-paid bookings (duration/extras only — appointment/notes stay editable) and gift-card bookings.
- **Admin** (`PATCH /admin/bookings/:id/details` + edit dialog): everything incl. service/area/condition/customer data; cleaner conflict → 409 `WORKER_CONFLICT` with an explicit forceUnassign confirm (job re-offered, admin notified); `priceDeltaCents` + `paymentUntouched` warning — **paid records are never rewritten**, deltas are settled via the existing refund/cash/invoice tools.
- Repricing reruns the estimate engine, re-derives an applied promotion on the new order value, keeps VAT contained, and updates only still-open payment amounts. Capacity is re-checked inside the day lock (`moveBooking`), double-booking impossible.
- Every edit lands in `booking.changeLog` (who/role/field/old→new; rendered on the admin detail page) and the audit log; customer + cleaner get localized update emails (opt-out per edit for admins).

## 5. Post-cleaning feedback (audit #10, #12)

- Completion sends the one-time "Wie war deine Reinigung?" email (de/en/pl, `feedback.emailedAt` guard — duplicate completions never re-send; cancelled bookings can't trigger it) linking to `/konto/buchungen/:id?feedback=1`.
- The review form now also asks: actual duration (prefilled with planned), "would you recommend?", and — for recurring bookings — same cleaner / different / Fiduxa decides (saved on the customer as `recurringCleanerPreference` and shown to the admin).
- The cleaner reports the actual duration on completion. When both reports differ by > 30 min the booking is flagged (`feedback.durationMismatch`), the office is emailed, and **nothing is ever charged automatically**.
- Admin booking detail shows planned vs. cleaner vs. customer duration with a mismatch badge.

## 6. Performance (audit #11) & UX

- `GET /admin/commission` N+1 fixed (4 aggregations total instead of 4 × workers). Median timings (dev machine, live DB): catalogue/pricing ≈ 2 ms, quote ≈ 6 ms, availability days ≈ 3 ms, admin bookings ≈ 20 ms, admin commission ≈ 22 ms, payouts open ≈ 7 ms.
- Booking wizard: CSS-only step transitions (fade + 4 px slide, ≤ 200 ms, `motion-safe`, no new deps), smoother progress indicator, press feedback on choice cards, slot-grid reveal — nothing blocks input, reduced motion respected.

## 7. Load test (20–30 concurrent users, isolated test DB + mocks)

| Scenario | 25 VU p50 / p95 | 30 VU p50 / p95 | Errors |
|---|---|---|---|
| Catalogue | 7 ms / 19 ms (2 805 rps) | 13 ms / 41 ms | 0 % |
| Availability | 10 ms / 28 ms (1 867 rps) | 12 ms / 33 ms | 0 % |
| Quote engine | 46 ms / 81 ms (494 rps) | 60 ms / 109 ms | 0 % |
| Coupon + gift-card checks | 31 ms / 82 ms | 39 ms / 85 ms | 0 % |
| Full bookings (locks, promos) | 553 ms / 1 016 ms (40/s) | 586 ms / 1 286 ms | 0 % |
| Cleaner open-job board | 495 ms / 700 ms | 645 ms / 948 ms | 0 % |

0 % errors and 0 % business rejects everywhere; all sampled slow queries used indexes (IXSCAN); server RSS peaked ≈ 474 MB, heap stable after GC. Raw report: `server/tests/load/results/load-2026-11-21T15-17-18-622Z.json`. No cleaner can be double-booked (day-lock + conflict checks; verified by tests).

## 8. Security

- Role separation re-verified (customer/cleaner → admin endpoints 403; new endpoints covered). IDOR checks: foreign customers get 404 on reading/editing another's booking. Price manipulation guarded (server-side quotes, PRICE_CHANGED). Tokens no longer in localStorage; cookie HttpOnly + SameSite=Lax; logout revokes the cookie; 24 h max session. Backend enforces every permission — UI gating is cosmetic only.

## 9. Test totals (final run)

| Suite | Checks |
|---|---|
| booking-edit-feedback (new) | 34 |
| booking-payment-stripe | 45 |
| cleaner-profile-messages-payouts | 51 |
| commission-tiers | 46 |
| job-dispatch | 27 |
| payout-settlement | 33 |
| promotions-giftcards | 75 |
| settings-availability-cash-auth | 53 |
| **e2e total** | **364 — all pass** |
| Unit tests | 14 — all pass |

Plus: full `tsc` clean, ESLint clean, production `next build` passes, live page checks de/en/pl green, live cookie-session and commission API smoke tests green.

## 10. Remaining issues & recommendations

1. **Partial online refunds** still don't exist (full refunds only) — price-reducing edits on paid bookings are reported as a delta for manual settlement.
2. New-feature UI strings for the booking-edit server messages are translated (de/pl) in `lib/i18n/api-errors.ts`; a browser click-through of the two new edit dialogs and the feedback form by a human is recommended.
3. Recurring keep-cleaner preference is stored and shown to the office; automatic preferred-cleaner job offers would be a future step.
4. Stripe still runs against test infrastructure only (no keys on this machine); PayPal remains in sandbox per the no-real-money rule.
