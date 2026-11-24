# Fiduxa dummy marketplace dataset

A connected, realistic test dataset for exercising the customer, cleaner and admin roles. Every generated record carries `testData: "fiduxa-dummy-v1"`; nothing else is ever touched or deleted.

## Commands (run in `server/`)

| Command | What it does |
|---|---|
| `npm run seed:dummy` | Generate the dataset. Idempotent: if it already exists, nothing is created and the validation runs instead |
| `npm run seed:dummy -- --reset` | Remove the dataset and rebuild it (deterministic: same data every time) |
| `npm run seed:dummy:verify` | 49 database checks: counts, integrity, overlaps, availability, reviews, tiers, money reconciliation |
| `npm run seed:dummy:clean` | Remove **only** tagged dummy records (incl. their audit entries) |
| `npm run seed:cleaners` / `seed:cleaners:verify` | Same connected dataset (cleaners need customers and bookings); verify output includes the cleaner section |

Safety: the seeder refuses to run when `NODE_ENV=production`, `PAYPAL_MODE=live`, or the database name contains "prod". Source: `server/src/scripts/seed-dummy.js`; tag plugin: `server/src/models/plugins/test-data.plugin.js`.

## Logins

All dummy accounts use the password **`DummyTest#2026`** (hashed with the app's normal bcrypt flow).

- Customers: `kunde.001@dummy.fiduxa.invalid` … `kunde.100@dummy.fiduxa.invalid` (10 of them unverified)
- Cleaners: `reinigung.01@dummy.fiduxa.invalid` … `reinigung.20@dummy.fiduxa.invalid`

The `.invalid` domain never resolves, so no real email can ever be delivered. Phone numbers come from the Bundesnetzagentur range reserved for fiction (+49 30 23125 000–999). Names, streets and bios are fictional.

## What is generated

**Customers (100):** 90 verified, 10 unverified (no bookings). Registration dates fall before each customer's first booking; languages are 80 % de, 12 % en, 8 % pl.

**Bookings for verified customers (1,350):**
- **900 completed** (Dec 2025 to yesterday), 5–18 per customer, average 10.0. Each has start and completion timestamps, the cleaner-reported actual duration (85 %), payment, an immutable commission snapshot, and the one-time feedback email marker.
- **450 upcoming** (the next ~3 months), 1–12 per customer, average 5.0. "Pending" means **confirmed and not yet cleaned**: `payment_pending` holds expire after 35 minutes, so they can't represent future bookings. 12 customers have weekly series (58 bookings), and 30 carry a reschedule entry in their change log.
- Services: home 862 · deep 287 · move-out 261. Prices come from the live estimate engine and settings. 8 % of bookings use the inactive test coupon `TESTSEED10`.

**Extra samples, outside the 1,350:** 40 cancelled, 12 cancelled-and-refunded, and 8 expired payment holds. The platform has no "rejected" status for household bookings; it's a legacy B2B quote status, so none were generated.

**Cleaners (20):**

| # | Category | Rating band | Jobs / reviews / Ø | Tier (real engine) |
|---|---|---|---|---|
| 01 | approved | excellent | 230 / 130 / 4.95 | Diamond 15 % |
| 02 | approved | excellent | 130 / 75 / 4.92 | Platinum 16 % |
| 03 | approved | excellent | 30 / 22 / 5.00 | Silver 18 % |
| 04 | approved | very good | 70 / 42 / 4.81 | Gold 17 % |
| 05 | approved | very good | 120 / 70 / 4.76 | Gold 17 % |
| 06 | approved | very good | 28 / 21 / 4.71 | Silver 18 % |
| 07 | approved | good | 100 / 55 / 4.65 | Silver 18 % |
| 08 | approved | good | 15 / 10 / 4.60 | Bronze 19 % |
| 09 | approved | good | 50 / 32 / 4.63 | Silver 18 % |
| 10 | approved | average | 92 / 50 / 4.46 | New 20 % |
| 11 | approved | average | 20 / 12 / 4.33 | New 20 % |
| 12 | approved | new | 15 / 4 / 4.75 | New 20 % |
| 13–15 | pending approval | new | 0 | — (portal open, jobs locked) |
| 16–17 | inactive (approved, deactivated) | new | 0 | — (login blocked) |
| 18 | suspended | new | 0 | — (login blocked) |
| 19–20 | onboarding incomplete | new | 0 | — (profile checklist open) |

Ratings are computed from 523 real review records (3–5 stars). 2 reviews have open disputes and 1 has a rejected dispute. Commission on each historical job uses the tier the cleaner held **at that moment** (`tierForCounters`, evaluated chronologically), so early jobs of today's Diamond cleaner were paid at 20 %.

**Money (all TEST):** 1,128 payment records (`TEST-PAYPAL-…`, `TEST-STRIPE-…`; cash uses the app's own `cash-<id>` format) and 118 monthly bank payout records (`TEST-AUS-…`, recorded only, no transfers). Totals:
- Revenue: €74,113.75
- Fiduxa commission: €13,535.51
- Cleaner earnings: €60,578.24

Earnings status: 778 jobs paid, 51 due, 66 in the waiting period, 5 on hold.

**Availability:** upcoming bookings are placed **only on days without your own availability windows**, inside tagged test windows (07:00–20:00, capacity 12). Your real calendar stays fully bookable. Every booking respects the cleaner's weekly hours and holidays, with no overlaps (30-minute travel buffer included).

## Validation results (21 Nov 2026)

- `seed:dummy:verify`: **49/49 checks passed**.
- Role tests on the live dev API: **48/48 passed**.
  - All 20 cleaner logins and states. Approved cleaners see only their own jobs, tier, trust score, earnings and payouts; pending and incomplete cleaners are locked out of jobs; inactive and suspended cleaners can't log in.
  - All 90 verified customers see exactly their own bookings. Cross-customer and cross-cleaner access returns 404; cleaner access to admin returns 403.
  - Admin views: dashboard, customers, cleaners and applications, commission ranking and filters, payouts, booking filters, disputes, payments. A suspend → reactivate roundtrip and customer/admin booking edits also work.
- Automated suites after the model changes: 364 e2e + 14 unit checks pass.

Notes:
- The admin commission overview also lists the two deactivated cleaners, because they're still approved.
- Running ~200 rapid API calls trips the general rate limit (300 requests per 15 minutes) by design.
