import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { closeDb, openDb } from '../../src/store/db';
import { ensurePuzzlesLoaded } from '../../src/puzzles/load';

const tsv = [
  'a1\t6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1\tg8f8 d1d8\t900\tbackRankMate mateIn1',
  'a2\tr1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3\tf3e5 c6e5\t700\thangingPiece',
  'a3\t8/8/8/8/8/8/8/K6k w - - 0 1\ta1a2 h1h2\t1000\tfork',
].join('\n');

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  globalThis.fetch = vi.fn(async () => new Response(tsv)) as typeof fetch;
});

it('loads the puzzle file once', async () => {
  expect(await ensurePuzzlesLoaded()).toBe(3);
  expect(await ensurePuzzlesLoaded()).toBe(3);
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  const p = await (await openDb()).get('puzzles', 'a1');
  expect(p).toEqual({ id: 'a1', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1', moves: ['g8f8', 'd1d8'], rating: 900, themes: ['backRankMate', 'mateIn1'] });
});
