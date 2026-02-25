import { expect, Page } from '@playwright/test';

export async function setLangPL(page: Page): Promise<void> {
  await page.goto('/Language/Set?culture=pl-PL&returnUrl=%2F');
  await page.goto('/');
}

export async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/Account/Login');
  await page.locator('input[name="LoginOrEmail"], #LoginOrEmail').fill(username);
  await page.locator('input[name="Password"], #Password').fill(password);
  await page.getByRole('button', { name: /zaloguj|sign in|login/i }).click();
  await expect(page.locator('.user-menu__name')).toBeVisible();
}

export async function pickFirstApprovedGame(page: Page): Promise<{ id: string; slug: string }> {
  const res = await page.request.get('/api/games', { headers: { Accept: 'application/json' } });
  expect(res.ok()).toBeTruthy();

  const games = (await res.json()) as any[];
  expect(Array.isArray(games)).toBeTruthy();
  expect(games.length).toBeGreaterThan(0);

  const first = games[0];
  const id = String(first.id ?? first.gameId ?? first.game_id);
  const slug = String(first.slug ?? first.Slug ?? first.gameSlug ?? first.game_slug);

  expect(id.length).toBeGreaterThan(10);
  expect(slug.length).toBeGreaterThan(1);

  return { id, slug };
}

export function getQueryParam(url: string, key: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get(key);
  } catch {
    return null;
  }
}