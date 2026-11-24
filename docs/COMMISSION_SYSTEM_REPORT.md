# Fiduxa Smart Commission & Cleaner Trust System — Implementation Report

*Implemented 21 Nov 2026. All money in integer cents; no floating-point finance.*

## 1. What already existed (audit result)

| Area | Found |
|---|---|
| Reviews | One verified review per completed booking (unique DB index), 60-day window, only the booking's customer, admin hide/show, low-rating admin alert |
| Rating stats | `getWorkerStats`: average rating, review count, reliability % (completed ÷ (completed + handed back)), punctuality, repeat customers |
| Cleaner pay | Hourly model (€18/h default, per-cleaner override), `workerPayout` snapshot per booking with gross/commission, 30-day eligibility, cash offsets |
| Payouts | Settlement flow (bank + PayPal Payouts), per-worker lock, refund → hold, payout history |
| Infrastructure | Centralized admin settings with in-memory apply, audit-log service, role middleware, zod validation |

What was missing: tier logic, percentage-based pay, trust score, review disputes, commission configuration/override, admin commission dashboards.

## 2. Commission calculation

- **Base** = `pricing.totalCents`: what the customer pays for the job — after promotions and recurring discounts, **including VAT, before gift-card redemption** (gift cards are a payment method, not a discount). Extras are part of the total. Tips do not exist in the product; payment-provider fees are borne by Fiduxa and are not deducted from cleaners.
- **Cleaner pay** = `gross − round(gross × pct / 100)`; **Fiduxa commission** = the remainder. Example: €100 job → Diamond cleaner €85 / Fiduxa €15; new cleaner €80 / €20.
- The `%`, tier key and basis are **snapshotted immutably on the booking** at completion. Tier changes, config changes and overrides apply to future completions only — history is never rewritten (verified by test).
- Legacy hourly model remains available: Einstellungen → Provision nach Bewertung → "Stundenlohn-Altmodell".

## 3. Tiers (defaults — all configurable in Admin → Einstellungen)

*Updated 21 Nov 2026: 25 % → 10 % in 3-point steps so every promotion is clearly worth it. All rates (tiers and manual overrides) are limited to 10–25 %, and each higher tier must be strictly cheaper. Changing the rates recalculates every cleaner's tier immediately; recorded earnings never change.*

| Level | Jobs | Reviews | Rating | Commission |
|---|---:|---:|---:|---:|
| New | 0+ | – | – | 25 % |
| Bronze | 10+ | 8 | 4.50 | 22 % |
| Silver | 25+ | 20 | 4.60 | 19 % |
| Gold | 50+ | 35 | 4.70 | 16 % |
| Platinum | 100+ | 70 | 4.80 | 13 % |
| Diamond | 200+ | 120 | 4.90 | 10 % |

A cleaner must meet **all** requirements of a level; the highest fully-met level applies. Config validation: higher levels must be equally strict or stricter, and commission must not increase upward. Cancelled bookings never count; refunded completed bookings leave the completed count (and their unpaid earnings go on hold). Cleaners can never set their own commission (admin-only APIs, verified 403s).

## 4. Trust score (0–100, internal ranking aid — never sets commission)

`rating (40) + review volume (25) + job volume (20) + reliability (15)`
- Rating scaled from 3.0→5.0 and dampened until ~10 reviews exist (a 5.0 from 3 reviews cannot dominate).
- Volumes are log-scaled against the Diamond thresholds (diminishing returns, no cap cliff).
- Reliability scaled 50 %→100 %; neutral 7.5 when unknown (new cleaners are not punished).
Verified: 3×5★ newcomer ≈ 23 points < solid Gold-level cleaner < proven Diamond-level ≈ 90+.

## 5. Recalculation & audit

Tier recomputed on: job completion, review created, review hidden/unhidden, dispute resolved, override changed, settings saved (lazily on next read) and a **daily reconciliation timer**. Every tier change and every override is written to the audit log (admin, before, after, reason, timestamp).

## 6. Review disputes

Cleaner contests a review once (`POST /worker/reviews/:id/dispute`, reason ≥ 10 chars) → office notified → admin approves ("complaint upheld": review hidden, rating and tier recalculated) or rejects (review stands). Full state visible to both sides.

