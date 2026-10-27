import { openDb, type DB } from '../store/db';
import type { Attempt, Drill, Puzzle } from '../store/types';
import { deviceId } from '../store/attempts';
import { dueItems } from '../puzzles/schedule';
import { pickNewPuzzles } from '../puzzles/select';

export type SessionItem = { id: string; kind: 'drill'; drill: Drill } | { id: string; kind: 'puzzle'; puzzle: Puzzle };
export interface Session { date: string; items: SessionItem[]; doneIds: string[] }

const SIZE = 10;
const MAX_DRILLS = 3;

export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Today's items: up to 3 drills (due first, then newest), due puzzle repeats, then new puzzles to 10. Stable for the day. */
export async function buildSession(now: number, attempts: Attempt[], drills: Drill[], db: DB, seed: number): Promise<Session> {
  const date = dayKey(now);
  const saved = (await db.get('kv', `session-${date}`)) as { itemIds: string[]; doneIds: string[] } | undefined;
  const drillById = new Map(drills.map((d) => [d.id, d]));
  if (saved) {
    const items: SessionItem[] = [];
    for (const id of saved.itemIds) {
      const key = id.slice(2);
      if (id.startsWith('d:')) {
        const d = drillById.get(key) ?? (await db.get('drills', key));
        if (d) items.push({ id, kind: 'drill', drill: d });
      } else {
        const p = await db.get('puzzles', key);
        if (p) items.push({ id, kind: 'puzzle', puzzle: p });
      }
    }
    return { date, items, doneIds: saved.doneIds };
  }

  const due = dueItems(attempts, now);
  const tried = new Set(attempts.map((a) => a.itemId));
  const dueDrills = due.filter((d) => d.kind === 'drill').map((d) => drillById.get(d.itemId)).filter((d): d is Drill => !!d);
  const newDrills = drills.filter((d) => !tried.has(d.id)).sort((a, b) => b.createdAt - a.createdAt);
  const items: SessionItem[] = [...dueDrills, ...newDrills].slice(0, MAX_DRILLS).map((d) => ({ id: `d:${d.id}`, kind: 'drill', drill: d }));

  for (const d of due.filter((x) => x.kind === 'puzzle')) {
    if (items.length >= SIZE) break;
    const p = await db.get('puzzles', d.itemId);
    if (p) items.push({ id: `p:${p.id}`, kind: 'puzzle', puzzle: p });
  }
  const fresh = await pickNewPuzzles(db, SIZE - items.length, attempts, seed);
  for (const p of fresh) items.push({ id: `p:${p.id}`, kind: 'puzzle', puzzle: p });

  await db.put('kv', { itemIds: items.map((i) => i.id), doneIds: [] }, `session-${date}`);
  return { date, items, doneIds: [] };
}

export async function markDone(now: number, itemId: string) {
  const d = await openDb();
  const key = `session-${dayKey(now)}`;
  const saved = (await d.get('kv', key)) as { itemIds: string[]; doneIds: string[] } | undefined;
  if (!saved || saved.doneIds.includes(itemId)) return;
  await d.put('kv', { ...saved, doneIds: [...saved.doneIds, itemId] }, key);
}

/** Distinct local days with any attempt since Monday 00:00 of this week. */
export function daysTrainedThisWeek(attempts: Attempt[], now: number): number {
  const d = new Date(now);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
  return new Set(attempts.filter((a) => a.ts >= monday && a.ts <= now).map((a) => dayKey(a.ts))).size;
}

/** Logs the attempt and marks the session item done in one transaction, so closing the app can't split them. */
export async function finishItem(now: number, itemId: string, a: Omit<Attempt, 'id' | 'device'>) {
  const db = await openDb();
  const device = await deviceId();
  const key = `session-${dayKey(now)}`;
  const tx = db.transaction(['attempts', 'kv'], 'readwrite');
  void tx.objectStore('attempts').put({ ...a, id: crypto.randomUUID(), device });
  const saved = (await tx.objectStore('kv').get(key)) as { itemIds: string[]; doneIds: string[] } | undefined;
  if (saved && !saved.doneIds.includes(itemId)) await tx.objectStore('kv').put({ ...saved, doneIds: [...saved.doneIds, itemId] }, key);
  await tx.done;
}
