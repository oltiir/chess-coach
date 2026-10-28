import { expect, playMove, seedPlacement, test } from './helpers';
import type { Page } from '@playwright/test';
import { solutionOf } from './puzzle-data';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible({ timeout: 20_000 });
}

/** Answers whatever the current session item is: puzzles correctly, threat scans and safe-or-not quickly. */
async function answerCurrent(page: Page) {
  const kind = await page.locator('.solver').first().getAttribute('class');
  if (kind?.includes('threat-scan')) { await page.getByRole('button', { name: 'Nothing is loose' }).click(); return; }
  if (kind?.includes('safe-or-not')) {
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: 'Safe', exact: true }).click();
      if (i < 4) await page.getByRole('button', { name: 'Next position' }).click();
    }
    return;
  }
  if (kind?.includes('drill')) { await page.getByRole('button', { name: 'Show me' }).click().catch(() => {}); return; }
  await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
  const moves = solutionOf((await page.locator('.solver').getAttribute('data-puzzle-id'))!)!;
  for (let i = 1; i < moves.length; i += 2) {
    await playMove(page, moves[i]);
    if (i + 2 < moves.length) await page.waitForTimeout(600);
  }
  await expect(page.getByText(/^Solved/)).toBeVisible();
}
const nextButton = (page: Page) => page.locator('.solver-foot').getByRole('button', { name: /^(Next|Finish)/ });

test('before placement, Today offers the placement test with the safety check', async ({ page }) => {
  await ready(page);
  await expect(page.getByRole('button', { name: 'Start placement' })).toBeVisible();
  await expect(page.getByText('What did their last move attack?')).toBeVisible();
});

test('the placement test sets a level after 16 puzzles', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone');
  test.setTimeout(180_000);
  await ready(page);
  await page.getByRole('button', { name: 'Start placement' }).click();
  for (let i = 0; i < 16; i++) {
    await expect(page.getByText(`Placement ${i + 1} / 16`)).toBeVisible({ timeout: 20_000 });
    await answerCurrent(page);
    await page.locator('.solver-foot').getByRole('button', { name: 'Next' }).click();
  }
  await expect(page.getByText(/^Your level: \d+/)).toBeVisible();
  await page.getByRole('button', { name: 'Build today’s session' }).click();
  await expect(page.getByText('14 items · about 15 minutes')).toBeVisible({ timeout: 20_000 });
});

test('after placement Today shows a 14-item plan with a reason, and the chess.com link', async ({ page }) => {
  await ready(page);
  await seedPlacement(page);
  await page.reload();
  await expect(page.getByText('14 items · about 15 minutes')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.plan-why')).toContainText(/mistakes|weakest/);
  await expect(page.getByRole('link', { name: /Before you play on chess.com/ })).toHaveAttribute('href', 'https://www.chess.com/play/online');
});

test('a session survives a reload mid-way and the summary survives too', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone');
  test.setTimeout(240_000);
  await ready(page);
  await seedPlacement(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start' }).click({ timeout: 20_000 });
  await answerCurrent(page);
  await nextButton(page).click();
  await answerCurrent(page);
  await page.waitForTimeout(300);
  await page.reload();
  await page.getByRole('button', { name: 'Continue (2/14)' }).click({ timeout: 20_000 });
  await expect(page.getByText('3 / 14')).toBeVisible();
  for (let i = 2; i < 14; i++) {
    await answerCurrent(page);
    await nextButton(page).click();
  }
  const line = await page.locator('.card', { hasText: 'Session done' }).locator('p').first().innerText();
  expect(line).toMatch(/^\d+ solved fast · \d+ solved slowly · \d+ missed$/);
  await page.reload();
  await expect(page.locator('.card', { hasText: 'Session done' }).locator('p').first()).toHaveText(line, { timeout: 20_000 });
});
