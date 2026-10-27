/*
 * Board and move encoding for Maia-3, ported from https://github.com/CSSLab/maia3
 * (maia3/dataset.py tokenize_board, maia3/utils.py get_all_possible_moves / mirror_move). AGPL-3.0.
 * The board is always seen from the side to move: for Black it is mirrored top-to-bottom with colours swapped.
 */
import { Chess, type PieceSymbol } from 'chess.js';

const FILES = 'abcdefgh';
const sqName = (i: number) => FILES[i % 8] + (Math.floor(i / 8) + 1);

export const MOVE_VOCAB: string[] = (() => {
  const v: string[] = [];
  for (let from = 0; from < 64; from++) for (let to = 0; to < 64; to++) v.push(sqName(from) + sqName(to));
  for (const f of FILES) for (const t of FILES) for (const p of 'qrbn') v.push(`${f}7${t}8${p}`);
  return v;
})();
const INDEX = new Map(MOVE_VOCAB.map((m, i) => [m, i]));

const CHANNEL: Record<PieceSymbol, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };
const mirror = (uci: string) => uci[0] + (9 - +uci[1]) + uci[2] + (9 - +uci[3]) + uci.slice(4);

/** 64×12 one-hot board (square index = rank*8 + file), channels 0-5 side-to-move's colour after mirroring. */
export function boardToTokens(fen: string): Float32Array {
  const c = new Chess(fen);
  const black = c.turn() === 'b';
  const t = new Float32Array(64 * 12);
  c.board().forEach((row, r) => row.forEach((p, f) => {
    if (!p) return;
    const rank = 7 - r; // board() starts at rank 8
    const sq = (black ? 7 - rank : rank) * 8 + f;
    const isBlack = (p.color === 'b') !== black;
    t[sq * 12 + CHANNEL[p.type] + (isBlack ? 6 : 0)] = 1;
  }));
  return t;
}

export function moveIndex(uci: string, blackToMove: boolean): number {
  return INDEX.get(blackToMove ? mirror(uci) : uci) ?? -1;
}
