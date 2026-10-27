import { Chess, type Square } from 'chess.js';
import { PIECE_NAMES } from '../chess/names';
import { bestCapture } from '../chess/material';
import { play, uciToSan } from '../chess/rules';
import { forkTargets, lineAttack } from '../chess/tactics';
import type { Score } from '../chess/wc';
import type { MistakeLabel, PlyAnalysis } from '../store/types';

/** Scores from the player's point of view, before (best play) and after their move. */
export function labelMistake(p: PlyAnalysis, best: Score, after: Score): MistakeLabel {
  if (after.mate !== undefined && after.mate < 0 && !(best.mate !== undefined && best.mate < 0)) return 'allowed-mate';
  if (best.mate !== undefined && best.mate > 0 && !(after.mate !== undefined && after.mate > 0)) return 'missed-mate';
  if (p.hang) return 'hung-piece';
  if (p.freeMissed) return 'missed-free-piece';
  const afterBest = play(p.fenBefore, p.best);
  if (afterBest) {
    const to = p.best.slice(2, 4) as Square;
    if (forkTargets(afterBest, to)) return 'missed-fork';
    const line = lineAttack(afterBest, to);
    if (line) return line.kind === 'pin' ? 'missed-pin' : 'missed-skewer';
  }
  return 'other';
}

/** One plain sentence about the mistake. Falls back to naming the better move when unsure. */
export function explain(p: PlyAnalysis): string {
  const bestSan = uciToSan(p.fenBefore, p.best);
  const afterPlayed = play(p.fenBefore, p.played)!;
  const before = new Chess(p.fenBefore);
  switch (p.label) {
    case 'hung-piece': {
      const piece = afterPlayed.get(p.hang!.square as Square)!;
      const cap = bestCapture(afterPlayed.fen())!;
      return `Your ${PIECE_NAMES[piece.type]} on ${p.hang!.square} was left undefended — ${uciToSan(afterPlayed.fen(), cap.uci)} wins it.`;
    }
    case 'missed-free-piece': {
      const cap = bestCapture(p.fenBefore)!;
      return `Their ${PIECE_NAMES[before.get(cap.square as Square)!.type]} on ${cap.square} was free — ${uciToSan(p.fenBefore, cap.uci)} wins it.`;
    }
    case 'missed-fork': {
      const [a, b] = forkTargets(play(p.fenBefore, p.best)!, p.best.slice(2, 4) as Square)!;
      return `${bestSan} forks the ${PIECE_NAMES[a]} and the ${PIECE_NAMES[b]}.`;
    }
    case 'missed-pin':
    case 'missed-skewer': {
      const l = lineAttack(play(p.fenBefore, p.best)!, p.best.slice(2, 4) as Square)!;
      return l.kind === 'pin'
        ? `${bestSan} pins the ${PIECE_NAMES[l.front]} to the ${PIECE_NAMES[l.back]}.`
        : `${bestSan} skewers the ${PIECE_NAMES[l.front]} and wins the ${PIECE_NAMES[l.back]} behind it.`;
    }
    case 'missed-mate': return `You had checkmate: ${bestSan}.`;
    case 'allowed-mate': return `This lets them force checkmate. ${bestSan} was safe.`;
    default: return `This lost ground. Best was ${bestSan}.`;
  }
}
