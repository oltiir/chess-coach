import { expect, noVerticalScroll, playMove, test } from './helpers';
import { MATE } from './puzzle-data';

test('a black-to-move puzzle: try again, then reveal', async ({ page }, info) => {
  await page.goto(`/#/puzzle/${MATE.id}`);
  const wrap = page.locator('.cg-wrap');
  await expect(wrap).toHaveClass(/orientation-black/, { timeout: 20_000 });
  await expect(page.getByText('Black to move')).toBeVisible();
  await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
  await playMove(page, MATE.wrong[0]);
  await expect(page.getByText('Not quite — try again')).toBeVisible();
  await expect(page.getByText(/Checkmate/)).toHaveCount(0);
  await playMove(page, MATE.wrong[1]);
  await expect(page.getByText(`Checkmate: ${MATE.san}.`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
  if (info.project.name === 'small') expect(await noVerticalScroll(page)).toBe(true);
});

test('solving first try', async ({ page }) => {
  await page.goto(`/#/puzzle/${MATE.id}`);
  await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
  await playMove(page, MATE.solution);
  await expect(page.getByText('Solved first try')).toBeVisible();
});

test('puzzles screen shows theme ratings and starts a set', async ({ page }) => {
  await page.goto('/#/puzzles');
  await expect(page.getByText('Pins & skewers')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Start 10 puzzles' }).click();
  await expect(page.locator('.cg-wrap')).toBeVisible();
  await expect(page.getByText('1 / 10')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
});
