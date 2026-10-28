/**
 * Faded scaffolding for the blunder alarm: 0 = stop before the move, 1 = flag after it, 2 = off.
 * Up a stage after 2 clean games in a row (no hangs, at most 1 alarm/flag); down a stage after 3+ hangs.
 */
export interface StageState { stage: number; good: number }
export const STAGE_LABELS = ['Stop me before a blunder', 'Flag it after I move', 'Off — test mode'];

export function nextStage(s: StageState, game: { hangs: number; helps: number }): StageState {
  if (game.hangs >= 3) return { stage: Math.max(0, s.stage - 1), good: 0 };
  if (game.hangs > 0 || game.helps > 1) return { stage: s.stage, good: 0 };
  const good = s.good + 1;
  return good >= 2 ? { stage: Math.min(2, s.stage + 1), good: 0 } : { stage: s.stage, good };
}
