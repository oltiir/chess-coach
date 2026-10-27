import { test as base, expect, type Page } from '@playwright/test';

/** Tests never hit the real chess.com API unless they route it themselves. */
export const test = base.extend<{ blockChessCom: void }>({
  blockChessCom: [async ({ page }, use) => {
    await page.route('https://api.chess.com/**', (r) => r.abort('internetdisconnected'));
    await use();
  }, { auto: true }],
});
export { expect };

/** Clicks a board square (e.g. "e2") taking the board orientation into account. */
export async function clickSquare(page: Page, sq: string) {
  const wrap = page.locator('.cg-wrap').first();
  const box = (await wrap.boundingBox())!;
  const black = await wrap.evaluate((el) => el.classList.contains('orientation-black'));
  const file = sq.charCodeAt(0) - 97;
  const rank = +sq[1] - 1;
  const s = box.width / 8;
  const x = black ? 7 - file : file;
  const y = black ? rank : 7 - rank;
  await page.mouse.click(box.x + x * s + s / 2, box.y + y * s + s / 2);
}

export async function playMove(page: Page, uci: string) {
  await clickSquare(page, uci.slice(0, 2));
  await clickSquare(page, uci.slice(2, 4));
  if (uci[4]) {
    const name = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[uci[4]]!;
    await page.getByRole('dialog', { name: 'Promote to' }).getByRole('button', { name }).click();
  }
}

export const noVerticalScroll = (page: Page) =>
  page.evaluate(() => document.scrollingElement!.scrollHeight <= innerHeight + 1);
