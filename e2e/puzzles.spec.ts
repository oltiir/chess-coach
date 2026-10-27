import { expect, noVerticalScroll, playMove, test } from './helpers';

// 00rTX: White plays Rxd2, then Black mates with Qxe1#.
test('a black-to-move puzzle: try again, then reveal', async ({ page }, info) => {
  await page.goto('/#/puzzle/00rTX');
  const wrap = page.locator('.cg-wrap');
  await expect(wrap).toHaveClass(/orientation-black/, { timeout: 20_000 });
  await expect(page.getByText('Black to move')).toBeVisible();
  await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
  await playMove(page, 'h4h5');
  await expect(page.getByText('Not quite — try again')).toBeVisible();
  await expect(page.getByText(/Checkmate/)).toHaveCount(0);
  await playMove(page, 'h4h6');
  await expect(page.getByText('Checkmate: Qxe1#.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
  if (info.project.name === 'small') expect(await noVerticalScroll(page)).toBe(true);
});

test('solving first try', async ({ page }) => {
  await page.goto('/#/puzzle/00rTX');
  await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
  await playMove(page, 'h4e1');
  await expect(page.getByText('Solved first try')).toBeVisible();
});

test('puzzles screen shows the ladder and starts a set', async ({ page }) => {
  await page.goto('/#/puzzles');
  await expect(page.locator('.ladder').getByText('Hanging pieces')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Start 10 puzzles' }).click();
  await expect(page.locator('.cg-wrap')).toBeVisible();
  await expect(page.getByText('1 / 10')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
});
