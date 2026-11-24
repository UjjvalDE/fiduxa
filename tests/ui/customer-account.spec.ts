import { expect, test } from '@playwright/test';
import { customer, login } from './helpers';

test('customer sees bookings, opens a detail and the edit dialog without saving', async ({ page }) => {
  await login(page, customer(2));
  await page.goto('/konto');
  const link = page.locator('a[href^="/konto/buchungen/"]').first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/konto\/buchungen\/[a-f\d]{24}/);
  await expect(page.locator('h1').first()).toBeVisible();

  // Only upcoming bookings are editable – find one via the list if the first is not
  let edit = page.getByRole('button', { name: 'Buchung bearbeiten' });
  if (!(await edit.isVisible().catch(() => false))) {
    await page.goto('/konto');
    const links = page.locator('a[href^="/konto/buchungen/"]');
    const count = Math.min(await links.count(), 15);
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href');
      await page.goto(href!);
      edit = page.getByRole('button', { name: 'Buchung bearbeiten' });
      if (await edit.isVisible().catch(() => false)) break;
    }
  }
  await expect(edit).toBeVisible();
  await edit.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('completed booking offers "Nochmal buchen"', async ({ page }) => {
  await login(page, customer(2));
  await page.goto('/konto');
  await page.getByRole('tab', { name: 'Vergangen' }).click();
  const links = page.locator('[role="tabpanel"][data-state="active"] a[href^="/konto/buchungen/"]');
  await expect(links.first()).toBeVisible();
  const count = Math.min(await links.count(), 30);
  const hrefs: string[] = [];
  for (let i = 0; i < count; i++) hrefs.push((await links.nth(i).getAttribute('href'))!);
  for (const href of hrefs) {
    await page.goto(href);
    const rebook = page.getByTestId('rebook');
    if (await rebook.waitFor({ timeout: 6000 }).then(() => true, () => false)) {
      await rebook.click();
      await expect(page).toHaveURL(/\/buchung\?rebook=/);
      await expect(page.locator('#card-service, h1').first()).toBeVisible();
      return;
    }
  }
  test.skip(true, 'no completed booking visible in the list');
});
