# Browser smoke tests (Playwright)

Run against the already running dev stack (frontend :3000, API :3100, dummy dataset, see DUMMY_DATA.md). No web server is started.

```
npm run test:ui                 # all specs (chromium, 1 worker, retries 1)
npx playwright test mobile      # a single spec
npx playwright show-trace test-results/<run>/trace.zip   # trace after a retry
```

Specs live in `tests/ui/`: customer-booking (stops at checkout, never submits), customer-account, cleaner-portal, public-pages, mobile (390x844). Logins use dummy accounts (`kunde.00N`, `reinigung.0N`, password `DummyTest#2026`); helpers in `tests/ui/helpers.ts`. Tests create no records.
