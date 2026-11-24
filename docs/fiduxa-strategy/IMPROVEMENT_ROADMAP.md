# Improvement Roadmap

*Scores 1–10: customer value · business value · feasibility · simplicity · risk reduction. Class: MUST / SHOULD / NICE / FUTURE / NOT RECOMMENDED. Refs point to BUG_REGISTER (B-xx) and NEW_IDEAS (I-xx).*

## Stage 0 — Decisions before any of the below (no code)

| Decision | Ref | Why first |
|---|---|---|
| Legal/employment model of cleaners | B-01, Q1 | Changes contracts, onboarding, invoicing, even the commission concept |
| VAT basis and target margin | B-02, Q2 | Determines whether the 10–25 % ladder is viable |
| Cancellation & late-fee policy | B-11, Q3 | Needed before launch marketing |
| Recurring semantics (pay per occurrence, pause rules) | I-01, Q4 | Shapes the biggest feature |
| Availability model (capacity vs cleaner-driven) | B-05, Q5 | Shapes dispatch and the wizard |

## Stage 1 — Immediate (launch blockers, ~3 weeks)

| Item | Ref | Scores (C/B/F/S/R) | Class |
|---|---|---|---|
| Deploy backend properly: Docker, hosting, secret manager, CI running the suites, rotate keys | B-20 | 6/9/9/7/10 | MUST |
| Monitoring: Sentry + structured logs + uptime + 3 SLO alerts | B-17 | 5/8/10/9/9 | MUST |
| Email outbox with retry and admin send log | B-15, I-17 | 8/8/9/8/9 | MUST |
| Automatic invoices + yearly § 35a statement | B-04, I-04 | 9/9/9/7/8 | MUST |
| No-show protection (check-in deadline → alert + re-offer) | B-13, I-10 | 9/9/9/8/9 | MUST |
| Manual booking/customer creation for admins | B-07, I-16 | 6/8/9/8/6 | MUST |
| GDPR delete/export | B-09 | 6/8/9/8/9 | MUST |
| Cleaner document upload + verification checklist | B-10 | 8/8/9/8/8 | MUST |
| PayPal webhook | B-14 | 6/7/9/8/7 | MUST |
| Playwright smoke tests (wizard, checkout, mobile) | B-25 | 5/7/9/7/8 | MUST |
| Admin 2FA | B-21 | 3/7/9/8/8 | SHOULD (before real money) |

## Stage 2 — Short term (after launch decisions, ~4–6 weeks)

| Item | Ref | Scores | Class |
|---|---|---|---|
| Recurring series engine | I-01 | 10/10/8/4/7 | MUST |
| Preferred-cleaner priority window | I-02 | 9/9/9/7/7 | MUST |
| Tiered late-cancellation fee + cleaner compensation + online late cancel | B-11 | 7/9/9/8/8 | MUST (after Q3) |
| Partial refunds & price-delta settlement | B-08, I-18 | 7/8/8/6/8 | SHOULD |
| Availability from cleaner supply (at least a supply-vs-demand admin view) | B-05, I-20 | 8/9/7/5/9 | SHOULD |
| Published reliability rules + strikes | I-11 | 6/8/9/8/8 | SHOULD |
| Weekly payouts | I-12 | 8/7/10/9/5 | SHOULD (after Q9) |
| Household profile + one-click rebook | I-03 | 8/8/9/8/5 | SHOULD |
| Price-split transparency block | I-05 | 7/7/10/10/5 | SHOULD |
| District SEO pages | I-24 | 5/8/10/9/3 | SHOULD |
| Sliding session renewal | B-18 | 6/4/10/10/4 | SHOULD (after Q10) |

## Stage 3 — Medium term (2–4 months)

| Item | Ref | Class |
|---|---|---|
| Move-out "Übergabe-Check" package | I-06 | SHOULD |
| Distance-aware job offers | I-13 | SHOULD |
| Duration adjustment workflow | I-19 | SHOULD |
| Referral programme | I-07 | SHOULD |
| Support inbox (tickets with status) + Claude triage drafts | I-21 | NICE |
| Duration-estimate calibration | I-22 | SHOULD once real data exists |
| Mentor job for newcomers | I-14 | NICE |
| Tips | I-09 | NICE |
| Off-peak discounts | I-08 | NICE |

## Stage 4 — Long term

| Item | Ref | Class |
|---|---|---|
| Property-manager portal (B2B invoicing, multi-unit) | I-23 | FUTURE |
| Phone verification / e-ID for cleaners | B-10 | FUTURE (paid provider) |
| Second city | — | FUTURE — only after Berlin unit economics are proven |
| Customer-facing AI assistant | — | FUTURE / NOT RECOMMENDED until a knowledge base and ticket history exist |

## Not recommended

- Microservices, Kubernetes, message brokers: volume does not justify them; a monolith + worker process is enough for years.
- GPU/ML infrastructure for matching or forecasting: aggregation queries and rules outperform at this scale.
- Dynamic surge pricing: damages trust in a market where fixed prices are the selling point.
- A native mobile app before the web app has proven retention: the responsive web app + PWA install covers the need.
- Dark-theme admin redesign: cosmetic; defer.
