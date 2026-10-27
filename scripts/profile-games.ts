// Analyses a player's recent chess.com rapid games with Stockfish (Node) and prints an error profile.
// Usage: npx tsx scripts/profile-games.ts <username> [maxGames]   (dev tool, not shipped)
import { createRequire } from 'node:module';
import { EngineClient } from '../src/engine/client';
import { analyseGame } from '../src/analysis/analyseGame';
import { toGameRecord, isStandard } from '../src/import/chesscom';
import { Chess } from 'chess.js';

const user = process.argv[2] ?? 'Oltii05';
const max = +(process.argv[3] ?? 40);

const ua = { 'user-agent': 'chess-coach-profile' };
const arch: string[] = (await (await fetch(`https://api.chess.com/pub/player/${user.toLowerCase()}/games/archives`, { headers: ua })).json()).archives;
const games = [];
for (const m of arch.reverse()) {
  const { games: gs } = await (await fetch(m, { headers: ua })).json();
  games.push(...gs.map((g: any) => ({ ...toGameRecord(g, user), rules: g.rules })).filter((g: any) => g.timeClass === 'rapid' && isStandard(g)).reverse());
  if (games.length >= max) break;
}
// Start the engine only after fetching: the Stockfish Node build clobbers globalThis.fetch.
const require = createRequire(import.meta.url);
const engine = new EngineClient(() => {
  let cb: (l: string) => void = () => {};
  const sf = require('stockfish')('lite-single', (line: string) => cb(line));
  return { post: (c) => sf.processCommand(c), onLine: (f) => { cb = f; }, terminate: () => sf.terminate?.() };
});
const label: Record<string, number> = {};
const hangPiece: Record<string, number> = {};
const phase = { opening: 0, middlegame: 0, endgame: 0 };
let ownMoves = 0, hangs = 0, free = 0, flagged = 0, n = 0;
const clock: number[] = [];
for (const g of games.slice(0, max)) {
  const a = await analyseGame(g, engine, 60_000);
  n++; ownMoves += a.stats.ownMoves; hangs += a.stats.hangs; free += a.stats.freeMissed;
  if (a.stats.clockUsedPct !== null) clock.push(a.stats.clockUsedPct);
  for (const p of a.plies) {
    if (p.flag) { flagged++; label[p.label ?? 'none'] = (label[p.label ?? 'none'] ?? 0) + 1; }
    if (p.hang) {
      const c = new Chess(p.fenBefore); c.move({ from: p.played.slice(0, 2), to: p.played.slice(2, 4), promotion: p.played[4] as any });
      const piece = c.get(p.hang.square as any)?.type ?? '?';
      hangPiece[piece] = (hangPiece[piece] ?? 0) + 1;
      const mv = Math.floor(p.ply / 2) + 1;
      if (mv <= 12) phase.opening++; else if (c.board().flat().filter(Boolean).length <= 14) phase.endgame++; else phase.middlegame++;
    }
  }
  process.stderr.write(`.${n}`);
}
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
console.log(JSON.stringify({ user, games: n, ownMoves, hangsPerGame: +(hangs / n).toFixed(2), freeMissedPerGame: +(free / n).toFixed(2),
  mistakesPerGame: +(flagged / n).toFixed(2), labels: label, hungPieceTypes: hangPiece, hangPhase: phase, avgClockUsed: +avg(clock).toFixed(2),
  results: games.slice(0, n).reduce((acc: any, g: any) => ((acc[g.result] = (acc[g.result] ?? 0) + 1), acc), {}) }, null, 1));
engine.terminate();
process.exit(0);
