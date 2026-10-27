import { test, expect } from '@playwright/test';
import { playMove } from './helpers';

// Captures every screen for design review: npx playwright test e2e/screens.spec.ts
const round = process.env.REVIEW_ROUND ?? 'r1';

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });
    const shot = async (page: import('@playwright/test').Page, name: string, project: string) =>
      (await page.waitForTimeout(400), page).screenshot({ path: `docs/design-review/${round}/${project}-${scheme}-${name}.png` });

    test('screens', async ({ page }, info) => {
      const p = info.project.name;
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 20_000 });
      await shot(page, 'today', p);
      await page.getByRole('button', { name: 'Start' }).click();
      await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
      await shot(page, 'today-running', p);
      await page.goto('/#/puzzles');
      await expect(page.locator('.ladder')).toBeVisible({ timeout: 20_000 });
      await shot(page, 'puzzles', p);
      await page.goto('/#/puzzle/00rTX');
      await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
      await playMove(page, 'h4h5');
      await expect(page.getByText('Not quite — try again')).toBeVisible();
      await shot(page, 'puzzle-retry', p);
      await playMove(page, 'h4h6');
      await expect(page.getByText(/Checkmate/)).toBeVisible();
      await shot(page, 'puzzle-reveal', p);
      for (const r of ['play', 'progress', 'settings']) {
        await page.goto(`/#/${r}`);
        await shot(page, r, p);
      }
    });
  });
}
