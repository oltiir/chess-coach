import { openDb, type DB } from '../store/db';
import type { Attempt, Drill, Puzzle } from '../store/types';
import { deviceId } from '../store/attempts';
import { dueItems } from '../puzzles/schedule';
import { play } from '../chess/rules';
import { coachState } from '../coach/coach';
import { makeSafeOrNot, makeThreatScan, type SafeItem } from '../coach/drills';
import { groupsOf } from '../coach/groups';
import { orderGroups, pickPuzzle, whyLine } from '../coach/plan';

export type SessionItem =
  | { id: string; kind: 'drill'; drill: Drill }
  | { id: string; kind: 'puzzle'; puzzle: Puzzle; group?: string; review?: boolean }
  | { id: string; kind: 'threat'; fen: string; answer: string[] }
  | { id: string; kind: 'safe'; items: SafeItem[] };
export interface Session { date: string; items: SessionItem[]; doneIds: string[]; why: string; top: string }
interface Saved { itemIds: string[]; doneIds: string[]; data: Record<string, unknown>; why: string; top: string }

export const SIZE = 14;
const MAX_DRILLS = 3;
const MAX_REVIEWS = 3;
const DEFENCE = 2;

export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Positions where it's the player's move: from his own analysed games first, else from puzzles after their first move. */
async function practicePositions(db: DB, rnd: () => number): Promise<string[]> {
  const own = (await db.getAll('analyses')).filter((a) => a.done && !a.failed).flatMap((a) => a.plies.map((p) => p.fenBefore)).filter(Boolean);
  const puzzles = (await db.getAll('puzzles', undefined, 400)).map((p) => play(p.fen, p.moves[0])?.fen()).filter((f): f is string => !!f);
  const shuffle = (xs: string[]) => xs.map((x) => [rnd(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  return [...shuffle(own), ...shuffle(puzzles)];
}

/** 14 interleaved items: own-mistake drills, due reviews, a threat scan, a safe-or-not block, defence and new puzzles. Stable for the day. */
export async function buildSession(now: number, attempts: Attempt[], drills: Drill[], db: DB, rnd = Math.random): Promise<Session> {
  const date = dayKey(now);
  const key = `session-${date}`;
  const due = dueItems(attempts, now);
  const dueIds = new Set(due.map((d) => d.itemId));
  const drillById = new Map(drills.map((d) => [d.id, d]));
  const saved = (await db.get('kv', key)) as Saved | undefined;
  if (saved?.data) {
    // Drills found since the session was built join the unfinished part, replacing new puzzles from the end.
    const tried = new Set(attempts.map((a) => a.itemId));
    const haveDrills = saved.itemIds.filter((id) => id.startsWith('d:')).length;
    const late = drills
      .filter((d) => !tried.has(d.id) && !saved.itemIds.includes(`d:${d.id}`))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.max(0, MAX_DRILLS - haveDrills))
      .map((d) => `d:${d.id}`);
    if (late.length) {
      const done = saved.itemIds.filter((id) => saved.doneIds.includes(id));
      const open = saved.itemIds.filter((id) => !saved.doneIds.includes(id));
      const removable = open.filter((id) => id.startsWith('p:') && !dueIds.has(id.slice(2))).reverse();
      const drop = new Set(removable.slice(0, Math.max(0, done.length + late.length + open.length - SIZE)));
      saved.itemIds = [...done, ...late, ...open.filter((id) => !drop.has(id))];
      await db.put('kv', saved, key);
    }
    const items: SessionItem[] = [];
    for (const id of saved.itemIds) {
      if (id.startsWith('d:')) {
        const d = drillById.get(id.slice(2)) ?? (await db.get('drills', id.slice(2)));
        if (d) items.push({ id, kind: 'drill', drill: d });
      } else if (id.startsWith('p:')) {
        const p = await db.get('puzzles', id.slice(2));
        const extra = (saved.data[id] ?? {}) as { group?: string; review?: boolean };
        if (p) items.push({ id, kind: 'puzzle', puzzle: p, ...extra });
      } else if (saved.data[id]) items.push({ id, ...(saved.data[id] as object) } as SessionItem);
    }
    return { date, items, doneIds: saved.doneIds, why: saved.why, top: saved.top };
  }

  const tried = new Set(attempts.map((a) => a.itemId));
  const dueDrills = due.filter((d) => d.kind === 'drill').map((d) => drillById.get(d.itemId)).filter((d): d is Drill => !!d);
  const newDrills = drills.filter((d) => !tried.has(d.id)).sort((a, b) => b.createdAt - a.createdAt);
  const drillItems: SessionItem[] = [...dueDrills, ...newDrills].slice(0, MAX_DRILLS).map((d) => ({ id: `d:${d.id}`, kind: 'drill', drill: d }));
  const reviewItems: SessionItem[] = [];
  for (const d of due.filter((x) => x.kind === 'puzzle').slice(0, MAX_REVIEWS)) {
    const p = await db.get('puzzles', d.itemId);
    if (p) reviewItems.push({ id: `p:${p.id}`, kind: 'puzzle', puzzle: p, review: true, group: groupsOf(p.themes)[0] });
  }

  // Threat scan (loose pieces in 60% of them) and a 5-answer safe-or-not block.
  const positions = await practicePositions(db, rnd);
  const wantLoose = rnd() < 0.6;
  const scan = positions.map(makeThreatScan).find((t) => (t.answer.length > 0) === wantLoose) ?? positions.slice(0, 1).map(makeThreatScan)[0];
  const safes: SafeItem[] = [];
  for (const f of positions) {
    if (safes.length >= 5) break;
    const item = makeSafeOrNot(f, safes.length % 2 === 0 ? rnd() < 0.5 : !safes[safes.length - 1].safe, rnd);
    if (item) safes.push(item);
  }
  const specials: SessionItem[] = [];
  if (scan) specials.push({ id: `t:${date}`, kind: 'threat', fen: scan.fen, answer: scan.answer });
  if (safes.length) specials.push({ id: `s:${date}`, kind: 'safe', items: safes });

  // New puzzles: groups by weight, at least 2 from Defence, no group twice in a row.
  const { ratings, profile, weights } = await coachState();
  const nNew = SIZE - drillItems.length - reviewItems.length - specials.length;
  const seq = orderGroups(Math.max(0, nNew), weights, rnd);
  for (let i = 0; seq.filter((g) => g === 'defence').length < Math.min(DEFENCE, seq.length) && i < seq.length; i++)
    if (seq[i] !== 'defence' && seq[i - 1] !== 'defence' && seq[i + 1] !== 'defence') seq[i] = 'defence';
  const seen = new Set([...tried, ...reviewItems.map((r) => r.id.slice(2))]);
  const newItems: SessionItem[] = [];
  for (const g of seq) {
    const p = await pickPuzzle(db, g, ratings.groups[g].r, seen, rnd);
    if (p) { seen.add(p.id); newItems.push({ id: `p:${p.id}`, kind: 'puzzle', puzzle: p, group: g }); }
  }

  // Interleave: drills at 0/4/8, reviews at 2/6/10, threat scan at 3, safe-or-not at 7, new puzzles in between.
  const slots: (SessionItem | undefined)[] = Array(SIZE).fill(undefined);
  drillItems.forEach((d, i) => (slots[i * 4] = d));
  reviewItems.forEach((r, i) => (slots[2 + i * 4] = r));
  specials.forEach((s, i) => (slots[3 + i * 4] = s));
  const queue = [...newItems];
  const items = slots.map((s) => s ?? queue.shift()).filter((x): x is SessionItem => !!x).concat(queue).slice(0, SIZE);

  const top = Object.entries(profile.counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'defence';
  const why = whyLine(profile, top);
  const data: Record<string, unknown> = {};
  for (const it of items) {
    if (it.kind === 'puzzle') data[it.id] = { group: it.group, review: it.review };
    if (it.kind === 'threat' || it.kind === 'safe') { const { id: _id, ...rest } = it; data[it.id] = rest; }
  }
  await db.put('kv', { itemIds: items.map((i) => i.id), doneIds: [], data, why, top } satisfies Saved, key);
  return { date, items, doneIds: [], why, top };
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
