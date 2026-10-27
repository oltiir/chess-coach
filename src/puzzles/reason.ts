import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { PIECE_NAMES } from '../chess/names';
import { pieceValue, staticExchange } from '../chess/material';
import { play } from '../chess/rules';
import type { Puzzle } from '../store/types';

const THEME_WORD: Record<string, string> = {
  hangingPiece: 'Free piece', mateIn1: 'Mate', mateIn2: 'Mate', fork: 'Fork', pin: 'Pin', skewer: 'Skewer',
  backRankMate: 'Back rank', discoveredAttack: 'Discovered attack',
};

/** What the piece on `sq` attacks once it has moved (pieces only; the king shows up as check). */
export function attackedBy(after: Chess, sq: Square): PieceSymbol[] {
  const parts = after.fen().split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  let mover: Chess;
  try { mover = new Chess(parts.join(' ')); } catch { return []; }
  const hits = mover.moves({ square: sq, verbose: true }).filter((m) => m.captured && m.captured !== 'k').map((m) => m.captured!);
  return after.inCheck() ? ['k', ...hits] : hits;
}

/** One line explaining why `uci` is the move in this puzzle position. */
export function reasonFor(puzzle: Puzzle, fen: string, uci: string): string {
  const before = new Chess(fen);
  const after = play(fen, uci)!;
  const san = after.history()[0];
  if (after.isCheckmate()) return `Checkmate: ${san}.`;
  const to = uci.slice(2, 4) as Square;
  const moved = after.get(to)!;
  if (puzzle.themes.includes('fork')) {
    const hits = attackedBy(after, to).filter((p) => p === 'k' || pieceValue(p) > pieceValue(moved.type));
    if (hits.length >= 2) {
      const [a, b] = hits.sort((x, y) => (x === 'k' ? -1 : y === 'k' ? 1 : pieceValue(y) - pieceValue(x)));
      return `Fork: your ${PIECE_NAMES[moved.type]} attacks the ${PIECE_NAMES[a]} and the ${PIECE_NAMES[b]}.`;
    }
  }
  const captured = before.get(to);
  if (captured && captured.color !== moved.color && staticExchange(fen, uci) >= pieceValue(captured.type))
    return `Free piece: the ${PIECE_NAMES[captured.type]} on ${to} was undefended — take it.`;
  const word = puzzle.themes.map((t) => THEME_WORD[t]).find(Boolean) ?? 'Best';
  return `${word}: ${san} is the move.`;
}
