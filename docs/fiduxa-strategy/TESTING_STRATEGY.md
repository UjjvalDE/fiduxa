# Testing Strategy

## What exists (run before every change)

| Layer | Command (in `server/`) | Coverage |
|---|---|---|
| Unit | `npm test` | Pricing maths, VAT, discounts, identity normalisation (14) |
| API e2e | `MONGODB_TEST_URI=mongodb://127.0.0.1:27999 npm run test:e2e` | 9 suites, ≈ 390 checks: Stripe (fake server + signed webhook), PayPal mock (orders + payouts), cleaner profile/messages/payouts, job dispatch, payout settlement, commission tiers + finance + dashboard overview, promotions/gift cards, settings/cash/auth, booking edit + feedback + sessions, applications + homepage trust |
| Load | `npm run test:load` (LOAD_USERS=25,30) | Catalogue, availability, quotes, bookings, job board under concurrency; CPU/RSS/slow-query report |
| Dummy data | `npm run seed:dummy` / `:verify` / `:clean` | 49 integrity checks on the realistic dataset |
| Static | `npx tsc --noEmit -p .`, `npx eslint …` | Whole frontend |

Rules that keep tests honest: isolated database only (harness refuses non-test DB names), SMTP and live keys stripped, no real money, date fixtures instead of waiting, midnight-safe cutoffs.

## Gaps to close

| Area | Missing | Plan |
|---|---|---|
| Customer (browser) | Wizard, checkout redirect, booking edit dialog, feedback form, mobile layouts | Playwright suite (6–8 journeys), run against the test stack in CI; mobile viewport variants |
| Cleaner (browser) | Portal pages, job acceptance, completion with cash | Playwright, 3 journeys |
| Admin (browser) | Settle dialog, booking edit, applications invite | Playwright, 3 journeys |
| Payments | Stripe real test mode (no keys on this machine), PayPal sandbox approval page | Add Stripe test keys in CI secrets; keep mocks for logic |
| Database | Migration safety when models change (e.g. series) | Add a `scripts/check-consistency.js` (orphans, status/paid mismatches) runnable in CI and nightly |
| Security | Automated 403/404 sweep across all admin/worker routes | Generate from the router table: every admin route must 403 for consumer/worker |
| Emails | Content assertions | With the outbox, assert queued templates and rendered subjects per flow |
| Regression | Nothing runs automatically | GitHub Actions on push: lint → tsc → unit → e2e; nightly: load (10 users) + consistency check |
| Future features | Recurring series, no-show detection, invoices, partial refunds | Each ships with its own e2e suite and date fixtures |

## Release checklist (per deploy)

1. All suites green in CI; tsc/eslint clean.
2. `seed:dummy:verify` passes on staging; production never seeded.
3. Smoke after deploy: `/health`, `/ready`, login per role, one quote, one cash booking on staging.
4. Watch Sentry and the SLO dashboard for 30 minutes.
