import { test, expect, playMove } from './helpers';

const start = '/#/play/' + encodeURIComponent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

test('resigning while Maia is thinking sticks', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone');
  await page.goto(start);
  await page.getByRole('radio', { name: 'Off' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await playMove(page, 'e2e4');
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.waitForTimeout(2500);
  await expect(page.getByText('You resigned')).toBeVisible();
});

test('if Maia can’t load, the player is told and can retry', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone');
  await page.route('**/models/maia3-5m.fp16.onnx', (r) => r.abort());
  await page.goto(start);
  await page.getByRole('radio', { name: 'Off' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await playMove(page, 'e2e4');
  await expect(page.getByText('Maia couldn’t move.')).toBeVisible({ timeout: 20_000 });
  await page.unroute('**/models/maia3-5m.fp16.onnx');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Your move')).toBeVisible({ timeout: 30_000 });
});
