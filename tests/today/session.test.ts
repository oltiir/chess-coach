import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { closeDb, openDb } from '../../src/store/db';
import type { Attempt, Drill } from '../../src/store/types';
import { buildSession, markDone, daysTrainedThisWeek } from '../../src/today/session';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 28, 12).getTime(); // Wed 28 Oct 2026, local noon

const drill = (id: string, createdAt: number): Drill => ({
  id, fen: '8/8/8/8/8/8/8/K6k w - - 0 1', best: 'a1a2', played: 'a1b1', candidates: [], label: 'other',
  explanation: '', source: 'chesscom', createdAt, context: '',
});
const att = (itemId: string, kind: 'puzzle' | 'drill', firstTry: boolean, ts: number): Attempt =>
  ({ id: `${itemId}@${ts}`, kind, itemId, ts, firstTry, solved: firstTry, ms: 1, device: 'd', theme: 'hangingPiece' });

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  const db = await openDb();
  for (let i = 0; i < 30; i++) await db.put('puzzles', { id: `p${i}`, fen: 'x', moves: [], rating: 700, themes: ['hangingPiece'] });
});

const ids = (s: { items: { id: string }[] }) => s.items.map((i) => i.id);

describe('buildSession', () => {
  it('puts at most 3 drills first (due ones, then newest), then repeats, then new puzzles to 10', async () => {
    const db = await openDb();
    const drills = [drill('d-old', 1), drill('d-new', 5), drill('d-mid', 3), drill('d-due', 0)];
    const attempts = [att('d-due', 'drill', false, NOW - 2 * DAY), att('p0', 'puzzle', false, NOW - 2 * DAY)];
    const s = await buildSession(NOW, attempts, drills, db, 700);
    expect(ids(s).slice(0, 4)).toEqual(['d:d-due', 'd:d-new', 'd:d-mid', 'p:p0']);
    expect(s.items).toHaveLength(10);
    expect(new Set(ids(s)).size).toBe(10);
  });

  it('returns the same items when called again the same day', async () => {
    const db = await openDb();
    const a = await buildSession(NOW, [], [], db, 700);
    const b = await buildSession(NOW + 1000, [], [], db, 700);
    expect(ids(b)).toEqual(ids(a));
  });

  it('remembers finished items so a resumed session continues', async () => {
    const db = await openDb();
    const a = await buildSession(NOW, [], [], db, 700);
    await markDone(NOW, a.items[0].id);
    await markDone(NOW, a.items[1].id);
    const b = await buildSession(NOW, [], [], db, 700);
    expect(b.doneIds).toEqual([a.items[0].id, a.items[1].id]);
  });

  it('caps a heavy repeat day at 10 due items', async () => {
    const db = await openDb();
    const attempts = Array.from({ length: 14 }, (_, i) => att(`p${i}`, 'puzzle', false, NOW - 2 * DAY));
    const s = await buildSession(NOW, attempts, [], db, 700);
    expect(s.items).toHaveLength(10);
    expect(ids(s).every((id) => /^p:p\d+$/.test(id) && +id.slice(3) < 14)).toBe(true);
  });
});

describe('daysTrainedThisWeek', () => {
  it('counts distinct days since Monday', () => {
    const mon = new Date(2026, 9, 26, 9).getTime();
    const list = [att('a', 'puzzle', true, mon), att('b', 'puzzle', true, mon + 3600_000), att('c', 'puzzle', true, NOW), att('d', 'puzzle', true, mon - DAY)];
    expect(daysTrainedThisWeek(list, NOW)).toBe(2);
  });
});

describe('finishItem', () => {
  it('logs the attempt and marks the item done together', async () => {
    const { finishItem } = await import('../../src/today/session');
    const db = await openDb();
    const s = await buildSession(NOW, [], [], db, 700);
    const id = s.items[0].id;
    await finishItem(NOW, id, { kind: 'puzzle', itemId: id.slice(2), ts: NOW, firstTry: true, solved: true, ms: 1 });
    const again = await buildSession(NOW, [], [], db, 700);
    expect(again.doneIds).toEqual([id]);
    expect(await db.count('attempts')).toBe(1);
  });
});

describe('drills that arrive after today’s session was built', () => {
  it('are added to the unfinished part of today’s session, keeping it at 10 items', async () => {
    const db = await openDb();
    const first = await buildSession(NOW, [], [], db, 700);
    await markDone(NOW, first.items[0].id);
    const later = await buildSession(NOW, [], [drill('d-late', 9)], db, 700);
    expect(later.items).toHaveLength(10);
    expect(later.items[0].id).toBe(first.items[0].id); // finished items stay
    expect(later.items[1].id).toBe('d:d-late'); // the new drill comes next
    expect(later.doneIds).toEqual([first.items[0].id]);
  });
});
