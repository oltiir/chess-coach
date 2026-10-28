import { test, expect, playMove } from './helpers';
import type { Browser, Page } from '@playwright/test';

// Runs against `wrangler dev` (Worker + local D1): CREW_URL=http://127.0.0.1:8788 npx playwright test e2e/crew.spec.ts --project=iphone
const BASE = process.env.CREW_URL;
test.skip(!BASE, 'needs CREW_URL (wrangler dev)');

const DAY = 86_400_000;
async function seedGames(page: Page, n: number, hangs: number) {
  await page.evaluate(({ n, hangs, DAY }) => new Promise<void>((res) => {
    const r = indexedDB.open('chess-coach');
    r.onsuccess = () => {
      const tx = r.result.transaction(['games', 'analyses'], 'readwrite');
      for (let i = 0; i < n; i++) {
        const url = `https://www.chess.com/game/live/${Date.now()}${i}`;
        tx.objectStore('games').put({ url, endTime: Date.now() - i * DAY, timeClass: 'rapid', timeControl: '600+5', myColor: 'w', myRating: 600, oppRating: 640, oppName: 'stranger', result: i % 2 ? 'loss' : 'win', rules: 'chess',
          pgn: '[TimeControl "600+5"]\n\n1. e4 e5 2. Nf3 d6 3. Ng5 h6' });
        tx.objectStore('analyses').put({ url, engine: 'sf19-lite', nodes: 1, done: true, nextPly: 0,
          plies: [{ ply: 4, fenBefore: 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3', played: 'f3g5', best: 'd2d4', wcBefore: 0, wcAfter: -0.6, wcBest: 0.1, drop: 0.7, flag: 'blunder', label: 'hung-piece', hang: { square: 'g5', value: 3 }, pawnHang: false, freeMissed: false, candidates: [{ uci: 'd2d4', wc: 0.1 }] }],
          stats: { ownMoves: 3, hangs, pawnHangs: 0, freeMissed: 0, clockUsedPct: 0.6 } });
      }
      tx.oncomplete = () => { r.result.close(); res(); };
    };
  }), { n, hangs, DAY });
}

async function person(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, baseURL: BASE });
  await ctx.route('https://api.chess.com/**', (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible({ timeout: 20_000 });
  return page;
}

test('two friends: create, join, see the leaderboard and each other’s games, leave a note', async ({ browser }, info) => {
  test.skip(info.project.name !== 'iphone');
  test.setTimeout(120_000);
  const olti = await person(browser);
  await seedGames(olti, 6, 0);
  await olti.goto('/#/crew');
  await olti.getByRole('tab', { name: 'Start a crew' }).click();
  await olti.getByLabel('Crew name').fill('Saturday chess');
  await olti.getByLabel('Your name').fill(`Olti${Date.now() % 10000}`);
  await olti.getByLabel('Passcode').fill('knight123');
  await olti.getByRole('button', { name: 'Start crew' }).click();
  await expect(olti.getByText('Save your recovery code')).toBeVisible();
  await olti.getByRole('button', { name: 'I saved it' }).click();
  const code = await olti.evaluate(async () => (await new Promise<any>((res) => { const r = indexedDB.open('chess-coach'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('crew-account'); q.onsuccess = () => res(q.result); }; })).code);
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  await expect(olti.locator('.board-list .level').first()).toHaveText('10');

  const arben = await person(browser);
  await seedGames(arben, 2, 2);
  await arben.goto('/#/crew');
  await arben.getByLabel('Invite code').fill(code);
  await arben.getByLabel('Your name').fill('Arben');
  await arben.getByLabel('chess.com username').fill('arben_k');
  await arben.getByLabel('Passcode').fill('rook4567');
  await arben.getByRole('button', { name: 'Join crew' }).click();
  await arben.getByRole('button', { name: 'I saved it' }).click();
  await expect(arben.getByText('Calibrating · 2/5 games')).toBeVisible();
  await expect(arben.locator('.board-list li').first()).toContainText('Olti');
  await expect(arben.locator('.feed-item').first()).toBeVisible();

  // Arben opens one of Olti's games, sees the marked move, leaves a tip
  await arben.locator('.feed-item', { hasText: 'Olti' }).first().click();
  await expect(arben.getByText('Hung a piece').first()).toBeVisible();
  await arben.getByLabel('Note', { exact: true }).fill('Your knight on g5 was loose here');
  await arben.getByRole('button', { name: 'Add' }).click();
  await expect(arben.getByText('Arben: Your knight on g5 was loose here')).toBeVisible();
  await arben.getByRole('button', { name: 'Try this position' }).click();
  await expect(arben.getByText('You went wrong here. Find a better move.')).toBeVisible();

  // Olti sees the tip on his own game
  await olti.goto('/#/crew');
  await olti.locator('.feed-item', { hasText: 'Olti' }).first().click();
  await expect(olti.getByText('Arben: Your knight on g5 was loose here')).toBeVisible();
  await expect(olti.getByRole('button', { name: 'Hide this game from the crew' })).toBeVisible();
});

test('without a connection the Crew tab still shows the last update', async ({ browser }, info) => {
  test.skip(info.project.name !== 'iphone');
  const p = await person(browser);
  await p.goto('/#/crew');
  await p.getByRole('tab', { name: 'Start a crew' }).click();
  await p.getByLabel('Crew name').fill('Offline test');
  await p.getByLabel('Your name').fill('Solo');
  await p.getByLabel('Passcode').fill('solo1234');
  await p.getByRole('button', { name: 'Start crew' }).click();
  await p.getByRole('button', { name: 'I saved it' }).click();
  await expect(p.getByText('Offline test')).toBeVisible();
  await p.route('**/api/**', (r) => r.abort());
  await p.reload();
  await expect(p.getByText('Offline test')).toBeVisible({ timeout: 20_000 });
  await expect(p.getByText('You’re offline — showing the last crew update.')).toBeVisible();
});
