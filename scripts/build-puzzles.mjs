// Builds public/data/puzzles.tsv: ~30k easy, popular Lichess puzzles (CC0) spread over the theme ladder.
// Usage: curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | node scripts/build-puzzles.mjs
// (Node's built-in zstd rejects the Lichess file's long-window frames, so decompress outside.)
import { writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

export const LADDER_THEMES = ['hangingPiece', 'mateIn1', 'fork', 'pin', 'skewer', 'backRankMate', 'mateIn2', 'discoveredAttack'];
const TOTAL = 30_000;

export function filterRow(c) {
  const [id, fen, moves, rating, rd, pop, plays, themes] = c;
  const r = +rating;
  if (r < 400 || r > 1400 || +rd > 90 || +pop < 80 || +plays < 100) return null;
  const t = themes.split(' ');
  if (!t.some((x) => LADDER_THEMES.includes(x))) return null;
  return { id, fen, moves: moves.split(' '), rating: r, themes: t };
}

async function main() {
  const lines = createInterface({ input: process.stdin });
  const byTheme = new Map(LADDER_THEMES.map((t) => [t, []]));
  let n = 0;
  for await (const line of lines) {
    if (n++ === 0) continue; // header
    const p = filterRow(line.split(','));
    if (p) for (const t of p.themes) byTheme.get(t)?.push(p);
  }
  const picked = new Map();
  const quota = Math.floor(TOTAL / LADDER_THEMES.length);
  // Rarest themes first so they get their full quota; leftovers go to the bigger themes.
  const order = [...byTheme.entries()].sort((a, b) => a[1].length - b[1].length);
  let carry = 0;
  for (const [i, [, list]] of order.entries()) {
    const want = quota + (i === order.length - 1 ? TOTAL - quota * order.length : 0) + carry;
    list.sort((a, b) => (a.id < b.id ? -1 : 1));
    const fresh = list.filter((p) => !picked.has(p.id));
    const step = Math.max(1, fresh.length / want);
    let got = 0;
    for (let k = 0; k < fresh.length && got < want; k += step, got++) picked.set(fresh[Math.floor(k)].id, fresh[Math.floor(k)]);
    carry = want - got;
  }
  mkdirSync('public/data', { recursive: true });
  const out = [...picked.values()].map((p) => [p.id, p.fen, p.moves.join(' '), p.rating, p.themes.join(' ')].join('\t'));
  writeFileSync('public/data/puzzles.tsv', out.join('\n') + '\n');
  console.log(`read ${n - 1} rows, wrote ${out.length} puzzles`);
  for (const [t, l] of byTheme) console.log(`  ${t}: ${l.length} candidates`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
