import { test, expect } from '@playwright/test';

test('E2E-01: login -> profile', async ({ page }) => {

  await page.goto('/Account/Login');

  await page.locator('input[name="LoginOrEmail"]').fill('ania');
  await page.locator('input[name="Password"]').fill('ania1234');

  await page.getByRole('button', { name: /zaloguj/i }).click();

  await expect(page.locator('.user-menu__name')).toHaveText(/ania/i);


  await page.goto('/Dashboard?tab=profile&panel=profile');

  await expect(page.locator('input[name="DisplayName"]')).toHaveValue(/ANIA/i);
});