import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'DummyTest#2026';
export const customer = (n = 1) => `kunde.${String(n).padStart(3, '0')}@dummy.fiduxa.invalid`;
export const cleaner = (n = 1) => `reinigung.${String(n).padStart(2, '0')}@dummy.fiduxa.invalid`;

/** Log in through the real login form and wait for leaving /login */
export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** True when the page scrolls horizontally */
export const hasHorizontalOverflow = (page: Page) =>
  page.evaluate(() => (document.scrollingElement?.scrollWidth ?? 0) > window.innerWidth + 1);
