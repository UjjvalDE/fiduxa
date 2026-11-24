# Fiduxa API v1

Base URL: `http://localhost:3100/api/v1` · Auth: `Authorization: Bearer <token>`
Money is always integer cents (EUR). Dates are `YYYY-MM-DD` (Berlin calendar day).
Validation errors return `422` with `details: [{ field, message }]`.

## Public
| Method | Path | Notes |
|---|---|---|
| GET | `/services` | Service catalogue (incl./excl. lists) |
| GET | `/services/:serviceId` | |
| GET | `/extras?serviceId=` | 15 extras with minutes, price, Lucide icon |
| GET | `/pricing` | Hourly rate, minimum, factors, slots |
| POST | `/service-area/check` | `{ postcode }` → `serviceable` |
| POST | `/bookings/estimate` | `{ serviceId, areaM2, condition, frequency, extras[] }` |
| GET | `/bookings/availability/days?from=&to=` | Days with free admin slots (tomorrow … +90 days) |
| GET | `/bookings/availability?date=` | Admin slots of the day: `{ id, startTime, endTime, available, remaining }` |
| POST | `/business-requests` | B2B quote request (see business-request.controller.js) |
| POST | `/contact` | `{ name, email, phone?, subject?, message, privacyAccepted: true }` |

## Auth & profile
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Customer account |
| POST | `/auth/login` | Rate limited 20 / 15 min |
| GET | `/auth/me` | |
| POST | `/auth/forgot-password` | `{ email }` – always generic 200 |
| POST | `/auth/reset-password` | `{ token, password }` |
| GET/PATCH | `/users/me` | `{ name?, phone? }` |
| PATCH | `/users/me/password` | `{ currentPassword, newPassword }` → new token, old tokens revoked |

## Customer
| Method | Path | Notes |
|---|---|---|
| POST | `/bookings` | Instant booking: `{ …property, durationMinutes?, slotId (window id), startTime "HH:MM", preferredDate, earlyStartConsent: true, locale, pets?: boolean, paymentMethod?: "stripe"\|"paypal"\|"cash" }`. `cash` → confirmed immediately, the cleaner collects the money after the job → reserves the slot (35 min hold) and returns `checkoutUrl` (Stripe Checkout or PayPal approval page). Without any online method: confirmed immediately (invoice). |
| GET | `/bookings/my-bookings?scope=upcoming\|past` | `{ bookings, unread: { [bookingId]: count } }`; `assignedWorker` = `{ name, avatarUpdatedAt }` |
| GET | `/customer/bookings/:id` | `{ booking, cleaner: CleanerCard\|null, review\|null, canReview, unreadMessages }` |
| GET/POST | `/customer/bookings/:id/messages` | Q&A thread (customer + cleaner + office). POST `{ body }` (max 2000). GET → `{ messages[{_id, body, authorRole, authorName, mine, createdAt}], canWrite, hasCleaner }` and marks as read |
| POST | `/customer/bookings/:id/review` | `{ rating 1-5, punctuality?, quality?, friendliness?, comment? }` – once, completed jobs, within 60 days |
| POST | `/customer/bookings/:id/cancel` | `{ reason? }` – unpaid anytime, confirmed until 24 h before; paid bookings are refunded automatically |

## Payments (Stripe hosted checkout · PayPal)
| Method | Path | Notes |
|---|---|---|
| GET | `/payments/config` | `{ onlinePaymentAvailable, methods: ("stripe"\|"paypal")[], bookingMethods: (…\|"cash")[], cashEnabled }` |
| GET | `/payments/booking/:bookingId` | Customer: payment status of own booking |
| POST | `/payments/checkout` | `{ bookingId, method? }` → `{ url }` – start/retry payment for a `payment_pending` booking while the hold is valid (redirect to `url`) |
| POST | `/payments/paypal/capture` | `{ bookingId, orderId }` – called by `/zahlung/paypal?booking=…&token=<orderId>` after PayPal approval. Verifies the amount with PayPal, confirms the booking → payment summary. 402 = not approved/declined (retry), 409 = reservation expired/cancelled (not charged) |
| POST | `/payments/webhook` | Stripe only – signature verified; marks paid and confirms the booking |