## 7. New / changed API

Worker: `GET /worker/performance` · `GET /worker/reviews` · `POST /worker/reviews/:id/dispute`
Admin: `GET /admin/commission` (filters: tier, minRating, search, sort) · `GET /admin/commission/workers/:id` · `GET /admin/commission/report?from&to&format=csv` · `PATCH /admin/workers/:id/commission-override` (mandatory reason) · `PATCH /admin/reviews/:id/dispute` · settings `workerPay.payModel` + `workerPay.commissionTiers`
Changed: `POST /customer/bookings/:id/review` and review moderation now refresh the tier; `recordWorkerEarning` computes commission-based pay.

## 8. Database changes (indexes synced on the live DB)

- `users.workerCommission { tierKey, commissionPct, computedAt, override { commissionPct, reason, admin, at } }`
- `bookings.workerPayout` + `basis ("commission"|"hourly")`, `commissionPct`, `tierKey` (immutable snapshot)
- `reviews.dispute { status open|approved|rejected, message, openedAt, resolvedAt, adminNote }` + sparse index
- `settings.workerPay` + `payModel`, `commissionTiers` (6 tiers)
- No new collections — the per-booking `workerPayout` is the permanent commission transaction record; audit entries live in the existing audit log.

## 9. Frontend

**Cleaner** (`/worker/leistung`, nav "Leistung", plus a tier card on /worker/verdienst): tier badge, effective %, "you receive X %", star rating, verified reviews, completed cleanings, reliability, trust bar, next-tier card with **three separate progress bars** (never claims only one requirement remains), full tier ladder, lifetime earnings/commission totals, own reviews with dispute dialog. de/en/pl, mobile-first.

**Admin** (`/admin/provision`, nav "Provision"): totals tiles, search/tier filter/sort, CSV export, responsive cleaner table (tier badge, effective % with "manuell" chip + reason, rating, reviews, jobs, reliability, trust bar, Fiduxa commission), row detail with next-tier progress and the immutable transaction list, override dialog (mandatory reason, remove option). Einstellungen: "Provision nach Bewertung" section (pay-model radio + 6-row tier table with mirrored validation). Bewertungen: "Angefochten" tab with approve/reject + note.

## 10. Test results

New suite `commission-tiers.e2e.mjs` — **46 checks, all pass**, covering spec scenarios 1–18:
tier matrix for every level (1–7), 200 jobs/too few reviews (8), many reviews/few jobs (9), low rating (10), rating decrease demotes (11), duplicate completion (12), duplicate review (13), cancelled (14), refunded (15), override incl. missing-reason 422 and history integrity (16, 17), 3-way concurrent completion → one record (18), plus: trust-score shape, dispute lifecycle (open → approved hides + recalculates, double-resolve 409), config change applies to future bookings only, invalid tier ladder rejected, CSV export, and 4 permission checks (cleaner/customer → 403).

Existing suites updated to the commission pay model (new cleaner: €75 job → €60 pay / €15 commission instead of hourly €54/€21).

**Full run (21 Nov 2026): all 7 e2e suites pass — 329 checks — plus 14 unit tests.** (stripe 45 · cleaner profile 51 · commission 46 · dispatch 27 · payout settlement 33 · promotions/gift cards 74 · settings/cash/auth 53.) Full TypeScript check and ESLint clean; live smoke: /admin/commission serves the real cleaner (tier "new", 20 %, trust score) and all new pages render in de/en/pl.

## 11. Remaining issues & recommendations

1. **Partial refunds** don't exist in the platform (admin refunds are full) — commission reversal for partial refunds is therefore out of scope; a full refund holds the cleaner's unpaid earnings and removes the job from tier counting.
2. **Existing cleaners** keep historical hourly records untouched; their future jobs pay by tier. If you prefer the old model, switch Einstellungen → "Stundenlohn-Altmodell".
3. Fake-review protection = verified-booking-only + one-per-booking + admin moderation + dispute flow + the welcome-abuse identity checks; dedicated anomaly detection (e.g. same-IP clusters) would be a future step.
4. Tier thresholds/percentages are business decisions — review the defaults before launch.
