import { expect, test } from '@playwright/test';
import { cleaner, login } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page, cleaner(1));
});

test('worker home shows jobs or the empty state', async ({ page }) => {
  await page.goto('/worker');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: /Offene Aufträge/ }).click();
  const card = page.locator('article').first();
  const empty = page.getByText('Gerade keine offenen Aufträge');
  await expect(card.or(empty).first()).toBeVisible();
});

test('performance page shows tier badge and progress bars', async ({ page }) => {
  await page.goto('/worker/leistung');
  await expect(page.getByTestId('tier-badge').first()).toBeVisible();
  await expect(page.getByRole('progressbar').first()).toBeVisible();
});

test('earnings page loads', async ({ page }) => {
  await page.goto('/worker/verdienst');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('body')).toContainText('€');
});
