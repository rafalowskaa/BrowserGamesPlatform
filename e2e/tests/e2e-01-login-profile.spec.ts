import { test, expect } from '@playwright/test';
import { login, goProfile } from './_helpers';

test('E2E-01: login -> profile', async ({ page }) => {
  await login(page, 'ania', 'ania1234');
  await goProfile(page);
  await expect(page.locator('#DisplayName')).toHaveValue(/ANIA/i);
});