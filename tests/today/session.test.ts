import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { closeDb, openDb, kvSet } from '../../src/store/db';
import type { Attempt, Drill } from '../../src/store/types';
import { buildSession, markDone, daysTrainedThisWeek, finishItem, SIZE } from '../../src/today/session';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 28, 12).getTime(); // Wed 28 Oct 2026
const GROUP_THEMES: Record<string, string> = { defence: 'defensiveMove', free: 'hangingPiece', pins: 'pin', forks: 'fork', discovered: 'discoveredAttack', mates: 'mateIn1', removal: 'deflection', trapped: 'trappedPiece' };
// A real position so threat-scan / safe-or-not can be generated from puzzles.
const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

const drill = (id: string, createdAt: number): Drill => ({
  id, fen: FEN, best: 'f1b5', played: 'f3g5', candidates: [], label: 'other', explanation: '', source: 'chesscom', createdAt, context: '',
});
const att = (itemId: string, kind: 'puzzle' | 'drill', firstTry: boolean, ts: number): Attempt =>
  ({ id: `${itemId}@${ts}`, kind, itemId, ts, firstTry, solved: firstTry, ms: 1, device: 'd' });

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  const db = await openDb();
  for (const [g, t] of Object.entries(GROUP_THEMES))
    for (let r = 500; r <= 1300; r += 20) await db.put('puzzles', { id: `${g}${r}`, fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 2 3', moves: ['g1f3', 'f8c5'], rating: r, themes: [t] });
  await kvSet('placement', { ts: 0, global: 1000, groups: {} });
});

const ids = (s: { items: { id: string }[] }) => s.items.map((i) => i.id);
const kinds = (s: { items: { kind: string }[] }) => s.items.map((i) => i.kind);

describe('buildSession', () => {
  it('has 14 items: up to 3 drills, due reviews, one threat scan, one safe-or-not block, defence puzzles and new puzzles', async () => {
    const db = await openDb();
    const drills = [drill('d-old', 1), drill('d-new', 5), drill('d-mid', 3), drill('d-4', 2)];
    const s = await buildSession(NOW, [att('defence700', 'puzzle', false, NOW - 2 * DAY)], drills, db);
    expect(s.items).toHaveLength(SIZE);
    expect(SIZE).toBe(14);
    expect(kinds(s).filter((k) => k === 'drill')).toHaveLength(3);
    expect(kinds(s).filter((k) => k === 'threat')).toHaveLength(1);
    expect(kinds(s).filter((k) => k === 'safe')).toHaveLength(1);
    expect(ids(s)).toContain('p:defence700');
    expect(new Set(ids(s)).size).toBe(SIZE);
    expect(s.why).toMatch(/mistakes|weakest/);
  });

  it('new puzzles sit in the 75-85% window of their group and never repeat a group twice in a row', async () => {
    const s = await buildSession(NOW, [], [], await openDb());
    const puzzles = s.items.filter((i) => i.kind === 'puzzle') as { puzzle: { rating: number }; group: string }[];
    for (const p of puzzles) expect(p.puzzle.rating).toBeLessThanOrEqual(1000 - 190 + 1);
    const groups = puzzles.map((p) => p.group);
    for (let i = 1; i < groups.length; i++) expect(groups[i]).not.toBe(groups[i - 1]);
  });

  it('returns the same items again the same day and remembers what was done', async () => {
    const db = await openDb();
    const a = await buildSession(NOW, [], [], db);
    await markDone(NOW, a.items[0].id);
    const b = await buildSession(NOW + 1000, [], [], db);
    expect(ids(b)).toEqual(ids(a));
    expect(b.doneIds).toEqual([a.items[0].id]);
  });

  it('drills found later join the unfinished part, keeping 14 items', async () => {
    const db = await openDb();
    const first = await buildSession(NOW, [], [], db);
    await markDone(NOW, first.items[0].id);
    const later = await buildSession(NOW, [], [drill('d-late', 9)], db);
    expect(later.items).toHaveLength(SIZE);
    expect(later.items[0].id).toBe(first.items[0].id);
    expect(later.items[1].id).toBe('d:d-late');
  });
});

describe('finishItem', () => {
  it('logs the attempt and marks the item done together', async () => {
    const db = await openDb();
    const s = await buildSession(NOW, [], [], db);
    const id = s.items[0].id;
    await finishItem(NOW, id, { kind: 'puzzle', itemId: id.slice(2), ts: NOW, firstTry: true, solved: true, ms: 1 });
    expect((await buildSession(NOW, [], [], db)).doneIds).toEqual([id]);
    expect(await db.count('attempts')).toBe(1);
  });
});

describe('daysTrainedThisWeek', () => {
  it('counts distinct days since Monday', () => {
    const mon = new Date(2026, 9, 26, 9).getTime();
    const list = [att('a', 'puzzle', true, mon), att('b', 'puzzle', true, mon + 3600_000), att('c', 'puzzle', true, NOW), att('d', 'puzzle', true, mon - DAY)];
    expect(daysTrainedThisWeek(list, NOW)).toBe(2);
  });
});
