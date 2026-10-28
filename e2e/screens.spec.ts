import { expect, playMove, seedPlacement, skipQuiz, test } from './helpers';
import { MATE, PROMO } from './puzzle-data';

// Captures every screen for design review: npx playwright test e2e/screens.spec.ts
const round = process.env.REVIEW_ROUND ?? 'latest';
const HANG = 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3';

async function seedProgress(page: import('@playwright/test').Page) {
  await page.evaluate(() => new Promise<void>((res) => {
    const r = indexedDB.open('chess-coach');
    r.onsuccess = () => {
      const tx = r.result.transaction(['games', 'analyses', 'attempts'], 'readwrite');
      const now = Date.now(), DAY = 86_400_000;
      for (let i = 0; i < 24; i++) {
        const url = `seed-${i}`;
        tx.objectStore('games').put({ url, endTime: now - (48 - i * 2) * DAY, timeClass: 'rapid', timeControl: '600+5', myColor: 'w', myRating: 540 + Math.round(Math.sin(i) * 30 + i * 4), oppRating: 600, oppName: 'x', result: 'win', pgn: '' });
        tx.objectStore('analyses').put({ url, engine: 'sf19-lite', nodes: 1, plies: [], done: true, nextPly: 0, stats: { ownMoves: 30, hangs: Math.max(0, Math.round(2.6 - i * 0.07 + Math.cos(i))), pawnHangs: 1, freeMissed: i % 3, clockUsedPct: 0.35 + i * 0.01 } });
      }
      for (let i = 0; i < 40; i++)
        tx.objectStore('attempts').put({ id: `s${i}`, kind: 'puzzle', itemId: `x${i % 30}`, ts: now - (40 - i) * 3600_000, firstTry: i % 5 !== 0, solved: true, ms: 9000 - i * 100, device: 'd', theme: i < 30 ? 'hangingPiece' : 'mateIn1' });
      tx.oncomplete = () => { r.result.close(); res(); };
    };
  }));
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });
    const shot = async (page: import('@playwright/test').Page, name: string, project: string) =>
      (await page.waitForTimeout(400), page).screenshot({ path: `docs/design-review/${round}/${project}-${scheme}-${name}.png` });

    test('screens', async ({ page }, info) => {
      test.setTimeout(240_000);
      const p = info.project.name;
      await page.goto('/');
      await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible({ timeout: 20_000 });
      await shot(page, 'today-placement', p);
      await page.getByRole('button', { name: 'Start placement' }).click();
      await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
      await shot(page, 'placement', p);
      await seedPlacement(page);
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 20_000 });
      await shot(page, 'today', p);
      await page.getByRole('button', { name: 'Start' }).click();
      await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
      await shot(page, 'today-running', p);
      await page.goto('/#/puzzles');
      await expect(page.locator('.group-row').first()).toBeVisible({ timeout: 20_000 });
      await shot(page, 'puzzles', p);
      await page.goto(`/#/puzzle/${MATE.id}`);
      await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
      await playMove(page, MATE.wrong[0]);
      await expect(page.getByText('Not quite — try again')).toBeVisible();
      await shot(page, 'puzzle-retry', p);
      await playMove(page, MATE.wrong[1]);
      await expect(page.getByText(/Checkmate/)).toBeVisible();
      await shot(page, 'puzzle-reveal', p);
      await page.goto('/#/progress');
      await expect(page.getByText(/rapid games on chess.com/)).toBeVisible();
      await shot(page, 'progress-empty', p);
      await page.goto('/#/settings');
      await expect(page.getByLabel('Username')).toBeVisible();
      await shot(page, 'settings', p);
      await page.goto('/#/play');
      await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
      await shot(page, 'play-setup', p);
      await page.goto(`/#/play/${encodeURIComponent(HANG)}`);
      await page.getByRole('button', { name: 'Start game' }).click();
      await playMove(page, 'f3g5');
      await expect(page.getByRole('alertdialog', { name: 'Blunder alarm' })).toBeVisible({ timeout: 20_000 });
      await shot(page, 'play-alarm', p);
      await page.getByRole('button', { name: 'Play it anyway' }).click();
      await expect(page.getByText('Your move')).toBeVisible({ timeout: 30_000 });
      await shot(page, 'play-game', p);
      await page.getByRole('button', { name: 'Resign' }).click();
      await expect(page.getByRole('status', { name: 'Game result' })).toBeVisible();
      await shot(page, 'play-over', p);
      await page.getByRole('button', { name: 'Review game' }).click();
      await expect(page.getByText('Before the answers:')).toBeVisible({ timeout: 60_000 });
      await shot(page, 'play-quiz', p);
      await skipQuiz(page);
      await expect(page.getByRole('button', { name: 'Added to Today' }).first()).toBeVisible({ timeout: 60_000 });
      await shot(page, 'play-review', p);
      const drillId = await page.evaluate(() => new Promise<string>((res) => {
        const r = indexedDB.open('chess-coach');
        r.onsuccess = () => { const q = r.result.transaction('drills').objectStore('drills').getAllKeys(); q.onsuccess = () => res(String(q.result[0] ?? '')); };
      }));
      await page.goto('/#/drill/' + encodeURIComponent(drillId));
      await expect(page.getByText('You went wrong here. Find a better move.')).toBeVisible();
      await shot(page, 'drill', p);
      await seedProgress(page);
      await page.goto('/#/progress');
      await expect(page.locator('.hero-stat .big-number')).toBeVisible();
      await shot(page, 'progress', p);
    });
  });
}
