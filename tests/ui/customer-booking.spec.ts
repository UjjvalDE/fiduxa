import { expect, test } from '@playwright/test';
import { customer, login } from './helpers';

// Walks the booking wizard up to the checkout summary – never submits.
test('customer reaches the checkout summary with a price', async ({ page }) => {
  await login(page, customer(1));

  // Service + postcode via the same params the homepage uses (auto-advances to step 2)
  await page.goto('/buchung?service=wohnungsreinigung&plz=10115');
  await expect(page.locator('#card-property')).toBeVisible();

  // Size 60 m²
  await page.locator('#area').fill('60');

  // Pets answer is required
  await page.locator('label:has(input[name="pets"][value="false"])').click();
  await expect(page.locator('input[name="pets"][value="false"]')).toBeChecked();

  // First available day (calendar on desktop) and its first start time
  const day = page.locator('#booking-calendar button[name="day"]:not([disabled]):not([aria-disabled="true"])').first();
  await expect(day).toBeVisible();
  await day.click();
  const time = page.locator('input[name="start-time"]').first();
  await expect(time).toBeAttached();
  await page.locator('label:has(input[name="start-time"])').first().click();
  await expect(time).toBeChecked();

  await page.getByRole('button', { name: 'Weiter zur Kasse' }).click();

  // Checkout: welcome prompt (if shown) can be dismissed, price box shows an amount
  const price = page.locator('#card-price');
  await expect(price).toBeVisible();
  const withoutDiscount = page.getByRole('button', { name: 'Ohne Rabatt fortfahren' });
  if (await withoutDiscount.isVisible().catch(() => false)) {
    await withoutDiscount.click();
    await expect(withoutDiscount).toBeHidden();
  }
  await expect(price).toContainText('€');
  await expect(price.getByTestId('price-split')).toBeVisible();
});
