import { test, expect } from '@playwright/test';
import { setLangPL, login, pickFirstApprovedGame } from './_helpers';

test('E2E-06: comment + cooldown', async ({ page }) => {
  await setLangPL(page);
  await login(page, 'ania', 'ania1234');

  const { gameId, slug } = await (async () => {
    const g = await pickFirstApprovedGame(page);
    return { gameId: g.id, slug: g.slug };
  })();

  await page.goto(`/Games/Details?slug=${encodeURIComponent(slug)}`);
  await page.waitForLoadState('domcontentloaded');

  const commentsTab = page.locator('a[href*="tab=comments"], a[href*="tab=Comments"], button:has-text("Komentarze"), a:has-text("Komentarze")').first();
  if (await commentsTab.count()) {
    await commentsTab.click();
    await page.waitForLoadState('domcontentloaded');
  }

  const input = page.locator('#gameComment, textarea[data-comment-input], textarea[name="Text"]').first();
  await input.scrollIntoViewIfNeeded();
  await expect(input).toBeVisible();

  const submitBtn = page.locator('button[type="submit"], button[data-comment-submit]').filter({ hasText: /dodaj|wyślij|opublikuj|send|submit/i }).first();
  await submitBtn.scrollIntoViewIfNeeded();
  await expect(submitBtn).toBeVisible();

  const ts = Date.now();
  await input.fill(`Komentarz E2E ${ts}`);
  await submitBtn.click();

  await expect(page.locator('text=/Komentarz|dodano|opublikowano|created/i')).toBeVisible({ timeout: 10000 }).catch(async () => {
    const list = page.locator('text=/Komentarz E2E/i').first();
    await expect(list).toBeVisible({ timeout: 10000 });
  });

  await input.fill(`Spam E2E ${ts}`);
  await submitBtn.click();

  await expect(page.locator('text=/Spróbuj ponownie|rate limited|cooldown|Za dużo/i')).toBeVisible({ timeout: 10000 });
});