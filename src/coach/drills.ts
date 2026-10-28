import { Chess } from 'chess.js';
import { netHang } from '../analysis/analyseGame';
import { findHangs, pieceValue, staticExchange } from '../chess/material';
import { moveToUci, play } from '../chess/rules';

/** My pieces (side to move, worth ≥ 3) that the opponent could win if it were their move. */
export function looseSquares(fen: string): string[] {
  return looseCaptures(fen).map((c) => c.square);
}

/** For each of my loose pieces, the capture that wins it (the opponent's move, as UCI). */
export function looseCaptures(fen: string): { square: string; uci: string }[] {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  let them: Chess;
  try { them = new Chess(parts.join(' ')); } catch { return []; }
  const theirFen = them.fen();
  const loose = new Map<string, string>();
  for (const m of them.moves({ verbose: true })) {
    if (!m.captured || m.captured === 'k' || pieceValue(m.captured) < 3 || m.isEnPassant() || loose.has(m.to)) continue;
    if (staticExchange(theirFen, moveToUci(m)) >= 3) loose.set(m.to, moveToUci(m));
  }
  return [...loose].map(([square, uci]) => ({ square, uci }));
}

export const makeThreatScan = (fen: string) => ({ fen, answer: looseSquares(fen) });

/** Safe = after the move nothing worth ≥ 3 can be won (a recapture that only trades doesn't count). */
export function isSafe(fen: string, uci: string): boolean {
  const after = play(fen, uci);
  if (!after) return true;
  const last = after.history({ verbose: true }).at(-1)!;
  const h = netHang(last, findHangs(after.fen()));
  return !h || h.value < 3;
}

export interface SafeItem { fen: string; move: string; safe: boolean }

/** A candidate move from this position that is (un)safe as asked, or null if there is none. */
export function makeSafeOrNot(fen: string, wantSafe: boolean, rnd = Math.random): SafeItem | null {
  const c = new Chess(fen);
  const moves = c.moves({ verbose: true })
    .filter((m) => !m.san.includes('#'))
    .map(moveToUci)
    .filter((u) => isSafe(fen, u) === wantSafe);
  if (!moves.length) return null;
  return { fen, move: moves[Math.floor(rnd() * moves.length)], safe: wantSafe };
}
