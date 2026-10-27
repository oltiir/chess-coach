import { Chess } from 'chess.js';
import { ANALYSIS_NODES } from '../analysis/analyseGame';
import { explain } from '../analysis/classify';
import { play } from '../chess/rules';
import { winningChances } from '../chess/wc';
import type { EngineClient } from '../engine/client';
import { openDb } from '../store/db';
import type { Drill, GameAnalysis, GameRecord } from '../store/types';

const MISTAKE = 0.2;

const shortDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Every labelled mistake in an analysed game becomes a "find a better move" drill. */
export function makeDrills(a: GameAnalysis, g: GameRecord): Drill[] {
  const source = g.url.startsWith('bot:') ? 'bot' : 'chesscom';
  const context = source === 'bot' ? `Your practice game, ${shortDate(g.endTime)}` : `Your game vs ${g.oppName}, ${shortDate(g.endTime)}`;
  return a.plies
    .filter((p) => p.flag && p.label)
    .map((p) => ({
      id: `${a.url}#${p.ply}`, fen: p.fenBefore, best: p.best, played: p.played, candidates: p.candidates,
      label: p.label!, explanation: explain(p), source, createdAt: g.endTime, context,
    }));
}

export async function saveDrills(drills: Drill[]) {
  const db = await openDb();
  for (const d of drills) if (!(await db.get('drills', d.id))) await db.put('drills', d);
}

/** A move is good enough when it keeps within the mistake threshold of the best move. */
export async function acceptMove(d: Drill, uci: string, engine: EngineClient): Promise<boolean> {
  // Crew drills arrive without engine lines: score the best move first.
  const best = d.candidates.length
    ? Math.max(...d.candidates.map((c) => c.wc))
    : winningChances((await engine.analyse(d.fen, { nodes: ANALYSIS_NODES / 2 }))[0]?.score ?? { cp: 0 });
  const known = d.candidates.find((c) => c.uci === uci);
  if (known) return best - known.wc < MISTAKE;
  const after = play(d.fen, uci);
  if (!after) return false;
  if (after.isCheckmate()) return true;
  if (after.isDraw()) return best < MISTAKE;
  const [line] = await engine.analyse(after.fen(), { nodes: ANALYSIS_NODES / 2 });
  const s = line.score;
  const wc = -winningChances(s);
  return best - wc < MISTAKE;
}

/** iOS can restart the engine mid-check (app switch); try once more before giving up. */
export async function acceptWithRetry(d: Drill, uci: string, engine: EngineClient): Promise<boolean> {
  try { return await acceptMove(d, uci, engine); } catch { return acceptMove(d, uci, engine); }
}

export const playerColor = (fen: string) => (new Chess(fen).turn() === 'w' ? 'white' : 'black');
