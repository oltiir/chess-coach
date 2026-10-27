// Fails the build when the app's download (gzip-compressed, as served) is over the 25 MB budget.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk('dist');
const raw = files.reduce((a, f) => a + statSync(f).size, 0);
const gz = files.reduce((a, f) => a + gzipSync(readFileSync(f), { level: 6 }).length, 0);
const mb = (n) => (n / 1024 / 1024).toFixed(1);
console.log(`dist: ${mb(raw)} MB raw, ${mb(gz)} MB compressed`);
if (gz > 25 * 1024 * 1024) { console.error('Over the 25 MB download budget'); process.exit(1); }
