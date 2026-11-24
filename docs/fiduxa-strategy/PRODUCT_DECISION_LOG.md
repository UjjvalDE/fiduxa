# Product Decision Log

*Append-only. Decisions already taken in working sessions are recorded with their date; pending items live in OPEN_QUESTIONS.md until decided.*

| ID | Date | Topic | Options | Pros / cons | Decision | Reason | Status |
|---|---|---|---|---|---|---|---|
| D-001 | 2026-11-18 | Household booking flow | (a) admin quotation; (b) instant booking in published slots at a fixed price | (b) fewer steps, instant confirmation; needs capacity planning | **(b) instant booking**; B2B stays quote-based | Conversion and simplicity | Implemented |
| D-002 | 2026-11-19 | Cleaner assignment | (a) admin assigns; (b) open job board, first to accept | (b) scales without admin; fairness/quality concerns | **(b) + admin override** | Operations with one admin | Implemented (ranking/priority pending, Q5) |
| D-003 | 2026-11-20 | Pricing | Base 25 €/h, extras add time, full-day windows, cash option | — | As stated | Owner request | Implemented |
| D-004 | 2026-11-20 | Promotions | Welcome 10 % as personal single-use code, emailed after verification | Opt-in avoids silent discounts | Personal codes, opt-in at checkout only | Owner request + abuse control | Implemented |
| D-005 | 2026-11-20 | Payments in development | Live PayPal vs sandbox | Live = real money risk | **Sandbox only** until deployment; live keys stored but unused | "No real money" rule | Implemented |
| D-006 | 2026-11-20 | Cleaner pay model | (a) hourly 18 €/h; (b) rating-based commission share | (b) rewards quality, needs tier engine | **(b) commission model**, hourly kept as a switch | Owner request (Smart Commission) | Implemented |
| D-007 | 2026-11-21 | Commission ladder | 20→15 % (1-pt steps) vs 25→10 % (3-pt steps) | Bigger steps motivate; 10 % may be loss-making under full VAT | **25/22/19/16/13/10 %**, hard limits 10–25 % | Owner request; margin impact flagged → Q2 | Implemented |
| D-008 | 2026-11-21 | Sessions | localStorage JWT vs HttpOnly cookie, 24 h | Cookie safer; hard 24 h expiry hurts UX | **HttpOnly cookie, 24 h absolute** | Owner spec | Implemented (sliding renewal open, Q10) |
| D-009 | 2026-11-21 | Christmas campaign | keep / remove | — | **Removed entirely**; campaign system stays generic | Owner request | Implemented |
| D-010 | 2026-11-21 | Finance VAT basis | full price vs commission only | Decides the margin | **Open** — default "full" shown with a switch | Needs tax adviser | → Q2 |
| D-011 | 2026-11-21 | Homepage trust claims | copy competitor claims vs verified-only | Legal (UWG) risk if untrue | **Only verified claims**; § 35a with conditions; no insurance claim | Honesty / law | Implemented |
| D-012 | 2026-11-21 | Cleaner vetting at application | CV optional, permits adapted to Germany | — | Application form + admin invite | Owner request | Implemented (document verification open, Q6) |
| D-013 | 2026-11-21 | Strategy mode | implement everything vs discuss first | — | **Discussion-first for business/architecture changes**; obvious bugs may be fixed directly | Owner instruction (this brief) | Active |
| D-014 | 2026-11-21 | Work mode for the strategy backlog | sequential vs parallel agent packages | parallel = faster, more tokens; split by importance | **Six parallel packages (A–F), model strength by importance**; tax/legal items (Q1, Q2) explicitly deferred by the owner | Owner instruction ("work on all suggestions; tax work in a few weeks") | In progress |
| D-015 | 2026-11-21 | Cancellation policy (Q3) | Helpling-like tiers vs Batmaid-like window vs none | — | **Default adopted:** free > 24 h, 50 % < 24 h, 100 % < 4 h; cleaner receives 80 % of the fee; online cancel always possible | Owner approved recommendations as reversible defaults; all values are admin settings | In progress (package D) |
| D-016 | 2026-11-21 | Recurring bookings (Q4) | upfront vs per-occurrence payment | — | **Default adopted:** per-occurrence payment, 14 days ahead, pause/skip/end free until the cutoff, discount per occurrence, no clawback, preferred cleaner gets 24 h priority | Same | In progress (package B) |
| D-017 | 2026-11-21 | Availability model (Q5) | windows vs cleaner-driven | — | **Deferred**: keep windows; no-show detection + supply view first | Larger change; revisit after launch data | Open |
| D-018 | 2026-11-21 | Cleaner verification (Q6) | profile look vs documents vs e-ID | — | **Default adopted:** ID + work-permit upload, admin verification required before approval; no insurance claim until a policy exists | Same | In progress (package E) |
| D-019 | 2026-11-21 | Cash policy (Q7) | remove / limit / keep | — | **Default adopted:** cash ≤ 150 €, Bronze+ cleaners only, customer confirms amount, cash blocked below −100 € balance | Same | In progress (package D) |
| D-020 | 2026-11-21 | Bathrooms in pricing (Q8) | m² only vs bathrooms factor | — | **Default adopted:** +20 min per bathroom beyond the first (admin setting) | Same | In progress (package F) |
| D-021 | 2026-11-21 | Payout cadence (Q9) | 30 days vs weekly | — | **Default adopted:** 7-day eligibility (weekly settlement); fast 50 % payout eligibility for Silver+ as a setting, no auto-transfer | Same | In progress (package D) |
| D-022 | 2026-11-21 | Session policy (Q10) | hard 24 h vs sliding | — | **Default adopted:** admins 24 h absolute; customers/cleaners 7 days sliding; optional admin TOTP 2FA | Same | In progress (package E) |
| D-023 | 2026-11-21 | Invoices before the tax decision | wait vs build configurable | Waiting blocks § 35a; building assumes Fiduxa as seller | **Build now with configurable issuer/VAT note; revisit after tax advice** | Owner deferred tax work; invoice content stays adjustable | In progress (package C) |
