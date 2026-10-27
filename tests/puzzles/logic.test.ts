import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Attempt } from '../../src/store/types';
import { themeStatus, LADDER } from '../../src/puzzles/ladder';
import { bandFor } from '../../src/puzzles/select';
import { dueItems } from '../../src/puzzles/schedule';
import { pickNewPuzzles } from '../../src/puzzles/select';
import { closeDb, openDb } from '../../src/store/db';

const DAY = 86_400_000;
let t = 0;
const att = (itemId: string, firstTry: boolean, theme = 'hangingPiece', ts = ++t): Attempt =>
  ({ id: `${itemId}-${ts}`, kind: 'puzzle', itemId, ts, firstTry, solved: true, ms: 5000, device: 'd', theme });
const many = (theme: string, n: number, okEvery: (i: number) => boolean) =>
  Array.from({ length: n }, (_, i) => att(`${theme}${i}`, okEvery(i), theme));

describe('theme ladder', () => {
  it('starts with only hanging pieces unlocked', () => {
    expect(themeStatus([])).toMatchObject({ unlocked: ['hangingPiece'], mastered: [], current: 'hangingPiece' });
  });
  it('masters a theme at 85% first try over the last 30 and unlocks the next', () => {
    const s = themeStatus(many('hangingPiece', 30, (i) => i % 10 !== 0)); // 27/30 = 90%
    expect(s.mastered).toEqual(['hangingPiece']);
    expect(s.unlocked).toEqual(['hangingPiece', 'mateIn1']);
    expect(s.current).toBe('mateIn1');
  });
  it('needs at least 30 attempts', () => {
    expect(themeStatus(many('hangingPiece', 29, () => true)).mastered).toEqual([]);
  });
  it('groups pin and skewer as one step', () => {
    expect(LADDER.map((s) => s.key)).toEqual(['hangingPiece', 'mateIn1', 'fork', 'pin', 'backRankMate', 'mateIn2', 'discoveredAttack']);
    expect(LADDER[3].themes).toEqual(['pin', 'skewer']);
  });
});

describe('adaptive band', () => {
  it('starts at the seed ±150', () => {
    expect(bandFor('fork', [], 700)).toEqual({ min: 550, max: 850 });
  });
  it('moves up 50 after 10 attempts above 90% and down 50 below 80%', () => {
    expect(bandFor('fork', many('fork', 10, () => true), 700)).toEqual({ min: 600, max: 900 });
    expect(bandFor('fork', many('fork', 10, (i) => i < 7), 700)).toEqual({ min: 500, max: 800 });
    expect(bandFor('fork', many('fork', 10, (i) => i < 8), 700)).toEqual({ min: 550, max: 850 });
  });
  it('clamps the centre to 400-1400', () => {
    expect(bandFor('fork', many('fork', 100, () => false), 500)).toEqual({ min: 250, max: 550 });
  });
});

describe('repeat schedule', () => {
  it('a missed item is due a day later, then 3 days after a clean solve, then retires after two clean solves in a row', () => {
    const a1 = att('x', false, 'fork', 0);
    expect(dueItems([a1], DAY - 1)).toEqual([]);
    expect(dueItems([a1], DAY)).toEqual([{ kind: 'puzzle', itemId: 'x' }]);
    const a2 = att('x', true, 'fork', DAY);
    expect(dueItems([a1, a2], DAY + 3 * DAY - 1)).toEqual([]);
    expect(dueItems([a1, a2], DAY + 3 * DAY)).toHaveLength(1);
    const a3 = att('x', true, 'fork', 4 * DAY);
    expect(dueItems([a1, a2, a3], 100 * DAY)).toEqual([]);
  });
  it('a miss during review restarts the schedule', () => {
    const list = [att('y', false, 'fork', 0), att('y', true, 'fork', DAY), att('y', false, 'fork', 4 * DAY)];
    expect(dueItems(list, 5 * DAY)).toHaveLength(1);
  });
  it('items solved first try the first time never come back', () => {
    expect(dueItems([att('z', true, 'fork', 0)], 100 * DAY)).toEqual([]);
  });
});

describe('pickNewPuzzles', () => {
  beforeEach(async () => {
    await closeDb();
    globalThis.indexedDB = new IDBFactory();
    const db = await openDb();
    for (let i = 0; i < 40; i++)
      await db.put('puzzles', { id: `h${i}`, fen: 'x', moves: [], rating: 600 + i * 5, themes: ['hangingPiece'] });
    await db.put('puzzles', { id: 'far', fen: 'x', moves: [], rating: 1400, themes: ['hangingPiece'] });
  });
  it('picks unseen puzzles of the current theme inside the band', async () => {
    const seen = [att('h0', true)];
    const got = await pickNewPuzzles(await openDb(), 10, seen, 700);
    expect(got).toHaveLength(10);
    for (const p of got) {
      expect(p.id).not.toBe('h0');
      expect(p.rating).toBeGreaterThanOrEqual(550);
      expect(p.rating).toBeLessThanOrEqual(850);
    }
  });
  it('widens the band when it runs short', async () => {
    const got = await pickNewPuzzles(await openDb(), 41, [], 700);
    expect(got.map((p) => p.id)).toContain('far');
  });
});
