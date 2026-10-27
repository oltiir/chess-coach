import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { analyseGame, newAnalysis, analyseNextPly } from '../../src/analysis/analyseGame';
import { clockUsedPct } from '../../src/analysis/stats';
import { runQueue } from '../../src/analysis/queue';
import { closeDb, openDb } from '../../src/store/db';
import type { GameRecord } from '../../src/store/types';
import { nodeEngine } from './sf';

const engine = nodeEngine();
afterAll(() => engine.terminate());
const NODES = 40_000;

const game = (moves: string, extra: Partial<GameRecord> = {}): GameRecord => ({
  url: `test:${moves}`, endTime: 1, timeClass: 'rapid', timeControl: '600+5', myColor: 'w', myRating: 600, oppRating: 600,
  oppName: 'opp', result: 'loss', pgn: `[Event "t"]\n[TimeControl "600+5"]\n\n${moves}`, ...extra,
});

const run = (g: GameRecord) => analyseGame(g, engine, NODES);

describe('analyseGame', () => {
  it('a clean opening has no hangs', async () => {
    const a = await run(game('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5'));
    expect(a.done).toBe(true);
    expect(a.stats).toMatchObject({ ownMoves: 3, hangs: 0, freeMissed: 0 });
  }, 60_000);

  it('flags a hung knight', async () => {
    const a = await run(game('1. e4 e5 2. Nf3 d6 3. Ng5 h6'));
    expect(a.stats.hangs).toBe(1);
    const p = a.plies.find((x) => x.played === 'f3g5')!;
    expect(p.hang).toEqual({ square: 'g5', value: 3 });
    expect(p.flag).toBe('blunder');
    expect(p.label).toBe('hung-piece');
    expect(p.candidates.length).toBeGreaterThan(1);
  }, 60_000);

  it('notices a free queen that was not taken', async () => {
    const a = await run(game('1. e4 e5 2. Nf3 Qg5 3. d3 Qd8'));
    expect(a.stats.freeMissed).toBe(1);
    expect(a.plies.find((x) => x.played === 'd2d3')!.label).toBe('missed-free-piece');
  }, 60_000);

  it('labels a missed mate in one first', async () => {
    const a = await run(game('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. d3 Nxh5'));
    expect(a.plies.find((x) => x.played === 'd2d3')!.label).toBe('missed-mate');
  }, 60_000);

  it('does not count a sound sacrifice as a hang', async () => {
    const a = await run(game('1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5#', { result: 'win' }));
    const p = a.plies.find((x) => x.played === 'f3e5')!;
    expect(p.hang).toBeNull();
  }, 60_000);

  it('analyses black games from black’s point of view', async () => {
    const a = await run(game('1. e4 Nf6 2. Nc3 Ng4 3. d4 h6', { myColor: 'b' }));
    expect(a.plies.every((p) => p.ply % 2 === 1)).toBe(true);
    expect(a.stats.ownMoves).toBe(3);
  }, 60_000);
});

describe('resume', () => {
  it('continues from nextPly after an interruption and never redoes plies', async () => {
    const g = game('1. e4 e5 2. Nf3 d6 3. Ng5 h6');
    let a = newAnalysis(g, NODES);
    a = await analyseNextPly(g, a, engine);
    expect(a.nextPly).toBe(2);
    expect(a.plies).toHaveLength(1);
    a = await analyseNextPly(g, a, engine);
    a = await analyseNextPly(g, a, engine);
    expect(a.plies.map((p) => p.ply)).toEqual([0, 2, 4]);
    expect(a.done).toBe(true);
  }, 60_000);
});

