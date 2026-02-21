import { test, expect } from '@playwright/test';

test('E2E-05: launch -> submit score -> leaderboard updates', async ({ page, request }) => {

  await page.goto('/Account/Login');
  await page.locator('input[name="LoginOrEmail"]').fill('ania');
  await page.locator('input[name="Password"]').fill('ania1234');
  await page.getByRole('button', { name: /zaloguj/i }).click();
  await expect(page.locator('.user-menu__name')).toHaveText(/ania/i);


  await page.goto('/Games');
  const firstGameLink = page.locator('a[href*="/Games/Details"]').first();
  await firstGameLink.click();
  await expect(page).toHaveURL(/Games\/Details/i);


  const gameId = 'd4b00095-e027-4cfe-83df-788555351696';


  const session = await page.evaluate(async (gameId) => {
    const res = await fetch(`/api/games/${gameId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 1 })
    });
    const json = await res.json();
    return json;
  }, gameId);

  const sessionId = session.session_id;
  const token = session.token;

  await page.evaluate(async ({ gameId, sessionId, token }) => {
    await fetch(`/api/games/${gameId}/sessions/${sessionId}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, value: 999, outcome: 'win' })
    });
  }, { gameId, sessionId, token });


  await page.goto(`/Games/Details?slug=graduren&tab=ranking`);

  const leaderboardText = await page.evaluate(async (gameId) => {
    const res = await fetch(`/api/games/${gameId}/leaderboard`);
    return await res.text();
  }, gameId);

  expect(leaderboardText).toContain('999');
});