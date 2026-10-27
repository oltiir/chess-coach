import { Chess, SQUARES, type Square } from 'chess.js';

export const parseUci = (uci: string) => ({
  from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] as 'q' | 'r' | 'b' | 'n' | undefined,
});

export const moveToUci = (m: { from: string; to: string; promotion?: string }) => m.from + m.to + (m.promotion ?? '');

/** Plays a UCI move on a copy; returns null when illegal. */
export function play(fen: string, uci: string): Chess | null {
  const c = new Chess(fen);
  try { c.move(parseUci(uci)); return c; } catch { return null; }
}

export function uciToSan(fen: string, uci: string): string {
  const c = new Chess(fen);
  return c.move(parseUci(uci)).san;
}

export function legalDests(fen: string): Map<string, string[]> {
  const c = new Chess(fen);
  const m = new Map<string, string[]>();
  for (const sq of SQUARES) {
    const ms = c.moves({ square: sq, verbose: true });
    if (ms.length) m.set(sq, [...new Set(ms.map((x) => x.to))]);
  }
  return m;
}

export const sideToMove = (fen: string): 'w' | 'b' => (fen.split(' ')[1] as 'w' | 'b');

export const isPromotion = (fen: string, from: string, to: string) => {
  const p = new Chess(fen).get(from as Square);
  return p?.type === 'p' && (to[1] === '8' || to[1] === '1');
};
