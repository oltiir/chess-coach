import { test, expect } from './helpers';
import { readFileSync } from 'node:fs';

test('export a backup, re-import it (nothing new), import another device (new items)', async ({ page }) => {
  await page.goto('/#/puzzle/00rTX');
  await expect(page.getByText('Find the best move.')).toBeVisible({ timeout: 20_000 });
  await page.goto('/#/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^chess-coach-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.getByText('Backup imported: 0 new items')).toBeVisible();

  const backup = JSON.parse(readFileSync(path, 'utf8'));
  backup.attempts.push({ id: 'other-device-1', kind: 'puzzle', itemId: '00rTX', ts: Date.now(), firstTry: true, solved: true, ms: 4000, device: 'laptop', theme: 'mateIn1' });
  await page.locator('input[type=file]').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByText('Backup imported: 1 new item')).toBeVisible();
});

test('changing the username saves it and syncs', async ({ page }) => {
  await page.goto('/#/settings');
  const field = page.getByLabel('chess.com username');
  await expect(field).toHaveValue('Oltii05');
  let asked = '';
  await page.route('https://api.chess.com/**', (r) => { asked = r.request().url(); return r.fulfill({ status: 404, body: '' }); });
  await field.fill('someone_else');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => asked).toContain('/player/someone_else/');
  await page.reload();
  await expect(page.getByLabel('chess.com username')).toHaveValue('someone_else');
});

test('storage status is shown', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByText(/^(Protected|Not protected — export a backup regularly)$/)).toBeVisible({ timeout: 10_000 });
});
