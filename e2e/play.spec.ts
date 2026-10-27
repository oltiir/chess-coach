import { expect, noVerticalScroll, playMove, test } from './helpers';

const HANG = 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3';
const url = (fen: string) => `/#/play/${encodeURIComponent(fen)}`;

test('the alarm stops a hanging move, rethink restores, a safe move goes through and Maia replies', async ({ page }) => {
  await page.goto(url(HANG));
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByText('Your move')).toBeVisible();
  await playMove(page, 'f3g5');
  const sheet = page.getByRole('alertdialog', { name: 'Blunder alarm' });
  await expect(sheet.getByText('Look again: what can they capture after this?')).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole('button', { name: 'Rethink' }).click();
  await expect(sheet).toHaveCount(0);
  await playMove(page, 'b1c3');
  await expect(page.getByText('Maia is thinking…')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Your move')).toBeVisible({ timeout: 30_000 });
});

test('test mode plays the move without stopping, and resign shows a review', async ({ page }) => {
  await page.goto(url(HANG));
  await page.getByRole('switch', { name: 'Blunder alarm' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await playMove(page, 'f3g5');
  await expect(page.getByText('Maia is thinking…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('alertdialog', { name: 'Blunder alarm' })).toHaveCount(0);
  await expect(page.getByText('Your move')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Resign' }).click();
  await expect(page.getByText('You lost')).toBeVisible();
  await expect(page.getByText('Key moments')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Practise this' }).first()).toBeVisible({ timeout: 60_000 });
});

test('black-to-move positions are shown from black’s side and fit a small phone', async ({ page }, info) => {
  await page.goto(url('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2'));
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  if (info.project.name === 'small') expect(await noVerticalScroll(page)).toBe(true);
});

test('a game in progress survives a reload', async ({ page }) => {
  await page.goto('/#/play');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('.cg-wrap')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resign' })).toBeVisible();
});
