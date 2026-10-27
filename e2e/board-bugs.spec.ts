import { test, expect, playMove, clickSquare } from './helpers';
import { readFileSync } from 'node:fs';

const moves = (id: string) => readFileSync('public/data/puzzles.tsv', 'utf8').split('\n').find((l) => l.startsWith(id + '\t'))!.split('\t')[2].split(' ');

test('cancelling the promotion picker leaves the board usable', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone');
  const m = moves('6mKxk');
  await page.goto('/#/puzzle/6mKxk');
  await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
  await clickSquare(page, m[1].slice(0, 2));
  await clickSquare(page, m[1].slice(2, 4));
  await page.getByRole('dialog', { name: 'Promote to' }).getByRole('button', { name: 'Cancel' }).click();
  await playMove(page, m[1]);
  for (let i = 3; i < m.length; i += 2) { await page.waitForTimeout(600); await playMove(page, m[i]); }
  await expect(page.getByText(/^Solved/)).toBeVisible();
});

test('a tap during the opponent’s reply is not counted as a wrong try', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone');
  const m = moves('0DzAF');
  await page.goto('/#/puzzle/0DzAF');
  await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
  await playMove(page, m[1]);
  await playMove(page, m[2]); // the opponent's move, tapped too early
  await page.waitForTimeout(700);
  await expect(page.getByText('Not quite — try again')).toHaveCount(0);
  for (let i = 3; i < m.length; i += 2) { await playMove(page, m[i]); await page.waitForTimeout(600); }
  await expect(page.getByText('Solved first try')).toBeVisible();
});

test('replay after a reveal starts fresh', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone');
  await page.goto('/#/puzzle/00rTX');
  await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
  await playMove(page, 'h4h5');
  await page.getByRole('button', { name: 'Show me' }).click();
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect(page.getByText('Find the best move.')).toBeVisible();
  await playMove(page, 'h4h5');
  await expect(page.getByText('Not quite — try again')).toBeVisible();
});
