import { test, expect } from '@playwright/test';
import { setLangPL, login } from './_helpers';

type GameItem = { id: string; slug: string };

test('E2E-05: launch -> submit score -> leaderboard updates', async ({ page }) => {
  await setLangPL(page);
  await login(page, 'ania', 'ania1234');

  const gamesRes = await page.request.get('/api/games');
  expect(gamesRes.ok()).toBeTruthy();
  const games = (await gamesRes.json()) as GameItem[];
  expect(games.length).toBeGreaterThan(0);

  const { id: gameId, slug } = games[0];

  await page.goto(`/Games/Details?slug=${encodeURIComponent(slug)}`);
  await expect(page.locator('main')).toBeVisible();

  const sessionRes = await page.request.post(`/api/games/${gameId}/sessions`, {
    data: { mode: 1 },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(sessionRes.ok()).toBeTruthy();

  const session = await sessionRes.json() as { session_id: string; token: string };
  expect(session.session_id).toBeTruthy();
  expect(session.token).toBeTruthy();

  const value = 777;

  const submitRes = await page.request.post(`/api/games/${gameId}/sessions/${session.session_id}/score`, {
    data: { token: session.token, value, outcome: 'win' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(submitRes.status()).toBe(200);

  const lbRes = await page.request.get(`/api/games/${gameId}/leaderboard`, {
    headers: { Accept: 'application/json' },
  });
  expect(lbRes.ok()).toBeTruthy();

  const lbText = await lbRes.text();
  expect(lbText).toContain(String(value));
});