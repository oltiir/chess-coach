import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { toGameRecord } from '../../src/import/chesscom';
import { syncGames } from '../../src/import/sync';
import { closeDb, openDb } from '../../src/store/db';

const month = JSON.parse(readFileSync('tests/fixtures/chesscom-2026-10.json', 'utf8'));
const ARCH = 'https://api.chess.com/pub/player/oltii05/games/archives';
const OCT = 'https://api.chess.com/pub/player/oltii05/games/2026/10';
const noSleep = async () => {};

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('toGameRecord', () => {
  it('maps colour, ratings, opponent and result', () => {
    const r = month.games.map((g: object) => toGameRecord(g, 'Oltii05'));
    expect(r).toHaveLength(6);
    expect(r[0]).toMatchObject({ url: 'https://www.chess.com/game/live/184717431624', timeClass: 'rapid', myColor: 'b', myRating: 794, oppRating: 672, oppName: 'StainlessSteelFork', result: 'win', endTime: 1790964187000 });
    expect(r[1]).toMatchObject({ myColor: 'w', result: 'loss' });
    expect(r[3]).toMatchObject({ timeClass: 'blitz', result: 'loss' });
    expect(r[0].pgn).toContain('[Event');
  });
  it('maps draws', () => {
    const g = { ...month.games[0], white: { ...month.games[0].white, result: 'repetition' }, black: { ...month.games[0].black, result: 'repetition' } };
    expect(toGameRecord(g, 'oltii05').result).toBe('draw');
  });
});

type Route = Record<string, () => Response | Promise<Response>>;
const serve = (routes: Route) => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const h = routes[url];
    if (!h) return new Response('', { status: 404 });
    return h();
  }) as typeof fetch;
  return calls;
};

describe('syncGames', () => {
  it('imports every game and stores them', async () => {
    serve({ [ARCH]: () => Response.json({ archives: [OCT] }), [OCT]: () => Response.json(month, { headers: { etag: '"v1"' } }) });
    expect(await syncGames('Oltii05', { sleep: noSleep })).toEqual({ added: 6 });
    expect(await (await openDb()).count('games')).toBe(6);
  });

  it('sends the stored ETag and adds nothing on 304', async () => {
    serve({ [ARCH]: () => Response.json({ archives: [OCT] }), [OCT]: () => Response.json(month, { headers: { etag: '"v1"' } }) });
    await syncGames('Oltii05', { sleep: noSleep });
    const calls = serve({ [ARCH]: () => Response.json({ archives: [OCT] }), [OCT]: () => new Response(null, { status: 304 }) });
    expect(await syncGames('Oltii05', { sleep: noSleep })).toEqual({ added: 0 });
    expect(calls.find((c) => c.url === OCT)!.headers['If-None-Match']).toBe('"v1"');
    expect(await (await openDb()).count('games')).toBe(6);
  });

  it('only refetches the newest two months once older ones are stored', async () => {
    const months = ['2023/02', '2023/03', '2024/03', '2026/10'].map((m) => `https://api.chess.com/pub/player/oltii05/games/${m}`);
    const routes: Route = { [ARCH]: () => Response.json({ archives: months }) };
    for (const m of months) routes[m] = () => Response.json({ games: [] });
    serve(routes);
    await syncGames('Oltii05', { sleep: noSleep });
    const calls = serve(routes);
    await syncGames('Oltii05', { sleep: noSleep });
    expect(calls.map((c) => c.url).filter((u) => u !== ARCH)).toEqual([months[2], months[3]]);
  });

  it('reports an unknown username', async () => {
    serve({});
    expect(await syncGames('nobody', { sleep: noSleep })).toEqual({ added: 0, error: 'not-found' });
  });

  it('retries a rate limit once, then reports it, keeping stored games', async () => {
    serve({ [ARCH]: () => Response.json({ archives: [OCT] }), [OCT]: () => Response.json(month) });
    await syncGames('Oltii05', { sleep: noSleep });
    const calls = serve({ [ARCH]: () => new Response('', { status: 429 }) });
    expect(await syncGames('Oltii05', { sleep: noSleep })).toEqual({ added: 0, error: 'rate-limited' });
    expect(calls).toHaveLength(2);
    expect(await (await openDb()).count('games')).toBe(6);
  });

  it('reports offline and server errors', async () => {
    globalThis.fetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    expect(await syncGames('Oltii05', { sleep: noSleep })).toEqual({ added: 0, error: 'offline' });
    serve({ [ARCH]: () => new Response('', { status: 503 }) });
    expect(await syncGames('Oltii05', { sleep: noSleep })).toEqual({ added: 0, error: 'server' });
  });
});
