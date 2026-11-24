# Architecture Recommendations

*Principle: the simplest architecture that supports realistic growth (Berlin → a few German cities, thousands of bookings per month). No microservices.*

## Keep as is (it is good)

- **Modular monolith**: Express controllers → services → Mongoose models. Clear ownership (quote, promotion, gift card, availability, dispatch, payout, commission, booking-edit, feedback services). Keep adding services, not processes.
- **Money as integer cents**, immutable per-booking snapshots (pricing, workerPayout), audit log, settings applied in memory with a reload poll.
- **Locks**: MongoDB-based `withLock` for day capacity and per-worker settlements — correct and sufficient.
- **Next.js app router with server components** for public pages and client islands for interactive parts; i18n via message modules.
- **Testing approach**: API-level e2e suites with mocked providers and an isolated database; the load harness.

## Change (ordered by urgency)

### 1. Deployment & secrets (now)
- Add `server/Dockerfile` (node:22-alpine, `npm ci --omit=dev`, `node main.js`) and a `docker-compose.yml` for local parity.
- Host the API on a managed Node host or a small VPS behind a reverse proxy with TLS; MongoDB Atlas (or managed Mongo) with backups enabled.
- Secrets in the host's secret store; rotate the PayPal/SMTP credentials that lived on the laptop; keep `.env.example` as the contract.
- CI (GitHub Actions): lint + tsc + unit + e2e (with a service container Mongo) on every push; block deploy on failure.

### 2. Observability (now)
- `pino` structured logs with request IDs (replace `morgan dev` outside development).
- Sentry (or similar) for backend and frontend errors.
- Three SLOs with alerts: booking creation success ≥ 99 %, API p95 < 500 ms, email send failures < 1 %/day.
- Keep `/health`; add `/ready` that checks Mongo.

### 3. Background work (soon)
- Move the two `setInterval` loops into a **separate worker entry point** (`server/worker.js`) with a DB leader lock (reuse `withLock("scheduler")` with a TTL) so running two API instances is safe. Jobs: hold expiry, gift cards, tier reconciliation, application purge, **email outbox**, **recurring-series generation** (future), **no-show detection** (future).
- Email outbox: `emails` collection {to, template, payload, status, attempts, lastError, sentAt}; services enqueue, the worker sends with exponential backoff; admin UI lists and resends. This removes "fire-and-forget".

### 4. Sessions (policy-dependent)
- Current: 24 h JWT in an HttpOnly cookie, token-version revocation. Recommended: sliding renewal (re-issue when < 6 h remain on an authenticated request) with an absolute cap decided in Q10. Add TOTP 2FA for admins.

### 5. Files
- CVs are stored as Buffers in MongoDB (fine at this volume, ≤ 5 MB each). If ID documents and before/after photos are added, move binary storage to object storage (S3-compatible) with signed URLs and keep only metadata in Mongo.

### 6. Database
- Indexes are adequate (load test showed IXSCAN everywhere). Add `{ "job.completedAt": 1 }` when the finance aggregations grow, and a TTL index for the email outbox.
- Introduce a `series` collection for recurring bookings (I-01) rather than overloading `bookings`.
- Keep the dummy-data tag plugin; never seed production.

### 7. Frontend
- Add Playwright with 6–8 journeys (book with cash, book with gift card, edit, cancel, cleaner accept/complete, admin settle) run in CI against the test stack.
- Performance budget in CI (Lighthouse CI on `/`, `/buchung`): LCP < 2.5 s, CLS < 0.1.
- Analytics: self-hosted Plausible/Umami with wizard step events (no cookies, GDPR-friendly).

### 8. API
- Versioned under `/api/v1` already; keep. Add OpenAPI generation from zod schemas later if a mobile app or partner integration appears — not before.

## Trade-offs considered and rejected

| Option | Why not now |
|---|---|
| Separate services per domain | Adds deploy/ops cost; no scaling pressure; shared models are simpler |
| Redis for locks/queues | Mongo locks and an outbox collection are enough; one less system to run |
| Serverless API | Long-running settlement/PayPal calls and intervals fit a process better |
| GraphQL | REST + zod is simpler for three clients that we control |
