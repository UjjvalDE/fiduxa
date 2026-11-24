# Full Website & Workflow Audit

*21 November 2026. Based on reading the code, the automated suites (≈ 390 checks), live API checks against the dev stack with the dummy dataset, and headless-browser renders of key pages. Items marked "unverified" were not exercised in a real browser session by a human.*

Legend: ✅ works · ⚠️ works with caveats · ❌ missing · 🔒 security/legal note

## A. Customer journey

| # | Step | State | Findings |
|---|---|---|---|
| 1 | Homepage | ✅ | New trust blocks (no-employer, § 35a, pay share, live rating 4.8/523), reviews carousel, Berlin strip, jobs teaser. ⚠️ FAQ still says "we start in Berlin and expand step by step" next to "ganz Berlin" — minor copy clash. ⚠️ No funnel analytics: we don't know where visitors drop. |
| 2 | Service discovery | ✅ | Three household services with included/excluded lists; business → quote form. |
| 3 | Service selection | ✅ | Deep ×1.4, move-out ×1.6; extras filtered per service; switching service prunes extras and re-derives duration. |
| 4–5 | Property details / rooms | ⚠️ | Size (m²) + condition drive the estimate. **No room/bathroom count** in the model — competitors ask for it; rooms only appear in free-text notes. Decision needed whether rooms should affect price. |
| 6–7 | Tasks / extras | ✅ | 12 extras with minutes; prices are time-based (0 € surcharge). |
| 8 | Price | ✅ | Server-side quote, VAT contained, PRICE_CHANGED guard (409). 2-hour minimum masks condition differences for small flats (documented). |
| 9–11 | Date / time / availability | ⚠️ | Availability = **admin-published capacity windows**, not actual cleaner availability. A customer can book a slot that no cleaner wants → job sits on the board → "Ohne Reinigungskraft" admin alert 48 h before. This is the biggest operational risk at launch. |
| 12 | Customer details | ✅ | Draft persisted; refresh keeps state; back navigation keeps selections. |
| 13 | Welcome discount | ✅ | Opt-in question at checkout only; personal code; first-booking-only; abuse checks. |
| 14–15 | Checkout / payment | ⚠️ | Stripe, PayPal, cash, gift cards. ❌ No PayPal webhook: a customer who approves at PayPal but never returns is not charged and the hold expires (booking lost, no notification). ⚠️ No Stripe test keys on this machine — browser checkout never clicked through. |
| 16 | Confirmation | ✅ | Email with breakdown; ❌ no PDF invoice (§ 35a needs one). |
| 17–19 | Dashboard / history / upcoming | ✅ | Lists, detail with cleaner card, messages, unread counts. |
| 20 | Modifications | ✅ | Reschedule/duration/extras/notes until 24 h; paid-online bookings can't resize online (no partial refunds). ⚠️ Price increases on paid bookings are reported to the admin but there is no online "pay the difference" step. |
| 21 | Cancellation | ⚠️ | Free until 24 h; **after that nothing is possible online** ("contact us"). No late-cancellation fee → cleaners lose income; office gets manual work. |
| 22 | Recurring bookings | ❌ | `frequency` only sets a discount. No series, no automatic next appointment, no "same cleaner" enforcement, no pause/skip. The weekly discount is granted on a single booking. |
| 23 | Cleaner information | ✅ | Public profiles (first name, photo, skills, rating, reliability), cleaner card on the booking. |
| 24 | Feedback | ✅ | Review + duration + recommend + keep-cleaner; one per booking; disputes. |
| 25 | Support / complaints | ⚠️ | Contact form, per-booking Q&A thread, admin notification emails. ❌ No ticket, no status, no SLA, no phone/chat. |
| — | Mobile | ⚠️ unverified | Layouts are responsive by construction (Tailwind); only desktop renders were checked by machine. Needs a device pass. |
| — | API failure handling | ✅ | Error states with retry on admin lists (fixed this round); wizard shows translated errors; stale-data bug fixed. |

## B. Cleaner journey

