import { test, expect } from './helpers';

// CREW_URL=http://127.0.0.1:8788 npx playwright test e2e/screens-crew.spec.ts
const BASE = process.env.CREW_URL;
test.skip(!BASE, 'needs CREW_URL (wrangler dev)');
const DAY = 86_400_000;

for (const scheme of ['light', 'dark'] as const) {
  test(`crew screens ${scheme}`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const vp = { iphone: { width: 390, height: 844 }, small: { width: 375, height: 667 }, desktop: { width: 1440, height: 900 } }[info.project.name as 'iphone']!;
    const shot = (p: import('@playwright/test').Page, n: string) => p.waitForTimeout(400).then(() => p.screenshot({ path: `docs/design-review/crew/${info.project.name}-${scheme}-${n}.png` }));
    const people = [];
    for (const [name, hangs, n] of [['Olti', 0, 7], ['Arben', 1, 6], ['Dren', 3, 2]] as const) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, baseURL: BASE, isMobile: info.project.name !== 'desktop', hasTouch: info.project.name !== 'desktop' });
      await ctx.route('https://api.chess.com/**', (r) => r.abort());
      const p = await ctx.newPage();
      await p.goto('/');
      await expect(p.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 20_000 });
      await p.evaluate(({ hangs, n, DAY, name }) => new Promise<void>((res) => {
        const r = indexedDB.open('chess-coach');
        r.onsuccess = () => {
          const tx = r.result.transaction(['games', 'analyses'], 'readwrite');
          for (let i = 0; i < n; i++) {
            const url = `https://www.chess.com/game/live/${name}${Date.now()}${i}`;
            tx.objectStore('games').put({ url, endTime: Date.now() - i * DAY, timeClass: 'rapid', timeControl: '600+5', myColor: i % 2 ? 'b' : 'w', myRating: 600 + hangs * 40, oppRating: 640, oppName: 'stranger_' + i, result: i % 3 ? 'win' : 'loss', rules: 'chess', pgn: '[TimeControl "600+5"]\n\n1. e4 e5 2. Nf3 d6 3. Ng5 h6' });
            tx.objectStore('analyses').put({ url, engine: 'sf19-lite', nodes: 1, done: true, nextPly: 0,
              plies: [{ ply: 4, fenBefore: 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3', played: 'f3g5', best: 'd2d4', wcBefore: 0, wcAfter: -0.6, wcBest: 0.1, drop: 0.7, flag: 'blunder', label: 'hung-piece', hang: { square: 'g5', value: 3 }, pawnHang: false, freeMissed: false, candidates: [] }],
              stats: { ownMoves: 30, hangs: (i + hangs) % 3 === 0 ? 0 : hangs, pawnHangs: 0, freeMissed: i % 2, clockUsedPct: 0.4 + i * 0.05 } });
          }
          tx.oncomplete = () => { r.result.close(); res(); };
        };
      }), { hangs, n, DAY, name });
      people.push({ p, name });
    }
    const [a, ...rest] = people;
    await a.p.goto('/#/crew');
    await shot(a.p, 'join');
    await a.p.getByRole('tab', { name: 'Start a crew' }).click();
    await a.p.getByLabel('Crew name').fill('Saturday chess');
    await a.p.getByLabel('Your name').fill(a.name + scheme + info.project.name);
    await a.p.getByLabel('Passcode').fill('knight123');
    await a.p.getByRole('button', { name: 'Start crew' }).click();
    await shot(a.p, 'recovery');
    await a.p.getByRole('button', { name: 'I saved it' }).click();
    const code = await a.p.evaluate(async () => (await new Promise<any>((res) => { const r = indexedDB.open('chess-coach'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('crew-account'); q.onsuccess = () => res(q.result); }; })).code);
    for (const { p, name } of rest) {
      await p.goto('/#/crew');
      await p.getByLabel('Invite code').fill(code);
      await p.getByLabel('Your name').fill(name);
      await p.getByLabel('Passcode').fill('rook4567');
      await p.getByRole('button', { name: 'Join crew' }).click();
      await p.getByRole('button', { name: 'I saved it' }).click();
      await expect(p.locator('.feed-item').first()).toBeVisible();
    }
    await a.p.reload();
    await expect(a.p.locator('.board-list li')).toHaveCount(3, { timeout: 20_000 });
    await shot(a.p, 'home');
    await a.p.screenshot({ path: `docs/design-review/crew/${info.project.name}-${scheme}-home-full.png`, fullPage: true });
    await a.p.locator('.feed-item').first().click();
    await expect(a.p.getByText('Hung a piece').first()).toBeVisible();
    await shot(a.p, 'game');
  });
}
