import { test, expect } from './helpers';
import { playMove } from './helpers';

test('after the first visit the whole app works offline', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'iphone', 'one viewport is enough');
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 60_000 }).toBe(true);
  // wait for precache to finish (the model and runtime are large)
  await expect.poll(() => page.evaluate(async () => {
    const keys = await caches.keys();
    const all = (await Promise.all(keys.map(async (k) => (await (await caches.open(k)).keys()).map((r) => r.url)))).flat();
    return ['.onnx', 'stockfish-19-lite-single.wasm', 'ort-wasm', 'puzzles.tsv'].every((f) => all.some((u) => u.includes(f)));
  }), { timeout: 90_000 }).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /Start|Continue/ })).toBeVisible({ timeout: 20_000 });
  await page.goto('/#/puzzle/00rTX');
  await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
  await playMove(page, 'h4e1');
  await expect(page.getByText('Solved first try')).toBeVisible();
  await page.goto(`/#/play/${encodeURIComponent('rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3')}`);
  await page.getByRole('button', { name: 'Start game' }).click();
  await playMove(page, 'f3g5');
  await expect(page.getByRole('alertdialog', { name: 'Blunder alarm' })).toBeVisible({ timeout: 20_000 }); // engine works offline
  await page.getByRole('button', { name: 'Rethink' }).click();
  await playMove(page, 'b1c3');
  await expect(page.getByText('Your move')).toBeVisible({ timeout: 30_000 }); // Maia replied offline
});
