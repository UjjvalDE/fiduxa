# Fiduxa — Project Overview

*Status date: 21 November 2026. Written from the actual codebase, not from the feature wish-list.*

## 1. Business model

Fiduxa is a two-sided home-cleaning marketplace for Berlin (Germany first, EU later).

| Side | What they do | What they get |
|---|---|---|
| **Customers** (private households) | Book a cleaning online at a fixed price, pay online or in cash, rate the cleaner | Vetted cleaner, no employer duties, transparent price, online management |
| **Cleaners** (independent, approved by Fiduxa) | Apply, get approved, pick jobs from an open job board, complete and get paid 30 days later | 75–90 % of the job price depending on their tier, bank/PayPal payouts |
| **Fiduxa (admin)** | Publishes availability, prices, approves cleaners, settles payouts, handles support | Commission 10–25 % of each job (tier-based) |

**Revenue model today:** commission on completed cleanings only. Gift cards are prepaid balances (revenue on redemption, not sale). No subscription, no B2B revenue yet (business requests are quote-based, manual).

**Legal model (NOT yet decided — see OPEN_QUESTIONS Q1):** the code treats cleaners as independent contractors paid per job, while Fiduxa sets the price, the schedule window and the commission. That combination is exactly what German courts and the EU Platform Work Directive scrutinise. This is the single most important business decision outstanding.

## 2. Technology

- **Frontend:** Next.js 13 (app router), React, Tailwind, shadcn components, three languages (de default, en, pl) via message modules; deployed to Netlify (`netlify.toml`).
- **Backend:** Node 22 + Express 5, MongoDB via Mongoose 9, JWT sessions (HttpOnly cookie, 24 h), zod validation, helmet/cors/rate limits. Hosting of the backend is **not defined in the repo** (no Dockerfile/Procfile) — it currently runs on the developer machine.
- **Payments:** Stripe Checkout (signed webhook), PayPal Orders v2 (server-side capture) + PayPal Payouts for cleaner settlement, cash at the door. Live PayPal keys exist but `PAYPAL_MODE=sandbox`.
- **Email:** Nodemailer/SMTP (Gmail account), fire-and-forget (`trySend`), no queue.
- **Background work:** two in-process `setInterval` timers in `main.js` (holds/gift cards every minute; tier reconciliation + application purge daily).
- **Tests:** 9 e2e suites (≈ 390 checks) + 14 unit tests + a load test harness; all run against an isolated test database with payment mocks.

## 3. Main modules (implemented and verified)

| Module | Status | Notes |
|---|---|---|
| Public site, catalogue, pricing calculator | ✅ | Services: home, deep (×1.4), move-out (×1.6); extras per service |
| Booking wizard → quote → slot → checkout | ✅ | Server-side pricing, PRICE_CHANGED guard, 35-min payment hold |
| Promotions, personal welcome code, coupons, gift cards | ✅ | Welcome is opt-in; Christmas campaign removed |
| Customer account: bookings, edit, cancel, reviews, feedback | ✅ | Edits allowed until 24 h before; no partial refunds |
| Cleaner onboarding (invite → profile → approval), job board, calendar, earnings | ✅ | No ID/document verification, no phone verification |
| Rating-based commission tiers + trust score | ✅ | New 25 % → Diamond 10 %, 3-point steps |
| Payout settlement (bank / PayPal Payouts) | ✅ | 30-day eligibility, hold on refund |
| Admin: dashboard, bookings, customers, cleaners, payouts, commission, finance, settings, promotions, gift cards, reviews/disputes, audit log, applications | ✅ | Admin **cannot** create a booking manually |
| Post-cleaning feedback, duration mismatch flag | ✅ | Flag only — no billing adjustment |
| **Recurring bookings** | ⚠️ **Not really** | `frequency` is a discount tag; no series, no automatic next appointments |
| Invoices (PDF, § 35a) | ❌ | Confirmation email only |
| Support/ticketing | ❌ | Contact form + per-booking Q&A thread + cleaner "report issue" |
| Referral / loyalty | ❌ | — |
| GDPR self-service (delete account, export) | ❌ | — |
| Monitoring / error tracking | ❌ | `morgan dev` logs only |

## 4. Customer types

1. Private households in Berlin (core): one-time and "recurring" home cleaning.
2. Movers/tenants: end-of-tenancy cleaning (×1.6 price factor, highest ticket).
3. Business/offices: quote request only (manual).
4. Gift-card buyers.

## 5. Development stage

Feature-complete MVP+ with strong test coverage, running on a dev machine with a realistic dummy dataset (100 customers, 20 cleaners, 1 350 bookings). **Not production-deployed.** The open items are business/legal decisions and operational hardening rather than missing screens — see IMPROVEMENT_ROADMAP.md and OPEN_QUESTIONS.md.
