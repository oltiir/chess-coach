import { test, expect, playMove, skipQuiz } from './helpers';

const MATE_IN_ONE = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';

test('after checkmate the final position stays on screen with the result', async ({ page }) => {
  await page.goto('/#/play/' + encodeURIComponent(MATE_IN_ONE));
  await page.getByRole('button', { name: 'Start game' }).click();
  await playMove(page, 'd1d8');
  const result = page.getByRole('status', { name: 'Game result' });
  await expect(result.getByText('Checkmate — you won')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.cg-wrap')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('.cg-wrap')).toBeVisible(); // still there, not replaced
  await expect(result.getByRole('button', { name: 'Review game' })).toBeVisible();
  await expect(result.getByRole('button', { name: 'New game' })).toBeVisible();
});

test('the review shows each key moment on the board', async ({ page }) => {
  await page.goto('/#/play/' + encodeURIComponent('rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3'));
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('radio', { name: 'Off' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await playMove(page, 'f3g5');
  await expect(page.getByText('Your move')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('button', { name: 'Review game' }).click();
  await skipQuiz(page);
  await expect(page.locator('.cg-wrap')).toBeVisible();
  const moment = page.getByRole('button', { name: /^Move \d+: Ng5/ });
  await expect(moment).toBeVisible({ timeout: 60_000 });
  await moment.click();
  await expect(page.getByText(/Your knight on g5 was left undefended/)).toBeVisible();
  await expect(page.locator('.cg-wrap svg.cg-shapes line, .cg-wrap svg.cg-shapes path').first()).toBeAttached();
  await expect(page.getByRole('button', { name: 'Added to Today' })).toBeVisible(); // key moments are saved as drills automatically
});
