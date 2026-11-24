# New Ideas for Fiduxa

*Each idea: what it is, the problem it solves, business benefit, feasibility, complexity, dependencies, effort, priority. Effort = developer-days with the current codebase. Priority uses the classes from IMPROVEMENT_ROADMAP.md.*

## Customer experience

**I-01 · Recurring series engine ("Mein Putzplan")**
Weekly/bi-weekly/monthly bookings become a series: the next appointment is created automatically N days ahead, the customer's preferred cleaner is offered it first, the customer can pause, skip or move a single occurrence, and payment runs per occurrence. *Problem:* today "weekly" is only a discount on one booking. *Benefit:* recurring revenue, the retention engine every competitor has. *Feasibility:* high (booking model, dispatch and payments exist). *Complexity:* medium–high. *Deps:* Q4 (payment per occurrence vs upfront), I-02. *Effort:* 10–15 days. **MUST HAVE.**

**I-02 · Preferred-cleaner priority window**
When a customer rebooks (or a series creates an occurrence), the cleaner they chose "same cleaner" for gets the job offer exclusively for 24 h before it goes to the board. *Problem:* keep-cleaner preference is stored but never used. *Benefit:* loyalty on both sides; competitors advertise "same cleaner every time". *Feasibility:* high. *Complexity:* low–medium. *Effort:* 3–4 days. **MUST HAVE** (with I-01).

**I-03 · Household profile & one-click rebook**
Saved home profile (size, condition, extras, access notes, pets, key handling, products) → "Nochmal buchen" creates a prefilled quote with the next free slot. *Benefit:* fewer steps, more repeat bookings. *Effort:* 3 days. SHOULD HAVE.

**I-04 · Automatic invoice + yearly § 35a statement**
PDF invoice on payment (sequential numbers, VAT shown, stored on the booking, downloadable), plus a yearly "Bescheinigung haushaltsnahe Dienstleistungen" summing labour costs paid non-cash. *Problem:* no invoice today; § 35a is advertised. *Benefit:* a German-specific selling point worth up to 4,000 €/year to the customer; required for B2B. *Effort:* 4–5 days (pdfkit, numbering, storage). **MUST HAVE.**

**I-05 · Transparent "Wohin geht dein Geld" on the booking page**
Show the customer's price split (cleaner share, VAT, Fiduxa) — Fiduxa's honest version of Batmaid's cost chart, computed from the real finance model. *Benefit:* trust, differentiation, justifies price. *Deps:* Q2 (VAT basis). *Effort:* 1 day. SHOULD HAVE.

**I-06 · Move-out "Übergabe-Check" package**
End-of-tenancy booking with a landlord-handover checklist (Fenster, Backofen, Fugen, Keller…), photo documentation by the cleaner, and a defined re-clean rule if the landlord flags items within 48 h. *Benefit:* highest-ticket service, clear differentiation. *Deps:* Q7 (re-clean policy/cost). *Effort:* 5 days. SHOULD HAVE.

**I-07 · Referral programme**
Personal referral code: friend gets X € off the first booking, referrer gets a credit after the friend's first completed cleaning (fraud-checked with the existing identity fingerprints). *Effort:* 4 days. SHOULD HAVE (after launch).

**I-08 · Off-peak slot discount**
Admin-configurable discount for low-demand windows (e.g. Tue/Wed afternoons) shown as "−10 % Zeitfenster". *Benefit:* evens out cleaner utilisation. *Effort:* 2 days. NICE TO HAVE.

**I-09 · Tips ("Trinkgeld") 100 % to the cleaner**
Optional tip after a 5-star review, paid online, passed through untouched. *Deps:* tax/accounting check. *Effort:* 3 days. NICE TO HAVE.

## Cleaner experience

**I-10 · Check-in / check-out with no-show protection**
"Bin unterwegs" and "Gestartet" already exist; add a deadline: if not started 15 min after the slot start → office alert + automatic re-offer to nearby cleaners + customer notification. Check-out time becomes the default actual duration. *Problem:* no-shows are invisible today. *Benefit:* reliability is the #1 complaint about competitors. *Effort:* 3 days. **MUST HAVE.**

