import { test, expect, playMove, seedPlacement, skipQuiz } from './helpers';

test('the review steps through every move of the game', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone');
  await page.goto('/#/play/' + encodeURIComponent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
  await page.getByRole('radio', { name: 'Off' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await playMove(page, 'e2e4');
  await expect(page.getByText('Maia is thinking…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Your move')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('button', { name: 'Review game' }).click();
  await skipQuiz(page);
  await expect(page.getByText('Move 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Previous move' }).click();
  await expect(page.getByText('Move 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Previous move' }).click();
  await expect(page.getByText('Start position')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous move' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(page.getByText('Move 1 of 2')).toBeVisible();
});

test('the alarm header asks to check the move', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone');
  await page.goto('/#/play/' + encodeURIComponent('rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3'));
  await page.getByRole('button', { name: 'Start game' }).click();
  await playMove(page, 'f3g5');
  await expect(page.getByRole('alertdialog', { name: 'Blunder alarm' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.solver-head')).toContainText('Check your move');
});

test('content is centred on a wide screen and the chess.com card says where it goes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.setViewportSize({ width: 2400, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible({ timeout: 20_000 });
  await seedPlacement(page);
  await page.reload();
  const box = (await page.locator('.main').boundingBox())!;
  const free = 2400 - 220; // right of the side nav
  expect(Math.abs(box.x - 220 + box.width / 2 - free / 2)).toBeLessThan(60);
  await expect(page.getByRole('link', { name: /Open chess.com/ })).toBeVisible();
});
