import { test, expect } from '@playwright/test';
import path from 'path';
import { setLangPL, login, wizardNext, openModerationPageAndFindRow, searchInCatalog } from './_helpers';

test('E2E-04: approve game -> visible in public catalog', async ({ page, browser }) => {
  const ts = Date.now();
  const title = `E2E Approve ${ts}`;
  const packagePath = path.resolve(__dirname, '../fixtures/sample-game.zip');

  await setLangPL(page);
  await login(page, 'ania', 'ania1234');

  await page.goto('/Dashboard?tab=games');
  await expect(page.locator('#GameTitle')).toBeVisible();

  await page.setInputFiles('#GamePackage', packagePath);
  await page.locator('#GameTitle').fill(title);
  await wizardNext(page);

  await expect(page.locator('#GameDescription')).toBeVisible();
  await page.locator('#GameDescription').fill('E2E approve flow');
  await wizardNext(page);

  const categories = page.locator('#GameCategories option');
  if (await categories.count()) await categories.first().click();
  await wizardNext(page);

  await page.getByRole('button', { name: /dodaj|zapisz|wyślij|submit|opublikuj/i }).click();

  const creatorRow = page.locator('table tbody tr').filter({ hasText: title }).first();
  await expect(creatorRow).toBeVisible({ timeout: 15_000 });

  const modCtx = await browser.newContext();
  const modPage = await modCtx.newPage();

  await setLangPL(modPage);
  await login(modPage, 'admin', 'admin123');

  const pendingRow = await openModerationPageAndFindRow(modPage, title);

  const approveBtn = pendingRow.getByRole('button', { name: /zatwierdź|approve|akceptuj/i }).first();
  if (await approveBtn.count()) {
    await approveBtn.click();
  } else {
    const approveLink = pendingRow.getByRole('link', { name: /zatwierdź|approve|akceptuj/i }).first();
    await approveLink.click();
  }

  await modPage.waitForLoadState('domcontentloaded');
  await modCtx.close();

  await searchInCatalog(page, title);

  const card = page.locator('main').locator('a,div').filter({ hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
});