**I-11 · Published reliability rules + strikes**
Clear rules (hand-back < 24 h = strike; 3 strikes in 90 days = pause; no-show = immediate review), visible in the cleaner portal, with the trust score reflecting them. *Benefit:* predictable, fair, fewer manual suspensions. *Effort:* 3 days. SHOULD HAVE.

**I-12 · Faster payouts**
Weekly settlement instead of 30 days, optionally 50 % within 3 days (Zenjob model). *Deps:* Q9 (cash-flow/refund risk policy). *Effort:* 1–2 days (mostly settings). SHOULD HAVE.

**I-13 · Distance-aware job offers**
Rank/filter job offers by distance from the cleaner's base postcode (Berlin postcode → district centroid table; no maps API needed), show "in deinem Kiez". *Benefit:* fewer hand-backs, shorter travel. *Effort:* 2–3 days. SHOULD HAVE.

**I-14 · Mentor job for newcomers**
A new cleaner's first job is paired with a Gold+ mentor (both paid; mentor gets a bonus); unlocks the full board after. *Benefit:* quality ramp, fewer bad first reviews. *Effort:* 4 days. NICE TO HAVE.

**I-15 · Earnings forecast**
"At your current pace you reach Silver in 6 weeks; expected earnings this month: X €" from scheduled jobs and tier rules. *Effort:* 2 days. NICE TO HAVE.

## Admin automation

**I-16 · Manual booking & customer creation (phone orders)**
Admin creates a customer and a booking with the normal quote engine, payment state "invoice"/"cash"/"link sent". *Effort:* 3 days. **MUST HAVE.**

**I-17 · Email outbox with retry and send log**
Every email becomes a record (to, template, status, attempts, error); a worker sends/retries; admin sees and resends. *Effort:* 3 days. **MUST HAVE** (reliability).

**I-18 · Partial refunds & price-delta settlement**
Admin refunds any amount via Stripe/PayPal; price changes after edits create a settle-the-difference action (charge link or refund). *Effort:* 4 days. SHOULD HAVE.

**I-19 · Duration adjustment workflow**
Mismatch flag → admin proposes an adjustment → customer approves in one click → charge/credit via I-18. *Effort:* 3 days (after I-18). SHOULD HAVE.

**I-20 · Demand vs supply view**
Per day: published capacity, booked hours, cleaner hours available (from weekly hours minus holidays) → red days where demand exceeds supply. Plain aggregation, no ML. *Effort:* 2 days. SHOULD HAVE.

## AI (only where it beats plain code)

**I-21 · Support triage drafts (Claude API)**
Classify contact-form and booking-thread messages (billing / no-show / quality / damage / other), suggest priority and a draft reply in the admin inbox; human sends. *Benefit:* faster support with one admin. *Cost:* cents per message. *Effort:* 3 days + prompt tuning. NICE TO HAVE (after a ticket inbox exists).

**I-22 · Duration-estimate calibration (statistics, not AI)**
Nightly job: median actual vs planned minutes per service/condition/m² band → suggests factor corrections to the admin. *Effort:* 2 days. SHOULD HAVE once 300+ actual durations exist (dummy data excluded).

**Rejected AI ideas:** customer-facing chatbot (support risk before a knowledge base exists), review sentiment analysis (stars suffice), ML demand forecasting (moving averages first), ML cleaner matching (rules + distance first).

## Business growth

**I-23 · Property-manager / landlord portal**
Hausverwaltungen book move-out and stairwell cleanings for many units, pay by monthly invoice, see one dashboard. Builds on I-04 and I-16. *Effort:* 8–10 days. FUTURE INNOVATION.

**I-24 · District landing pages (SEO)**
"Reinigung in Prenzlauer Berg" pages with local availability, reviews and schema.org markup. *Effort:* 2 days. SHOULD HAVE (cheap acquisition).

**I-25 · Partnerships**
Movers (Umzugsfirmen) and furnished-apartment operators as referral partners for move-out cleaning. Business-side, no code beyond I-07 codes.
