import type { GameAnalysis, GameStats } from '../store/types';

const toSec = (clk: string) => clk.split(':').reduce((a, x) => a * 60 + parseFloat(x), 0);

/** Share of the time budget (base + increment × own moves) the player used. Null for daily games or no clocks. */
export function clockUsedPct(pgn: string, color: 'w' | 'b'): number | null {
  const tc = /\[TimeControl "(\d+)(?:\+(\d+))?"\]/.exec(pgn);
  if (!tc) return null;
  const clocks = [...pgn.matchAll(/\[%clk ([\d:.]+)\]/g)].map((m) => toSec(m[1]));
  const own = clocks.filter((_, i) => i % 2 === (color === 'w' ? 0 : 1));
  if (!own.length) return null;
  const budget = +tc[1] + (+(tc[2] ?? 0)) * own.length;
  return Math.max(0, Math.min(1, (budget - own[own.length - 1]) / budget));
}

export function gameStats(a: GameAnalysis, pgn: string, color: 'w' | 'b', ownMoves: number): GameStats {
  return {
    ownMoves,
    hangs: a.plies.filter((p) => p.hang).length,
    pawnHangs: a.plies.filter((p) => p.pawnHang).length,
    freeMissed: a.plies.filter((p) => p.freeMissed).length,
    clockUsedPct: clockUsedPct(pgn, color),
  };
}
