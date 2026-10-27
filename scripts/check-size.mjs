// Fails the build when the precached app is over the 25 MB budget
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [statSync(p).size];
});
const total = walk('dist').reduce((a, b) => a + b, 0);
const mb = (total / 1024 / 1024).toFixed(1);
console.log(`dist size: ${mb} MB`);
if (total > 25 * 1024 * 1024) { console.error('Over the 25 MB budget'); process.exit(1); }
