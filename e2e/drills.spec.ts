import { expect, playMove, test } from './helpers';
import type { Page } from '@playwright/test';

const drill = {
  id: 'test-drill', fen: 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3', best: 'd2d4', played: 'f3g5',
  candidates: [{ uci: 'd2d4', wc: 0.2 }, { uci: 'f1c4', wc: 0.12 }, { uci: 'b1c3', wc: 0.05 }, { uci: 'f3g5', wc: -0.6 }],
  label: 'hung-piece', explanation: 'Your knight on g5 was left undefended — Qxg5 wins it.', source: 'chesscom', createdAt: 1, context: 'Your game vs kasparov99, 20 Oct',
};

async function seed(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible({ timeout: 20_000 });
  await page.evaluate((d) => new Promise<void>((res, rej) => {
    const r = indexedDB.open('chess-coach');
    r.onsuccess = () => { const tx = r.result.transaction('drills', 'readwrite'); tx.objectStore('drills').put(d); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = rej; };
  }), drill);
  await page.goto('/#/drill/test-drill');
}

test('a drill hides the answer, rejects the game move, accepts a good one', async ({ page }) => {
  await seed(page);
  await expect(page.getByText('You went wrong here. Find a better move.')).toBeVisible();
  await expect(page.getByText(/In the game you played/)).toHaveCount(0);
  await playMove(page, 'f3g5');
  await expect(page.getByText('Not quite — try again')).toBeVisible();
  await playMove(page, 'b1c3');
  await expect(page.getByText('That’s better')).toBeVisible();
  await expect(page.getByText('In the game you played Ng5. Your knight on g5 was left undefended — Qxg5 wins it.')).toBeVisible();
});

test('show me reveals after one miss', async ({ page }) => {
  await seed(page);
  await playMove(page, 'f3g5');
  await page.getByRole('button', { name: 'Show me' }).click();
  await expect(page.getByText('Here’s a better move')).toBeVisible();
});
