export interface Score { cp?: number; mate?: number }

/** Lichess winning-chances model: maps an engine score to [-1, 1]. Mate counts as ±1000cp. */
export function winningChances(s: Score): number {
  const cp = s.mate !== undefined ? (s.mate > 0 ? 1000 : -1000) : Math.max(-1000, Math.min(1000, s.cp ?? 0));
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
}

/** Both values from the mover's point of view. */
export function judgeDrop(before: number, after: number): 'blunder' | 'mistake' | 'inaccuracy' | null {
  const d = before - after;
  if (d >= 0.3) return 'blunder';
  if (d >= 0.2) return 'mistake';
  if (d >= 0.1) return 'inaccuracy';
  return null;
}
