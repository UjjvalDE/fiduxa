import { defineConfig, devices } from '@playwright/test';

// Smoke tests against the already running dev stack (frontend :3000, API :3100).
export default defineConfig({
  testDir: './tests/ui',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    locale: 'de-DE',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
