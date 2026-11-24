import { expect, test } from '@playwright/test';

test('homepage shows its main sections', async ({ page }) => {
  await page.goto('/');
  for (const id of ['sorgenfrei', 'bewertungen', 'servicegebiet', 'jobs']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
});

test('language switch to EN changes the hero text', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('h1').first();
  const before = await hero.innerText();
  await page.getByRole('button', { name: 'English' }).first().click();
  await expect(hero).not.toHaveText(before);
});

test('cleaner application form validates an empty submit', async ({ page }) => {
  await page.goto('/reinigungskraft-werden');
  const form = page.locator('form').first();
  await form.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/reinigungskraft-werden/);
  await expect(page.locator('[aria-invalid="true"], [role="alert"]').first()).toBeVisible();
});

test('district page renders', async ({ page }) => {
  await page.goto('/reinigung/neukoelln');
  await expect(page.locator('h1')).toContainText('Neukölln');
});
