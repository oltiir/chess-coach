import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import { moveToUci, parseUci } from './rules';

const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const pieceValue = (p: PieceSymbol) => VALUES[p];
const order = (p: PieceSymbol) => (p === 'k' ? 100 : VALUES[p]);

const capturesOn = (c: Chess, sq: string) =>
  c.moves({ verbose: true }).filter((m) => m.to === sq && m.captured && !m.isEnPassant());

/** Value the side to move can still win on `sq` by a swap-off, never below 0 (they can stop). */
function see(c: Chess, sq: Square): number {
  const caps = capturesOn(c, sq);
  if (!caps.length) return 0;
  const m = caps.reduce((a, b) => (order(b.piece) < order(a.piece) ? b : a));
  const target = VALUES[c.get(sq)!.type];
  c.move(m);
  const reply = see(c, sq);
  c.undo();
  return Math.max(0, target - reply);
}

/** Net material (pawns) the capturer gains by making this capture, then swapping off on that square. */
export function staticExchange(fen: string, captureUci: string): number {
  const c = new Chess(fen);
  const m = c.move(parseUci(captureUci));
  return VALUES[m.captured!] - see(c, m.to);
}

/** The capture with the highest positive exchange value for the side to move. */
export function bestCapture(fen: string): { uci: string; gain: number; square: string } | null {
  const c = new Chess(fen);
  let best: { uci: string; gain: number; square: string } | null = null;
  for (const m of c.moves({ verbose: true }) as Move[]) {
    if (!m.captured) continue;
    const gain = m.isEnPassant() ? 1 : staticExchange(fen, moveToUci(m));
    if (gain > 0 && (!best || gain > best.gain)) best = { uci: moveToUci(m), gain, square: m.to };
  }
  return best;
}

/** After my move (opponent to move): what of mine can they win, if anything. */
export function findHangs(fenAfterMyMove: string): { square: string; value: number } | null {
  const b = bestCapture(fenAfterMyMove);
  return b ? { square: b.square, value: b.gain } : null;
}
