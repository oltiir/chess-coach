import { Chess } from 'chess.js';
import { findHangs } from '../chess/material';
import { netHang } from '../analysis/analyseGame';
import { play } from '../chess/rules';
import { winningChances, type Score } from '../chess/wc';
import type { EngineClient } from '../engine/client';

export const ALARM_NODES = 80_000;
const flip = (s: Score): Score => (s.mate !== undefined ? { mate: -s.mate } : { cp: -(s.cp ?? 0) });

/** Should the coach stop this move before it is played? Hangs a piece (and isn't a sound sacrifice) or throws the game away. */
export async function checkMove(fenBefore: string, uci: string, engine: EngineClient): Promise<{ alarm: boolean; reason: 'hang' | 'drop' | null }> {
  const after = play(fenBefore, uci);
  if (!after || after.isCheckmate()) return { alarm: false, reason: null };
  const [best] = await engine.analyse(fenBefore, { nodes: ALARM_NODES });
  if (!best || best.uci === uci) return { alarm: false, reason: null };
  const wcBest = winningChances(best.score);
  const wcAfter = new Chess(after.fen()).isDraw() ? 0 : winningChances(flip((await engine.analyse(after.fen(), { nodes: ALARM_NODES }))[0]?.score ?? best.score));
  const drop = wcBest - wcAfter;
  const last = after.history({ verbose: true }).at(-1)!;
  const hang = netHang(last, findHangs(after.fen()));
  if (hang && hang.value >= 3 && drop > 0.1) return { alarm: true, reason: 'hang' };
  if (drop >= 0.3) return { alarm: true, reason: 'drop' };
  return { alarm: false, reason: null };
}