## Worker
| Method | Path | Notes |
|---|---|---|
| POST | `/worker/accept-invitation` | `{ token, password }` (public) |
| GET | `/worker/me` | Checklist, status, profile, `avatarUrl`, `availability`, `holidays`, `payRateCents`, `stats` (approved), `earnings` summary (approved), `upcomingCount`, `options {specialties, languages}` |
| PUT | `/worker/profile` | `{ address, serviceAreas[], experienceYears, bio?, languages[]?, specialties[]?, petsOk?, bringsSupplies?, publicVisible? }` |
| PUT/DELETE | `/worker/avatar` | `{ image: "data:image/jpeg;base64,…" }` (JPG/PNG/WebP ≤ 400 KB, resize in the browser) → `{ avatarUrl }` |
| PUT | `/worker/availability` | `{ weekly: [{ weekday 1-7, start "HH:MM", end "HH:MM" }] }` – empty = always available |
| POST | `/worker/holidays` | `{ from, to, note? }` (YYYY-MM-DD, inclusive; 409 if a job is already accepted in that period) |
| DELETE | `/worker/holidays/:holidayId` | |
| GET | `/worker/calendar?from=&to=` | **Approved.** Own jobs + holidays + weekly hours (max 62 days) |
| GET | `/worker/earnings` | **Approved.** `{ summary, bank, jobs[{… status: pending\|due\|on_hold\|paid}], payouts[] }` |
| GET/POST | `/worker/jobs/:id/messages` | Thread of an assigned job |
| PUT | `/worker/bank-details` | `{ accountHolder, iban, bic? }` (encrypted) |
| GET | `/worker/performance` | **Approved.** Commission tier, trust score 0–100, counters (jobs, verified reviews, rating, reliability), next-tier progress (`missing { jobs, reviews, rating }`), lifetime totals and the full tier table |
| GET | `/worker/reviews` | **Approved.** Own reviews incl. hidden flag and dispute state |
| POST | `/worker/reviews/:id/dispute` | **Approved.** `{ message }` – contest a review once; the office resolves it |
| PUT | `/worker/payout-method` | `{ type: "bank"\|"paypal", paypalEmail? }` – how the cleaner wants to be paid (bank needs saved bank details; paypal needs the email). Shown in `/worker/me`, `/worker/earnings` and to the admin |
| GET | `/worker/jobs/open` | Open-job board: confirmed jobs without a cleaner that fit my calendar (no customer identity) |
| POST | `/worker/jobs/:id/accept` | First come, first served (409 if taken or overlapping) → customer email "your cleaner" |
| POST | `/worker/jobs/:id/decline` | Hide an open job for me |
| POST | `/worker/jobs/:id/release` | `{ reason }` – hand an accepted job back (until 24 h before) → re-offered |
| POST | `/worker/jobs/:id/on-the-way` | Day of the job → customer email "cleaner on the way" |
| GET | `/worker/jobs?scope=today\|upcoming\|past` | **Approved workers only** |
| GET | `/worker/jobs/:id` | No prices / customer email exposed |
| POST | `/worker/jobs/:id/start` | Confirmed + scheduled today |
| POST | `/worker/jobs/:id/complete` | `{ note? }` |
| POST | `/worker/jobs/:id/report-issue` | `{ type: damage\|safety\|no-access\|scope-mismatch\|other, message }` |

