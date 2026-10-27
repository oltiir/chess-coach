import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { closeDb, openDb } from '../../src/store/db';
import { errorProfile, groupWeights, orderGroups, pickPuzzle, whyLine, PRIOR } from '../../src/coach/plan';
import { ratingsFrom } from '../../src/coach/rating';
import type { GameAnalysis, GameRecord } from '../../src/store/types';

const game = (url: string, endTime: number): GameRecord => ({ url, endTime, timeClass: 'rapid', timeControl: '600+5', myColor: 'w', myRating: 570, oppRating: 600, oppName: 'x', result: 'loss', pgn: '', rules: 'chess' });
const analysis = (url: string, labels: string[], clock = 0.4): GameAnalysis => ({
  url, engine: 'sf19-lite', nodes: 1, done: true, nextPly: 0,
  plies: labels.map((l, i) => ({ ply: i, fenBefore: '', played: '', best: '', wcBefore: 0, wcAfter: 0, wcBest: 0, drop: 0.5, flag: 'blunder' as const, label: l as never, hang: null, pawnHang: false, freeMissed: false, candidates: [] })),
  stats: { ownMoves: 30, hangs: 1, pawnHangs: 0, freeMissed: 0, clockUsedPct: clock },
});

describe('error profile', () => {
  it('maps the last 20 analysed rapid games’ mistakes to groups', () => {
    const games = [game('a', 1), game('b', 2)];
    const p = errorProfile(games, [analysis('a', ['hung-piece', 'missed-pin', 'other']), analysis('b', ['allowed-mate', 'missed-free-piece'], 0.6)]);
    expect(p.counts).toEqual({ defence: 2, pins: 1, free: 1 });
    expect(p.total).toBe(4);
    expect(p.clockUsed).toBeCloseTo(0.5);
    expect(p.games).toBe(2);
  });
  it('falls back to the measured prior with no games', () => {
    expect(errorProfile([], []).counts).toEqual(PRIOR.counts);
  });
});

describe('group weights', () => {
  it('weights own errors most, then weakness, then a little of everything', () => {
    const r = ratingsFrom({ ts: 0, global: 900, groups: { defence: 900, pins: 600, free: 900, forks: 900, discovered: 900, mates: 900, removal: 900, trapped: 900 } }, []);
    const w = groupWeights({ counts: { defence: 3, pins: 1 }, total: 4, games: 5, clockUsed: 0.4 }, r);
    expect(w.defence).toBeCloseTo(0.5 * 0.75 + 0.2 / 8, 3);
    expect(w.pins).toBeCloseTo(0.5 * 0.25 + 0.3 * 1 + 0.2 / 8, 3);
    expect(w.forks).toBeCloseTo(0.2 / 8, 3);
  });
  it('never puts the same group twice in a row', () => {
    const seq = orderGroups(30, { defence: 0.9, pins: 0.1 }, () => 0.01);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });
});

describe('pickPuzzle', () => {
  beforeEach(async () => {
    await closeDb(); globalThis.indexedDB = new IDBFactory();
    const db = await openDb();
    for (let r = 500; r <= 1500; r += 10) await db.put('puzzles', { id: `d${r}`, fen: 'x', moves: [], rating: r, themes: ['defensiveMove'] });
  });
  it('picks an unseen puzzle inside the 75-85% window', async () => {
    const p = await pickPuzzle(await openDb(), 'defence', 1000, new Set(['d710']));
    expect(p!.rating).toBeGreaterThanOrEqual(700);
    expect(p!.rating).toBeLessThanOrEqual(810);
    expect(p!.id).not.toBe('d710');
  });
  it('widens the window when it runs dry', async () => {
    const p = await pickPuzzle(await openDb(), 'defence', 2300, new Set());
    expect(p!.rating).toBeGreaterThan(1300);
  });
});

describe('why line', () => {
  it('explains the plan from the data', () => {
    const line = whyLine({ counts: { defence: 32, pins: 12, free: 8 }, total: 58, games: 40, clockUsed: 0.43 }, 'defence');
    expect(line).toContain('32 of your last 58 mistakes');
    expect(line).toContain('43% of your clock');
  });
});
