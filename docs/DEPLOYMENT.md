# Deployment

Three processes: the **Next.js frontend** (Netlify/Vercel or `next start`), the
**Express API** (`server/main.js`) and the **background worker**
(`server/worker.js`). API and worker share one image (`server/Dockerfile`) and
one MongoDB.

## Environment variables

Copy `server/.env.example` to `server/.env`. The important ones:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Connection string (never the test URI) |
| `JWT_SECRET`, `BANK_DETAILS_ENCRYPTION_KEY` | Secrets – long random values, see rotation below |
| `CLIENT_URL`, `PUBLIC_SITE_URL`, `TRUST_PROXY` | Origins / reverse proxy |
| `SMTP_*`, `SMTP_FROM`, `ADMIN_NOTIFICATION_EMAIL` | Mail transport – every mail goes through the outbox (Admin → E-Mails) and is retried automatically |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe Checkout + webhook `/api/v1/payments/webhook` |
| `PAYPALAPIKEY`/`PAYPALSECRET_KEY` (sandbox), `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET_KEY` + `PAYPAL_MODE=live` | PayPal |
| `PAYPAL_WEBHOOK_ID` | Webhook `CHECKOUT.ORDER.APPROVED` → `/api/v1/payments/paypal/webhook` (signature verified with PayPal; the endpoint answers 503 until set) |
| `RUN_JOBS_IN_API` | `true` (default) runs the jobs inside the API; set `false` when a worker runs |
| `LOG_LEVEL`, `SENTRY_DSN` | Logging (pino JSON) and optional error tracking (`@sentry/node` must be installed separately) |

### Secrets rotation

* `JWT_SECRET`: rotating it logs every user out – announce it, rotate during low traffic, restart API + worker.
* `BANK_DETAILS_ENCRYPTION_KEY`: **never** rotate in place – encrypted bank data could not be read any more. If a rotation is unavoidable, re-encrypt all worker bank details with a migration script first.
* Stripe/PayPal/SMTP keys can be rotated any time; redeploy afterwards. Webhook secrets/ids belong to the respective webhook endpoint in the provider dashboard.

## Running

```bash
# API
cd server && npm ci --omit=dev && node main.js
# Worker (same code, no HTTP): holds, gift cards, settings reload, tier reconciliation,
# e-mail outbox (30 s), no-show watch (5 min), recurring series
cd server && RUN_JOBS_IN_API=false npm run worker
```

Every job takes a MongoDB lock (`job:<name>`), so running the worker next to an
API that still has `RUN_JOBS_IN_API=true` is safe – nothing runs twice. Two API
instances behind a load balancer are fine for the same reason.

### Docker

```bash
docker compose up --build          # mongo + api (:3100, jobs off) + worker
```

Probes: `GET /health` (process up) and `GET /ready` (MongoDB ping, 503 when not
ready). Logs are JSON lines with a request id (`X-Request-Id` is honoured).

## CI

`.github/workflows/ci.yml` runs on every push/PR:

1. **frontend** – `eslint` + `tsc --noEmit`.
2. **backend** – boots the app, `npm test` (unit) and `npm run test:e2e` against
   a MongoDB service on port 27999 (`MONGODB_TEST_URI`). The e2e harness strips
   SMTP/Stripe/PayPal credentials and uses mocks – no money, no mails.

Run the same locally: `MONGODB_TEST_URI=mongodb://127.0.0.1:27999 npm run test:e2e`
(start a throwaway `mongod --dbpath /tmp/fx-mongo --port 27999` first).
