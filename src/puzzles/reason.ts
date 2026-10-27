import { Chess, type Square } from 'chess.js';
import { forkTargets } from '../chess/tactics';
import { PIECE_NAMES } from '../chess/names';
import { pieceValue, staticExchange } from '../chess/material';
import { play } from '../chess/rules';
import type { Puzzle } from '../store/types';

const THEME_WORD: Record<string, string> = {
  hangingPiece: 'Free piece', mateIn1: 'Mate', mateIn2: 'Mate', fork: 'Fork', pin: 'Pin', skewer: 'Skewer',
  backRankMate: 'Back rank', discoveredAttack: 'Discovered attack',
};

/** One line explaining why `uci` is the move in this puzzle position. */
export function reasonFor(puzzle: Puzzle, fen: string, uci: string): string {
  const before = new Chess(fen);
  const after = play(fen, uci)!;
  const san = after.history()[0];
  if (after.isCheckmate()) return `Checkmate: ${san}.`;
  const to = uci.slice(2, 4) as Square;
  const moved = after.get(to)!;
  const fork = puzzle.themes.includes('fork') && forkTargets(after, to);
  if (fork) return `Fork: your ${PIECE_NAMES[moved.type]} attacks the ${PIECE_NAMES[fork[0]]} and the ${PIECE_NAMES[fork[1]]}.`;
  const captured = before.get(to);
  if (captured && captured.color !== moved.color && staticExchange(fen, uci) >= pieceValue(captured.type))
    return `Free piece: the ${PIECE_NAMES[captured.type]} on ${to} was undefended — take it.`;
  const word = puzzle.themes.map((t) => THEME_WORD[t]).find(Boolean) ?? 'Best';
  return `${word}: ${san} is the move.`;
}
