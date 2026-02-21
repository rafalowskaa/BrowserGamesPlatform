import { test, expect } from '@playwright/test';

test('E2E-02: catalog search -> game details', async ({ page }) => {
  await page.goto('/Games');

  const search = page.locator('form[role="search"]:visible input[name="search"]').first();
  await expect(search).toBeVisible();
  await search.fill('warcaby');
  await search.press('Enter');

  await page.waitForLoadState('networkidle');

  const firstDetailsLink = page.locator('main a[href*="/Games/Details"]').first();
  await expect(firstDetailsLink).toBeVisible();
  await firstDetailsLink.click();

  await expect(page).toHaveURL(/\/Games\/Details/i);
  await expect(page.locator('main h1')).toBeVisible();
});