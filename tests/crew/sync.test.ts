import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { closeDb, openDb, kvSet } from '../../src/store/db';
import { uploadPending } from '../../src/crew/api';
import type { GameAnalysis, GameRecord } from '../../src/store/types';

const g = (url: string, extra: Partial<GameRecord> = {}): GameRecord => ({
  url, endTime: 1, timeClass: 'rapid', timeControl: '600+5', myColor: 'w', myRating: 600, oppRating: 600, oppName: 'x',
  result: 'win', pgn: '[TimeControl "600+5"]\n\n1. e4 e5', rules: 'chess', ...extra,
});
const a = (url: string, extra: Partial<GameAnalysis> = {}): GameAnalysis => ({
  url, engine: 'sf19-lite', nodes: 1, done: true, nextPly: 0,
  plies: [{ ply: 0, fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', played: 'e2e4', best: 'd2d4', wcBefore: 0, wcAfter: -0.5, wcBest: 0, drop: 0.5, flag: 'blunder', label: 'other', hang: null, pawnHang: false, freeMissed: false, candidates: [] }],
  stats: { ownMoves: 1, hangs: 0, pawnHangs: 0, freeMissed: 0, clockUsedPct: 0.5 }, ...extra,
});

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  const db = await openDb();
  await kvSet('crew-account', { token: 't', code: 'ABCDEF', crewName: 'C', id: 'm', name: 'Olti' });
  await db.put('games', g('rapid1'));
  await db.put('analyses', a('rapid1'));
  await db.put('games', g('blitz1', { timeClass: 'blitz' }));
  await db.put('analyses', a('blitz1'));
  await db.put('games', g('unfinished'));
  await db.put('analyses', a('unfinished', { done: false }));
  await db.put('games', g('odds', { pgn: '[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n' }));
  await db.put('analyses', a('odds'));
});

describe('uploadPending', () => {
  it('uploads finished standard rapid games once, with moves and marked plies', async () => {
    const sent: any[] = [];
    globalThis.fetch = vi.fn(async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return Response.json({ saved: 1, level: null }); }) as any;
    expect(await uploadPending()).toBe(1);
    expect(sent[0].games.map((x: any) => x.url)).toEqual(['rapid1']);
    expect(sent[0].games[0]).toMatchObject({ moves: 'e2e4 e7e5', plies: [{ ply: 0, played: 'e2e4', best: 'd2d4', label: 'other' }] });
    expect(await uploadPending()).toBe(0);
  });
  it('keeps games pending when offline', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as any;
    expect(await uploadPending()).toBe(0);
    globalThis.fetch = vi.fn(async () => Response.json({ saved: 1 })) as any;
    expect(await uploadPending()).toBe(1);
  });
  it('does nothing without a crew account', async () => {
    await kvSet('crew-account', null);
    globalThis.fetch = vi.fn() as any;
    expect(await uploadPending()).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
