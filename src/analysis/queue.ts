import type { EngineClient } from '../engine/client';
import { openDb } from '../store/db';
import type { GameAnalysis } from '../store/types';
import { ANALYSIS_NODES, analyseNextPly, newAnalysis } from './analyseGame';

interface Opts {
  nodes?: number;
  onPly?: (a: GameAnalysis, progress: { done: number; total: number }) => void;
  onGameDone?: (a: GameAnalysis) => void;
}

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** Analyses rapid and daily games, newest first, saving after every move so it can stop and resume at any time. */
export async function runQueue(signal: AbortSignal, engine: EngineClient, opts: Opts = {}) {
  const db = await openDb();
  const games = (await db.getAll('games'))
    .filter((g) => g.timeClass === 'rapid' || g.timeClass === 'daily')
    .sort((a, b) => b.endTime - a.endTime);
  const analyses = new Map((await db.getAll('analyses')).map((a) => [a.url, a]));
  const total = games.length;
  let done = games.filter((g) => analyses.get(g.url)?.done).length;
  for (const g of games) {
    let a = analyses.get(g.url) ?? newAnalysis(g, opts.nodes ?? ANALYSIS_NODES);
    if (a.done && analyses.has(g.url)) continue;
    while (!a.done) {
      if (signal.aborted || hidden()) return;
      a = await analyseNextPly(g, a, engine);
      await db.put('analyses', a);
      opts.onPly?.(a, { done, total });
    }
    await db.put('analyses', a);
    done++;
    opts.onGameDone?.(a);
  }
}
