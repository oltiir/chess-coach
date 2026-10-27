import type { Attempt, ItemKind } from '../store/types';

const DAY = 86_400_000;
const INTERVALS = [1, 3, 7, 21];
const FAST_MS = 10_000; // time to first move that counts as "automatic"

/**
 * Items that need another go. A miss comes back after 1 day; each fast first-try solve moves it on
 * (3, then 7 days); a slow but correct solve repeats the interval; a miss restarts. It retires after a
 * fast first-try solve at the 7-day review.
 */
export function dueItems(attempts: Attempt[], now: number): { kind: ItemKind; itemId: string }[] {
  const byItem = new Map<string, Attempt[]>();
  for (const a of attempts) byItem.set(a.itemId, [...(byItem.get(a.itemId) ?? []), a]);
  const due: { kind: ItemKind; itemId: string; at: number }[] = [];
  for (const [itemId, list] of byItem) {
    list.sort((a, b) => a.ts - b.ts);
    let stage = -1; // -1: never missed
    let retired = false;
    for (const a of list) {
      if (!a.firstTry) { stage = 0; retired = false; continue; }
      if (stage < 0 || retired) continue;
      const fast = (a.firstMoveMs ?? 0) <= FAST_MS;
      if (!fast) continue;
      if (stage >= 2) retired = true; else stage++;
    }
    if (stage < 0 || retired) continue;
    const last = list[list.length - 1];
    const at = last.ts + INTERVALS[stage] * DAY;
    if (at <= now) due.push({ kind: last.kind, itemId, at });
  }
  return due.sort((a, b) => a.at - b.at).map(({ kind, itemId }) => ({ kind, itemId }));
}
