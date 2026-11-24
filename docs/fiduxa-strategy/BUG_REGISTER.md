# Bug & Risk Register

*Severity: Critical = blocks a safe launch or loses money/legal exposure · High = materially hurts customers, cleaners or operations · Medium = noticeable, workaround exists · Low = cosmetic/minor.*

| ID | Problem | Role | Severity | Root cause | Suggested fix | Status |
|---|---|---|---|---|---|---|
| B-01 | Legal status of cleaners undefined; platform sets price, slot and commission while treating cleaners as independent (Scheinselbstständigkeit / EU Platform Work Directive, transposition due Dec 2026) | All | **Critical** | Business decision never taken | Legal advice; choose model (see OPEN_QUESTIONS Q1); adapt onboarding, contracts, invoicing | Open — decision |
| B-02 | Under "VAT on full price" the finance model shows ~0.3 % margin and Diamond cleaners (10 %) are loss-making | Admin | **Critical** | VAT basis not decided; commission ladder set without the VAT model | Tax adviser decision (Q2); then re-tune ladder or price | Open — decision |
| B-03 | Recurring bookings are not real series: weekly discount granted on one booking, no next appointment, no same cleaner | Customer, Cleaner | **Critical** (product) | Feature never built beyond the frequency field | Recurring series engine (NEW_IDEAS I-01) | Open |
| B-04 | No invoice/PDF; § 35a tax claim on the homepage depends on the customer having an invoice | Customer | High | Not built | Auto-generate invoice on payment; yearly § 35a statement | Open |
| B-05 | Customers can book capacity that no cleaner will take (admin windows ≠ cleaner supply) | Ops | High | Availability model is team-capacity based | Short term: windows derived from approved cleaners' hours; long term: cleaner-driven availability (Q5) | Open — decision |
| B-06 | Cash jobs create negative cleaner balances with no collection process; cash amount is self-reported | Admin, Cleaner | High | Cash design | Policy: cash only for ≤ X € or only for Silver+; auto-offset against next payouts; customer confirms amount | Open — decision |
| B-07 | Admin cannot create a booking (phone orders) or a customer | Admin | High | Endpoint never built | `POST /admin/bookings` reusing the quote engine + manual payment states | Open |
| B-08 | No partial refunds; price-decreasing edits on paid bookings need manual settlement outside the system | Admin, Customer | High | Refund endpoint is full-amount only | Partial refund via Stripe/PayPal APIs + booking price-delta record | Open |
| B-09 | No GDPR self-service: account deletion / data export | Customer, Cleaner | High (legal) | Not built | Delete (anonymise bookings, keep accounting data), export JSON | Open |
| B-10 | Cleaner vetting = manual profile look; no ID/permit document, no phone verification | Customer trust | High | Not built | Document upload + verification checklist on the admin review page; later e-ID | Open |
| B-11 | Late cancellation (< 24 h) impossible online, no fee, cleaner uncompensated | Customer, Cleaner | High (business) | Policy decision missing | Tiered fee + cleaner compensation (Q3) | Open — decision |
| B-12 | Job board is first-come-first-served; no preferred-cleaner priority, distance or rating weighting | Cleaner, Customer | Medium | Simple design | Priority window for the customer's preferred/previous cleaner, then ranked offers | Open |
| B-13 | No-show is undetectable until the customer complains | Customer | High | No check-in deadline | If not "on the way"/started by start+15 min → alert office, auto re-offer | Open |
| B-14 | PayPal approval without return = lost booking, no customer notification | Customer | Medium | No PayPal webhook | Implement PayPal webhook (CHECKOUT.ORDER.APPROVED) → capture | Open |
| B-15 | Emails are fire-and-forget; SMTP hiccup silently drops confirmations | All | Medium | No outbox/retry | Email outbox collection + retry worker + admin send log | Open |
| B-16 | Background jobs run inside the API process via setInterval | Ops | Medium | Simple design | Leader lock in DB (reuse `withLock`) or separate worker process | Open |
| B-17 | No error monitoring / alerting / structured logs | Ops | Medium | Not set up | Sentry (free tier) + pino + uptime check | Open |
| B-18 | Session expires hard at 24 h with no sliding renewal | All | Medium | Policy from spec | Renew cookie on activity within the 24 h; warn before expiry | Open — decision |
| B-19 | Duration mismatch is flagged but never billed or credited | Admin | Medium | Workflow not built | Admin "adjust & charge/credit" action with customer approval | Open |
| B-20 | Backend not deployable from the repo; live PayPal keys on a laptop | Ops/Security | Medium | No infra work yet | Dockerfile + hosting + secret manager; rotate keys after move | Open |
| B-21 | No admin 2FA | Admin | Medium (security) | Not built | TOTP for admins | Open |
| B-22 | Rooms/bathrooms not part of the booking model | Customer | Medium | Blueprint formula uses m² only | Decide if rooms affect price (Q8) | Open — decision |
| B-23 | Commission overview lists deactivated cleaners | Admin | Low | Filter on workerStatus only | Add `isActive` filter / "inactive" badge | Open |
| B-24 | Homepage FAQ "we start in Berlin…" vs "ganz Berlin" strip | Customer | Low | Copy drift | Align FAQ text | Open |
| B-25 | No browser-level tests for wizard/checkout/mobile | Dev | Medium | Not written | Playwright smoke suite (6–8 journeys) | Open |
| B-26 | No funnel analytics | Growth | Medium | Not set up | Privacy-friendly analytics (Plausible/Umami self-hosted) with wizard step events | Open |

Fixed during the 20–21 Nov sessions (for the record): admin list pagination stale-data bug; tier audit entries not written (actor required); frozen price after duration edit in the wizard; Christmas campaign leftovers; localStorage tokens; midnight-dependent tests; commission N+1.
