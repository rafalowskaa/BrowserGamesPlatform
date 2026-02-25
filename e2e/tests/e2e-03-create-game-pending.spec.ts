import { test, expect } from '@playwright/test';
import path from 'path';
import { setLangPL, login } from './_helpers';

test('E2E-03: create game -> pending', async ({ page }) => {
  const ts = Date.now();
  const title = `E2E Game ${ts}`;
  const packagePath = path.resolve(__dirname, '../fixtures/sample-game.zip');

  await setLangPL(page);
  await login(page, 'ania', 'ania1234');

  await page.goto('/Dashboard?tab=games');

  await expect(page.locator('#GameTitle')).toBeVisible();

  await page.setInputFiles('#GamePackage', packagePath);
  await page.locator('#GameTitle').fill(title);

  const nextBtn = page.locator('[data-wizard-next]:visible');
  await expect(nextBtn).toBeVisible();
  await nextBtn.click();

  await expect(page.locator('#GameDescription')).toBeVisible();
  await page.locator('#GameDescription').fill('Opis testowy');

  const nextBtn2 = page.locator('[data-wizard-next]:visible');
  await expect(nextBtn2).toBeVisible();
  await nextBtn2.click();

  const categoriesSelect = page.locator('#GameCategories');
  if (await categoriesSelect.count()) {
    const options = categoriesSelect.locator('option');
    if (await options.count()) {
      await categoriesSelect.selectOption({ index: 0 });
    }
  }

  const nextBtn3 = page.locator('[data-wizard-next]:visible');
  if (await nextBtn3.count()) {
    await nextBtn3.click();
  }

  const submitBtn = page.getByRole('button', { name: /dodaj|zapisz|wyślij|submit|opublikuj/i });
  await expect(submitBtn).toBeVisible();
  await submitBtn.click();

  const row = page.locator('table tbody tr').filter({ hasText: title }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(/pending|oczekuje|weryfik/i);
});