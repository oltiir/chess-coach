import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { pieceValue } from './material';

/** What the piece on `sq` attacks once it has moved (the king shows up when it gives check). */
export function attackedBy(after: Chess, sq: Square): PieceSymbol[] {
  const parts = after.fen().split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  let mover: Chess;
  try { mover = new Chess(parts.join(' ')); } catch { return []; }
  const hits = mover.moves({ square: sq, verbose: true }).filter((m) => m.captured && m.captured !== 'k').map((m) => m.captured!);
  return after.inCheck() ? ['k', ...hits] : hits;
}

/** The two biggest targets of a fork made by the piece now on `sq`, or null. */
export function forkTargets(after: Chess, sq: Square): [PieceSymbol, PieceSymbol] | null {
  const piece = after.get(sq);
  if (!piece) return null;
  const hits = attackedBy(after, sq)
    .filter((p) => p === 'k' || pieceValue(p) > pieceValue(piece.type))
    .sort((x, y) => (x === 'k' ? -1 : y === 'k' ? 1 : pieceValue(y) - pieceValue(x)));
  return hits.length >= 2 ? [hits[0], hits[1]] : null;
}

const RAYS: Record<string, [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};

/** A pin or skewer made by the slider now on `sq`: front piece, back piece. */
export function lineAttack(after: Chess, sq: Square): { kind: 'pin' | 'skewer'; front: PieceSymbol; back: PieceSymbol } | null {
  const me = after.get(sq);
  if (!me || !RAYS[me.type]) return null;
  for (const [df, dr] of RAYS[me.type]) {
    const found: PieceSymbol[] = [];
    let f = sq.charCodeAt(0) - 97 + df;
    let r = +sq[1] - 1 + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8 && found.length < 2) {
      const p = after.get((String.fromCharCode(97 + f) + (r + 1)) as Square);
      if (p) { if (p.color === me.color) break; found.push(p.type); }
      f += df; r += dr;
    }
    if (found.length < 2) continue;
    const [front, back] = found;
    const v = (p: PieceSymbol) => (p === 'k' ? 100 : pieceValue(p));
    if (v(back) > v(front) && v(back) > pieceValue(me.type)) return { kind: 'pin', front, back };
    if (v(front) > v(back) && v(back) >= 3) return { kind: 'skewer', front, back };
  }
  return null;
}
