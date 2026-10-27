import { test, expect } from './helpers';

const tabs = [
  ['Today', 'today'],
  ['Puzzles', 'puzzles'],
  ['Play', 'play'],
  ['Progress', 'progress'],
  ['Settings', 'settings'],
] as const;

test('opens on Today and every tab is one tap away', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const [label, route] of tabs) {
    await nav.getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`#/${route}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
  }
  const box = await nav.boundingBox();
  const vp = page.viewportSize()!;
  if (info.project.name === 'desktop') expect(box!.x).toBe(0); // side nav on the left
  else expect(box!.y + box!.height).toBeGreaterThan(vp.height - 2); // bottom tab bar
  const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth);
  expect(overflow).toBe(true);
});
