import { test, expect } from '@playwright/test';

test('the Stockfish lite worker runs in the browser and finds mate in one', async ({ page }) => {
  await page.goto('/');
  const best = await page.evaluate(() => new Promise<string>((resolve) => {
    const w = new Worker('/engine/stockfish-19-lite-single.js');
    w.onmessage = (e) => { if (String(e.data).startsWith('bestmove')) resolve(String(e.data).split(' ')[1]); };
    w.postMessage('uci');
    w.postMessage('position fen 6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
    w.postMessage('go nodes 50000');
  }));
  expect(best).toBe('d1d8');
});
