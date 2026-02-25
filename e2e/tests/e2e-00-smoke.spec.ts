import { test, expect } from '@playwright/test';

test('E2E-00: home loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/PlayGrid/i);
});