| # | Step | State | Findings |
|---|---|---|---|
| 1 | Registration | ✅ (new) | Public application form → admin review → invitation email → account. |
| 2 | Email verification | ✅ | Invitation acceptance verifies the address. |
| 3 | Phone verification | ❌ | Not implemented (no SMS provider). |
| 4 | Profile | ✅ | Address, districts, experience, bio, languages, specialties, photo, pets, supplies. |
| 5 | Documents | ⚠️ | Optional CV on application only. ❌ No ID, residence/work-permit, or Gewerbe document upload; no verification record. 🔒 Trust claim "approved by the Fiduxa team" rests on a manual look at the profile. |
| 6 | Admin approval | ✅ | Pending → approved/rejected with note; suspend/reactivate blocks login (tested). |
| 7–8 | Login / dashboard | ✅ | Cookie session 24 h; dashboard with earnings, stats, tier card. ⚠️ Session ends hard at 24 h even mid-task (no sliding refresh). |
| 9 | Availability | ✅ | Weekly hours + holidays filter the job board; ⚠️ they do **not** generate customer-facing availability. |
| 10–11 | Notifications / acceptance | ⚠️ | Email on new matching job; first-come-first-served acceptance. No push/SMS; no preferred-cleaner priority; no fairness ranking. |
| 12 | Schedule | ✅ | Calendar with jobs, holidays, hours; today/upcoming/past. |
| 13 | Customer info | ✅ 🔒 | Address/phone only after acceptance; no prices except cash amount + own pay. |
| 14–15 | Completion / duration | ⚠️ | Start/complete buttons, checklist, actual minutes, cash amount self-reported. ❌ No check-in deadline → no-shows are only noticed when the customer complains. |
| 16–18 | Feedback / ratings | ✅ | Reviews, disputes, performance page with tier progress. |
| 19–21 | Commission / earnings / payouts | ✅ | Immutable per-job records; 30-day wait; bank/PayPal; ⚠️ cash jobs can make the net payout negative (cleaner owes Fiduxa) with no collection process. |
| 22 | Profile management | ✅ | Incl. payout method, bank details encrypted. |
| 23 | Support | ⚠️ | "Report issue" per job + email to admin; no ticket status. |

## C. Admin journey

| # | Area | State | Findings |
|---|---|---|---|
| 1 | Authentication | ✅ | Role-guarded; admins invite admins. ❌ No 2FA for admins (handles money). 🔒 |
| 2 | Dashboard | ✅ | Visual overview + operational tiles. |
| 3 | Customers | ⚠️ | Search, detail, activate/deactivate. ❌ Cannot create a customer or a booking for a phone caller; ❌ no "log in as customer" for support; ❌ no GDPR delete/export. |
| 4–6 | Cleaners | ✅ | Applications, approval, suspension, pay override, commission override, performance ranking. ⚠️ Commission overview lists deactivated-but-approved cleaners. |
| 7–8 | Bookings / assignment | ✅ | Edit everything, reassign with conflict check, status actions. ❌ No manual booking creation; ❌ no bulk actions. |
| 9–10 | Scheduling / availability | ⚠️ | Capacity windows per day; no view of *cleaner* supply vs demand. |
| 11–12 | Pricing / discounts | ✅ | Rates, factors, extras, frequencies, tiers, finance assumptions, promotions, gift cards. |
| 13–14 | Payments / refunds | ⚠️ | List + full refund via provider. ❌ No partial refund; ❌ no manual "mark invoice paid" for invoice bookings beyond status change. |
| 15–16 | Commission / payouts | ✅ | Settlement, PayPal Payouts, holds, history, CSV. |
| 17–18 | Reviews / disputes | ✅ | Hide, dispute approve/reject. |
| 19 | Email management | ❌ | Templates are code; no send log; no resend; failures only in server logs. |
| 20–21 | Analytics / reports | ✅ | Analytics page, finance P&L, commission report CSV. ❌ No wizard funnel, no cleaner utilisation report. |
| 22 | Audit log | ✅ | Admin actions + system tier changes. |
| 23 | Settings | ✅ | Comprehensive. |

**Can an admin run the business without the database?** Mostly yes — the exceptions are phone/manual bookings, partial refunds, GDPR deletions, email resends and any customer-data correction beyond booking fields.

## D. Cross-cutting technical findings

- 🔒 **Secrets:** live PayPal credentials and SMTP password sit in `server/.env` on the dev laptop; no secret manager; `.env` is git-ignored (good).
- 🔒 **Admin 2FA:** none.
- **Background jobs:** `setInterval` inside the API process. Running two API instances would run every job twice (hold expiry is idempotent; email delivery and tier audit entries are not).
- **Email:** no outbox/retry; a transient SMTP failure silently loses a confirmation (logged only).
- **Monitoring:** no error tracking, no uptime check, no alerting; logs are `morgan dev` to stdout.
- **Deployment:** frontend on Netlify; backend hosting and process management undefined; no Dockerfile; no CI pipeline running the test suites.
- **Data model:** solid indexes (verified by load test: all IXSCAN); money in integer cents everywhere; immutable payout snapshots; audit log.
- **Tests:** strong API coverage; ❌ no browser-level (Playwright) tests of the wizard, checkout or mobile layouts.
