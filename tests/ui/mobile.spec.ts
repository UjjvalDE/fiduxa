import { expect, test } from '@playwright/test';
import { hasHorizontalOverflow } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

test('homepage has no horizontal overflow and the nav menu opens', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#sorgenfrei')).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);
  await page.locator('button.menu-button').click();
  await expect(page.locator('nav.mobile-nav')).toBeVisible();
});

test('booking first step has no horizontal overflow', async ({ page }) => {
  await page.goto('/buchung');
  await expect(page.locator('h1, h2').first()).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);
});
