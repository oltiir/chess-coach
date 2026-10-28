import { test, expect } from './helpers';
import type { Page } from '@playwright/test';

const DAY = 86_400_000;
async function seed(page: Page, blitz: number) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(({ blitz, DAY }) => new Promise<void>((res) => {
    const r = indexedDB.open('chess-coach');
    r.onsuccess = () => {
      const tx = r.result.transaction(['games', 'analyses'], 'readwrite');
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        const url = `seed-${i}`;
        tx.objectStore('games').put({ url, endTime: now - (20 - i) * DAY, timeClass: 'rapid', timeControl: '600+5', myColor: 'w', myRating: 560 + i * 5, oppRating: 600, oppName: 'x', result: 'win', pgn: '' });
        tx.objectStore('analyses').put({ url, engine: 'sf19-lite', nodes: 1, plies: [], done: true, nextPly: 0, stats: { ownMoves: 30, hangs: i < 10 ? 2 : 1, pawnHangs: 0, freeMissed: 1, clockUsedPct: 0.6 } });
      }
      for (let i = 0; i < blitz; i++)
        tx.objectStore('games').put({ url: `b${i}`, endTime: now - 1000, timeClass: 'blitz', timeControl: '300', myColor: 'w', myRating: 200, oppRating: 200, oppName: 'x', result: 'loss', pgn: '' });
      tx.oncomplete = () => { r.result.close(); res(); };
    };
  }), { blitz, DAY });
  await page.goto('/#/progress');
}

test('headline shows pieces hung per game with a downward trend', async ({ page }) => {
  await seed(page, 0);
  const hero = page.locator('.hero-stat');
  await expect(hero.getByText('Pieces hung per game')).toBeVisible();
  await expect(hero.locator('.big-number')).toContainText('1.0');
  await expect(hero.locator('.trend.good')).toHaveText('↓ from 2.0');
  await expect(page.getByRole('heading', { name: 'Rapid rating' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Puzzle rating' })).toBeVisible();
  await expect(page.getByText(/blitz games this week/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
});

test('a blitz note appears when blitz was played this week', async ({ page }) => {
  await seed(page, 3);
  await expect(page.getByText('You played 3 blitz games this week — rapid 15|10 builds the safety habit.')).toBeVisible();
});

test('empty state explains what to do', async ({ page }) => {
  await page.goto('/#/progress');
  await expect(page.getByText('Play a few 15|10 rapid games on chess.com and they’ll show up here.')).toBeVisible({ timeout: 20_000 });
});
