import { test, expect, playMove } from './helpers';

const start = '/#/play/' + encodeURIComponent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

test('a moved piece stays where you put it while the alarm checks it', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone');
  await page.goto(start);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByText('Your move')).toBeVisible();
  // the e-pawn's vertical position: rank 2 is the 7th row from the top
  const ePawnRows = () => page.evaluate(() => {
    const wrap = document.querySelector('.cg-wrap')!.getBoundingClientRect();
    const sq = wrap.width / 8;
    return [...document.querySelectorAll('piece.pawn.white:not(.ghost)')]
      .map((e) => (e as HTMLElement).style.transform.match(/translate\(([\d.]+)px, ([\d.]+)px\)/)!)
      .filter((m) => Math.round(+m[1] / sq) === 4)
      .map((m) => +m[2] / sq);
  });
  await playMove(page, 'e2e4');
  let last = 7;
  for (let i = 0; i < 15; i++) {
    const [row] = await ePawnRows();
    expect(row, `e-pawn slid back toward e2 at ${i * 50}ms`).toBeLessThanOrEqual(last + 0.01);
    last = row;
    await page.waitForTimeout(50);
  }
  expect(last).toBeCloseTo(4, 0);
});

test('the page never freezes while Maia thinks', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone');
  await page.addInitScript(() => {
    (window as any).__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window as any).__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] });
  });
  await page.goto(start);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByText('Your move')).toBeVisible();
  await page.evaluate(() => { (window as any).__long = []; });
  for (const m of ['e2e4', 'd2d4']) {
    await playMove(page, m);
    await expect(page.getByText('Maia is thinking…')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Your move')).toBeVisible({ timeout: 30_000 });
    if (await page.getByRole('alertdialog').count()) break;
  }
  const long: number[] = await page.evaluate(() => (window as any).__long);
  expect(Math.max(0, ...long), `long tasks: ${long}`).toBeLessThan(150);
});
