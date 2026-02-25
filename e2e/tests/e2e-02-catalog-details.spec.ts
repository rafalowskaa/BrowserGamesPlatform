import { test, expect } from '@playwright/test';
import { login } from './_helpers';

test('E2E-02: catalog -> game details', async ({ page }) => {
  await login(page, 'ania', 'ania1234');
  await page.goto('/Games');

  const search = page.locator('#app-search-input');
  await expect(search).toBeVisible();
  await search.fill('warcaby');
  await search.press('Enter');

  const firstDetailsLink = page.locator('main a[href*="/Games/Details"]').first();
  await expect(firstDetailsLink).toBeVisible();
  await firstDetailsLink.click();

  await expect(page).toHaveURL(/\/Games\/Details/i);
  await expect(page.locator('main h1')).toBeVisible();
});