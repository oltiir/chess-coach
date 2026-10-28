import { expect, seedPlacement, test } from './helpers';
import type { Page } from '@playwright/test';


test.describe('coach drills', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible({ timeout: 20_000 });
    await seedPlacement(page);
    // Put the threat scan and safe-or-not first by building today’s session, then jumping straight to them via the kv order.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => new Promise<void>((res) => {
      const r = indexedDB.open('chess-coach');
      r.onsuccess = () => {
        const tx = r.result.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        const req = store.getAllKeys();
        req.onsuccess = () => {
          const key = (req.result as string[]).find((k) => String(k).startsWith('session-'))!;
          const g = store.get(key);
          g.onsuccess = () => {
            const s = g.result;
            const special = s.itemIds.filter((id: string) => /^[ts]:/.test(id));
            s.itemIds = [...special, ...s.itemIds.filter((id: string) => !/^[ts]:/.test(id))];
            store.put(s, key);
          };
        };
        tx.oncomplete = () => { r.result.close(); res(); };
      };
    }));
    await page.reload();
    await page.getByRole('button', { name: 'Start' }).click({ timeout: 20_000 });
  });

  test('threat scan: tap pieces, check the answer, green marks the truth', async ({ page }, info) => {
    await expect(page.getByText('Threat scan')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^It’s your move. If you passed/)).toBeVisible();
    await page.getByRole('button', { name: 'Nothing is loose' }).click();
    await expect(page.getByText(/Spot on|Not quite|Nothing was loose here/)).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/design-review/coach/${info.project.name}-threat.png` });
    await page.locator('.solver-foot').getByRole('button', { name: /^Next/ }).click();
    await expect(page.getByText(/^Safe or not\? 1\/5/)).toBeVisible();
    await page.screenshot({ path: `docs/design-review/coach/${info.project.name}-safe.png` });
    for (let k = 0; k < 5; k++) {
      await page.getByRole('button', { name: 'Not safe' }).click();
      await expect(page.getByText(/^(Right|Wrong) — it’s (safe|not safe)$/)).toBeVisible();
      if (k < 4) await page.getByRole('button', { name: 'Next position' }).click();
    }
    await expect(page.locator('.solver-foot').getByRole('button', { name: /\d\/5 right$/ })).toBeVisible();
    await page.screenshot({ path: `docs/design-review/coach/${info.project.name}-safe-done.png` });
  });
});
