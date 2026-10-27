import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icons/icon.svg', 'utf8');
const b = await chromium.launch();
for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['maskable-512.png', 512, 0.12], ['apple-touch-icon.png', 180, 0]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  const inner = Math.round(size * (1 - 2 * pad));
  await p.setContent(`<body style="margin:0;background:#2a7254;display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body>`);
  await p.screenshot({ path: `public/icons/${name}` });
}
await b.close();
