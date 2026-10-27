import { expect, playMove, test } from './helpers';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const solutions = new Map(
  readFileSync('public/data/puzzles.tsv', 'utf8').trim().split('\n').map((l) => {
    const [id, , moves] = l.split('\t');
    return [id, moves.split(' ')] as const;
  }),
);

async function solveCurrent(page: Page) {
  await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
  const id = (await page.locator('.solver').getAttribute('data-puzzle-id'))!;
  const moves = solutions.get(id)!;
  for (let i = 1; i < moves.length; i += 2) {
    await playMove(page, moves[i]);
    if (i + 2 < moves.length) await page.waitForTimeout(600); // opponent's reply animates
  }
  await expect(page.getByText(/^Solved/)).toBeVisible();
}

test('safety check and chess.com link are on Today', async ({ page }) => {
  await page.goto('/');
  for (const q of ['What did their last move attack?', 'After my move: what checks, captures or threats do they have?', 'Is anything of theirs hanging?'])
    await expect(page.getByText(q)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: /Before you play on chess.com/ })).toHaveAttribute('href', 'https://www.chess.com/play/online');
  await expect(page.getByText('Days trained this week')).toBeVisible();
});

test('a session survives a reload mid-way', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click({ timeout: 20_000 });
  await solveCurrent(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('2 / 10')).toBeVisible();
  await solveCurrent(page);
  await page.waitForTimeout(300); // let the write land, as any real close would
  await page.reload();
  await page.getByRole('button', { name: 'Continue (2/10)' }).click({ timeout: 20_000 });
  await expect(page.getByText('3 / 10')).toBeVisible();
});

test('the summary is still right after closing and reopening the app', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone');
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click({ timeout: 20_000 });
  for (let i = 0; i < 10; i++) {
    await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
    if (i === 0) { await page.getByRole('button', { name: 'Pause' }).click(); await page.getByRole('button', { name: /^(Start|Continue)/ }).click(); }
    await solveCurrent(page);
    await page.getByRole('button', { name: i < 9 ? 'Next' : 'Finish' }).click();
  }
  await expect(page.getByText('10 solved first try · 0 missed')).toBeVisible();
  await page.reload();
  await expect(page.getByText('10 solved first try · 0 missed')).toBeVisible({ timeout: 20_000 });
});