## Admin (role `admin`)
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/dashboard/stats` | |
| GET | `/admin/bookings` | `status, search, from, to, assigned, workerId, sort=date, page, limit` |
| GET | `/admin/bookings/:id` | Incl. status history |
| PATCH | `/admin/bookings/:id/status` | `{ status, note?, refund? }` – `payment_pending→confirmed` (manual/invoice) \| `cancelled`; `confirmed→in_progress\|cancelled`; `in_progress→completed`. Cancel releases the slot and refunds paid bookings (if `refund`, default true). |
| PATCH | `/admin/bookings/:id/assign` | `{ workerId \| null }` – prevents double-booking |
| PATCH | `/admin/bookings/:id/notes` | `{ adminNotes }` |
| GET/POST | `/admin/bookings/:id/messages` | Thread (office sees full names) |
| PATCH | `/admin/bookings/:id/payout` | `{ status: on_hold\|pending }` – hold/release a cleaner payout |
| GET | `/admin/payouts/open` | Earnings grouped by cleaner: `dueCents` (eligible), `pendingCents`, `onHoldCents`, `processingCents`, `grossCents`, `commissionCents`; `worker.payout { type, target }` = preferred route (paypal target masked); jobs incl. `grossCents`/`commissionCents` |
| POST | `/admin/payouts` | `{ workerId, bookingIds?, includeNotYetDue?, note?, method?: "bank"\|"paypal" }` – settle eligible earnings. Omitted method = cleaner preference. `bank` = admin transferred manually → payout `paid` at once. `paypal` = payout via the PayPal **Payouts API** (sandbox/live): jobs are claimed atomically (pending → processing) under a per-worker lock, then the provider is called; `SUCCESS` → `paid` (+ `providerBatchId`, `providerItemId`), refusal → **502**, payout `failed` + `failureReason`, earnings released for a retry. Slow provider → payout and jobs stay `processing` (duplicate settlement impossible). Negative/zero amounts and cleaners without a PayPal address → 409 (settle as `bank`) |
| POST | `/admin/payouts/:id/refresh` | `{ forceFail? }` – re-check a processing payout against PayPal and finalise it (paid/failed). `forceFail: true` marks a stuck payout failed and releases its earnings |
| GET | `/admin/payouts?worker=` | Payout history |
| GET | `/admin/commission` | Rating-based commission overview: every approved cleaner with tier, effective %, counters, trust score, lifetime gross/earnings/Fiduxa commission; filters `tier, minRating, search, sort` |
| GET | `/admin/commission/workers/:id` | One cleaner in detail incl. the immutable per-booking commission records |
| GET | `/admin/commission/report?from=&to=&format=csv` | Commission totals per cleaner (JSON or CSV export) |
| PATCH | `/admin/workers/:id/commission-override` | `{ commissionPct \| null, reason }` – manual commission override (audited, future bookings only; `null` removes it) |
| PATCH | `/admin/reviews/:id/dispute` | `{ resolution: "approved"\|"rejected", note? }` – resolve a cleaner's review dispute; approved hides the review and recalculates rating + tier |
| GET | `/admin/reviews?worker=` · PATCH `/admin/reviews/:id` | `{ hidden }` – hide abusive reviews |
| PATCH | `/admin/workers/:id/pay-rate` | `{ payRateCents \| null }` (null = default `WORKER_HOURLY_RATE_CENTS`) |
| GET | `/admin/slots?from=&to=` | Published time slots incl. bookings per slot |
| POST | `/admin/slots` | Bulk create `{ from, to, weekdays[1-7], times[{startTime,endTime?}], capacity, note?, updateExisting? }` |
| PATCH | `/admin/slots/:id` | `{ capacity?, active?, endTime?, note? }` (capacity ≥ booked) |
| DELETE | `/admin/slots/:id` | Only without bookings |
| GET | `/admin/customers` · `/admin/customers/:id` | |
| PATCH | `/admin/customers/:id/status` | `{ isActive }` |
| GET | `/admin/workers?status=&search=` | |
| POST | `/admin/workers/invite` | `{ name, email, phone? }` |
| GET | `/admin/workers/pending` | |
| GET/PATCH | `/admin/workers/:id/review` | GET incl. `avatarUrl`, `availability`, `holidays`, `payRateCents`, `customPayRate`, `stats`; PATCH `{ status: approved\|rejected, note? }` |
| PATCH | `/admin/workers/:id/status` | `{ action: suspend\|reactivate, note? }` |
| POST | `/admin/workers/:id/resend-invitation` | |
| GET | `/admin/business-requests` · `/:id` | |
| PATCH | `/admin/business-requests/:id` | `{ status?, adminNotes? }` |
| GET | `/admin/contact-messages` | |
| PATCH | `/admin/contact-messages/:id` | `{ status: new\|in_progress\|closed }` |
| GET | `/admin/payments?status=&bookingId=` | |
| POST | `/admin/payments/:id/refund` | Full refund via Stripe or PayPal |
| GET | `/admin/audit-logs?entityId=&action=` | |

## Prices & availability (admin-managed)
- `GET /admin/settings` · `PUT /admin/settings` with any of these sections (each section complete):
  - `pricing { hourlyRateCents (default 2500 = €25/h), minimumMinutes, maximumMinutes, roundingMinutes 15|30|60, areaM2PerHour, frequencyDiscount { weekly, biweekly, monthly } }`
  - `extras [{ id, minutes, priceCents, active }]`
  - `booking { startStepMinutes, maxBookingDaysAhead, cancellationCutoffHours, teamBufferMinutes }`
  - `payments { cashEnabled, paypalEnabled, stripeEnabled }`
  - `workerPay { hourlyRateCents, payoutDelayDays }`
  Price = hours × hourly rate (+ extra fees) − frequency discount. Recommended hours = area ÷ m²/h × condition + extra minutes, rounded up; the customer can choose more or less within min/max.
- **Availability windows**: `POST /admin/slots { from, to, weekdays, times: [{ startTime, endTime }], capacity, replaceExisting? }`. A window (e.g. 08:00–18:00 = full day) with `capacity` = teams working in parallel. `replaceExisting` swaps all other windows of those days (windows with bookings are deactivated; their bookings still count).
- `GET /bookings/availability?date=&duration=MINUTES` → start times `{ windowId, startTime, endTime, remaining }` every `startStepMinutes` where the whole job fits and fewer than `capacity` jobs overlap that day (incl. `teamBufferMinutes`). `GET /bookings/availability/days?duration=` → days with at least one start time.
- `GET /admin/slots` returns per window `windowMinutes, capacityMinutes, bookedMinutes, utilisationPct` and bookings with `startTime/endTime`.
- Dashboard `nextSevenDays` values are in minutes (team time).

## Price engine, promotions & gift cards
**One function prices everything** (`src/services/quote.service.js`), used by `POST /bookings/quote` and `POST /bookings`:
```
labour (hours × rate) + extra fees                      = subtotal
− recurring (frequency) discount                        = price
− ONE promotional discount (best of: welcome, automatic campaign, entered code)
= total incl. VAT (discounts reduce the taxable amount; VAT shown as contained)
− gift cards (payment method, applied after VAT – Mehrzweck-Gutschein § 3 Abs. 15 UStG)
= payable (online / cash), never < 0
```
| Method | Path | Notes |
|---|---|---|
| POST | `/bookings/quote` | Public, personalised with a Bearer token. `{ …property, promoCode?, giftCardCodes?[], contact? { email, phone, address, postcode } }` → `quote { lines {…, totalCents, vatCents, giftCardCents, payableCents}, promotion, codeResult {ok, reason, superseded}, welcome {eligible, reason}, giftCards[] }` |
| POST | `/bookings` | + `promoCode`, `giftCardCodes`, `expectedPayableCents`. 409 `PRICE_CHANGED` (price differs from what the customer saw), 422 `PROMO_INVALID` / `GIFT_CARD_INVALID` – each with a fresh `quote`. Payable 0 → confirmed at once (`payment.method: gift_card`). Booking stores `pricing` snapshot |
| GET | `/promotions/active` | Live banners (hero / banner / card) with localized texts, theme, image, code, dates |
| POST | `/auth/verify-email` | `{ token }` → confirms the email, sends the welcome-offer email |
| POST | `/auth/resend-verification` | Logged in, rate limited |
| GET | `/gift-cards/config` | Presets, min/max, validity, designs, methods |
| POST | `/gift-cards/check` | `{ code }` → balance (rate limited 20 / 15 min) |
| POST | `/gift-cards` | Customer: `{ amountCents, recipientName, recipientEmail, senderName, message?, design?, deliveryDate?, method? }` → `{ giftCard, checkoutUrl }` |
| GET | `/gift-cards/mine` · `/gift-cards/:id` | Buyer's cards (code only after payment) |
| POST | `/gift-cards/:id/pay` · `/gift-cards/:id/paypal/capture` | Retry payment · capture PayPal (amount verified with PayPal; Stripe via webhook) |
| GET/POST | `/admin/promotions` · GET/PATCH/DELETE `/admin/promotions/:id` · PATCH `/admin/promotions/:id/active` | CRUD, stats, redemptions; delete only when unused |
| GET | `/admin/gift-cards?search=&status=` · `/admin/gift-cards/:id` | List (totals) · detail with ledger + payments |
| POST | `/admin/gift-cards/issue` · `/:id/disable` · `/:id/enable` · `/:id/adjust` · `/:id/resend` | Goodwill card · block · unblock · ± balance with reason (ledger + audit log) · resend email |
| GET | `/admin/analytics?from=&to=` | Conversion, revenue before/after discounts, redemptions, welcome conversions, gift card sales and redemption % |

**Promotion rules**: welcome = 10 % on the first booking, automatic after email verification, once per customer; blocked when another account already used it with the same phone, mailbox (gmail dots/+tags ignored) or address. Redemptions are `reserved` at booking, `applied` when confirmed/paid, `released` when cancelled/expired before the cleaning (offer usable again). Usage limits are counted atomically; per-customer limits run under a customer lock.
**Gift cards**: balance changes are single atomic conditional updates + ledger rows with idempotency keys (reserve → capture on payment; release/refund on cancel or expiry). Valid until 31 Dec of the 3rd year after purchase. Scheduled delivery at 08:00 on the chosen day.

## Cash payment
Customer picks `cash` → booking confirmed. The cleaner sees `job.cash { amountCents, collected }` and must send `cashCollectedCents` with `POST /worker/jobs/:id/complete`. The cash is stored on the booking (+ a Payment record, provider `cash`) and deducted from the cleaner's payout (`workerPayout.cashHeldCents`); payout amounts are net and can be negative (cleaner owes the difference). Admin: `PATCH /admin/bookings/:id/cash { amountCents, collectedBy: worker|office }`.

## Admin accounts
`GET /admin/admins` · `POST /admin/admins { name, email, phone?, locale? }` (emails a 48 h set-password link → `/passwort-zuruecksetzen?token=…&neu=1`) · `PATCH /admin/admins/:id { isActive }` (not yourself, at least one active admin; deactivation logs them out) · `POST /admin/admins/:id/resend-invite`.

## Password reset
`POST /auth/forgot-password { email }` (same answer for unknown emails, link valid 30 min, invited cleaners must use their invitation) → email link `${PUBLIC_SITE_URL or first CLIENT_URL}/passwort-zuruecksetzen?token=…` → `POST /auth/reset-password { token, password }` (single use, logs out all sessions). Works for customers, cleaners and admins.

## Public cleaner profiles
| Method | Path | Notes |
|---|---|---|
| GET | `/cleaners` | Approved, visible cleaners: `CleanerCard[]` (first name, photo, skills, rating, jobs, reliability) |
| GET | `/cleaners/:id` | Profile: bio, areas, languages, pets, supplies, `stats {ratingAvg, ratingCount, ratingDetails, jobsCompleted, jobsHandedBack, reliabilityPct, punctualityPct, repeatCustomers}`, reviews (author "Klara M.") |
| GET | `/cleaners/:id/avatar` | Image (cache-busted with `?v=`) |

Reliability = completed ÷ (completed + handed back). Punctuality = started ≤ 15 min after slot start.

## Cleaner pay & settlements
**Rating-based commission (default pay model).** Each cleaner has a tier – New 25 % → Bronze 22 % → Silver 19 % → Gold 16 % → Platinum 13 % → Diamond 10 % (3-point steps; every rate, incl. manual overrides, is limited to 10–25 % and each higher tier must be cheaper) – that requires completed cleanings AND verified reviews AND a minimum average rating (all thresholds and percentages configurable in Einstellungen → `workerPay.commissionTiers`; `workerPay.payModel: "hourly"` switches back to the legacy hours × rate model). On completion each job gets `workerPayout { amountCents = gross × (100 − commissionPct) / 100, grossCents = customer price (after discounts, incl. VAT, before gift cards), commissionCents = gross − pay, commissionPct, tierKey, basis, dueAt = completedAt + WORKER_PAYOUT_DELAY_DAYS (30, configurable) }` – this record is **immutable**: later tier changes, config changes and overrides only affect future completions. Tier recalculation runs on completion, on every review change (created / hidden / dispute resolved), on override changes and daily as a safety net; tier changes are written to the audit log. The internal **trust score 0–100** (rating 40 · review volume 25 · job volume 20 · reliability 15, log-scaled so a few 5★ reviews cannot max it) ranks cleaners for the admin and never sets the commission. Cancelled bookings never count; refunded completed bookings leave the completed count and their unpaid earnings go on hold.
Job status: `pending` (waiting) → `due` (eligible) → `processing` (payout under way) → `paid`; `on_hold` by the office. **A refund of a completed job's payment automatically puts its unpaid earnings `on_hold`** until the office releases them (`PATCH /admin/bookings/:id/payout`).
Payout records (`AUS-YYYYMM-0001`): `status processing|paid|failed`, `provider bank|paypal`, provider references for reconciliation; a `failed` payout has released its earnings and is safe to retry. Earnings summary for cleaners includes `processingCents`; amounts are net of cash kept (`cashHeldCents`).
**No real money in development:** PayPal payouts run against the sandbox (or the test mock); `PAYPAL_MODE=live` is required for real transfers, and live Payouts additionally need PayPal's approval on the business account.

## Matching rules (open jobs, emails, accept)
A cleaner only sees/gets a job if: no overlapping job (+30 min travel), not on holiday, `petsOk` when the booking has `pets`, and the job lies within their weekly hours (if set). Admin assignment checks holiday and pets only.

## Booking status flow
`payment_pending` (slot held 35 min) → *Stripe webhook* → `confirmed` → `in_progress` → `completed`
Side exits: `cancelled` (slot released, paid → refunded), `expired` (hold ran out unpaid; a late payment re-takes the slot or is refunded automatically).
Payment status: `unpaid → pending → paid` (or `failed`), cancellation of paid bookings → `refunded` (or `refund_pending` if the automatic refund failed).
Legacy statuses from the earlier quotation flow (`pending_quotation`, `quotation_sent`, `accepted`, `rejected`) remain valid for old records.

## Job dispatch (open-job board)
When a booking becomes `confirmed` (payment or manual), every approved cleaner who is free at that time (no overlapping job incl. 30 min travel buffer) gets an email and sees it under `/worker/jobs/open`. The first to accept is assigned; the customer is emailed the cleaner's first name. Cleaners can decline, or hand an accepted job back until 24 h before (it is offered again). The admin can still assign/unassign manually (assigning emails the cleaner; unassigning re-offers the job). If nobody accepts by 48 h before the start, the admin gets one alert email.
Cleaner day flow: `on-the-way` → `start` (in_progress) → `complete { note, checklistDone[] }`.

## Languages
Customer emails are sent in `de`, `en` or `pl`: booking `locale`, user `preferredLanguage` (register `locale`, `PATCH /users/me { preferredLanguage }`), worker invite `locale`, business request `locale`. API messages are English; the frontend translates them.

## Not built yet (blueprint phases 4, 6, 8+)
Invoices/receipts (PDF), gift cards, coupons, referrals,
recurring booking generation, B2B quotation PDF, background jobs (reminders, expiry).