describe('clockUsedPct', () => {
  it('uses the last own clock and the increment', () => {
    const pgn = '[TimeControl "600+5"]\n\n1. e4 {[%clk 0:09:58]} 1... e5 {[%clk 0:09:59]} 2. Nf3 {[%clk 0:05:00]} 2... Nc6 {[%clk 0:09:00]}';
    // budget = 600 + 5*2 = 610; used = 610 - 300 = 310
    expect(clockUsedPct(pgn, 'w')).toBeCloseTo(310 / 610);
    expect(clockUsedPct(pgn, 'b')).toBeCloseTo((610 - 540) / 610);
  });
  it('is null for daily games', () => {
    expect(clockUsedPct('[TimeControl "1/259200"]\n\n1. e4', 'w')).toBeNull();
  });
});

describe('runQueue', () => {
  beforeEach(async () => { await closeDb(); globalThis.indexedDB = new IDBFactory(); });

  it('analyses rapid and daily games newest first, skips blitz, and persists after each ply', async () => {
    const db = await openDb();
    await db.put('games', game('1. e4 e5', { url: 'old', endTime: 1 }));
    await db.put('games', game('1. d4 d5', { url: 'new', endTime: 2 }));
    await db.put('games', game('1. c4 c5', { url: 'blitz', endTime: 3, timeClass: 'blitz' }));
    const order: string[] = [];
    await runQueue(new AbortController().signal, engine, { nodes: NODES, onGameDone: (a) => order.push(a.url) });
    expect(order).toEqual(['new', 'old']);
    expect(await db.get('analyses', 'blitz')).toBeUndefined();
  }, 60_000);

  it('stops when aborted and picks up later', async () => {
    const db = await openDb();
    await db.put('games', game('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5', { url: 'g' }));
    const ctl = new AbortController();
    let plies = 0;
    await runQueue(ctl.signal, engine, { nodes: NODES, onPly: () => { if (++plies === 1) ctl.abort(); } });
    expect((await db.get('analyses', 'g'))!.nextPly).toBe(2);
    await runQueue(new AbortController().signal, engine, { nodes: NODES });
    expect((await db.get('analyses', 'g'))!.done).toBe(true);
  }, 60_000);
});

describe('runQueue and odds games', () => {
  beforeEach(async () => { await closeDb(); globalThis.indexedDB = new IDBFactory(); });
  it('skips games that start from a custom position', async () => {
    const db = await openDb();
    await db.put('games', game('1. e4 e5', { url: 'odds', pgn: '[SetUp "1"]\n[FEN "3qk3/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1"]\n\n1. e4' }));
    await runQueue(new AbortController().signal, engine, { nodes: NODES });
    expect(await db.get('analyses', 'odds')).toBeUndefined();
  });
});

describe('review fixes: trades and repeated hangs', () => {
  it('a trade (Bxc6 dxc6) is not counted or explained as a hung piece', async () => {
    const a = await run(game('1. e4 e5 2. Nf3 Nc6 3. Bb5 Qg5 4. Bxc6 dxc6'));
    const p = a.plies.find((x) => x.played === 'b5c6')!;
    expect(p.hang).toBeNull();
    expect(p.label).not.toBe('hung-piece');
    expect(a.stats.hangs).toBe(0);
  }, 60_000);
  it('a piece left hanging for two moves counts once', async () => {
    const a = await run(game('1. e4 e5 2. Nf3 d6 3. Ng5 Nc6 4. a3 Nf6'));
    expect(a.stats.hangs).toBe(1);
  }, 60_000);
});

describe('runQueue robustness', () => {
  beforeEach(async () => { await closeDb(); globalThis.indexedDB = new IDBFactory(); });
  it('a game that cannot be read is marked failed and the queue moves on', async () => {
    const db = await openDb();
    await db.put('games', game('1. e4 e5', { url: 'broken', endTime: 5, pgn: '[Event "x"]\n\n1. e4 P@e5 2. Nf3' }));
    await db.put('games', game('1. d4 d5', { url: 'fine', endTime: 1 }));
    await runQueue(new AbortController().signal, engine, { nodes: NODES });
    expect((await db.get('analyses', 'broken'))).toMatchObject({ done: true, failed: true });
    expect((await db.get('analyses', 'fine'))!.done).toBe(true);
  }, 60_000);
});
