import type { Attempt, ItemKind } from '../store/types';

const DAY = 86_400_000;
const INTERVALS = [1, 3, 7, 21];

/**
 * Items that need another go: anything missed comes back after 1 day, then 3 days after a clean
 * (first-try) solve, and retires after two clean solves in a row. A miss restarts it.
 */
export function dueItems(attempts: Attempt[], now: number): { kind: ItemKind; itemId: string }[] {
  const byItem = new Map<string, Attempt[]>();
  for (const a of attempts) byItem.set(a.itemId, [...(byItem.get(a.itemId) ?? []), a]);
  const due: { kind: ItemKind; itemId: string; at: number }[] = [];
  for (const [itemId, list] of byItem) {
    list.sort((a, b) => a.ts - b.ts);
    let missed = false;
    let clean = 0;
    for (const a of list) {
      if (!a.firstTry) { missed = true; clean = 0; } else if (missed) clean++;
    }
    if (!missed || clean >= 2) continue;
    const last = list[list.length - 1];
    const at = last.ts + INTERVALS[Math.min(clean, INTERVALS.length - 1)] * DAY;
    if (at <= now) due.push({ kind: last.kind, itemId, at });
  }
  return due.sort((a, b) => a.at - b.at).map(({ kind, itemId }) => ({ kind, itemId }));
}
