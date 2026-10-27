import { beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../worker/api';
import { memoryDb } from './sqlite';
import type { Db } from '../../worker/db';

let db: Db;
beforeEach(() => { db = memoryDb(); });

const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const res = await handle(new Request(`https://x${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), 'cf-connecting-ip': '1.2.3.4' },
  }), { DB: db });
  return { status: res.status, json: (await res.json()) as any };
};

const create = () => call('POST', '/api/crews', { crewName: 'Boys', name: 'Olti', chesscom: 'Oltii05', passcode: 'knight123' });
const join = (code: string, name = 'Arben', chesscom = 'arben_k') => call('POST', '/api/join', { code, name, chesscom, passcode: 'rook4567' });

const stats = (hangs: number, clock = 0.6) => ({ ownMoves: 30, hangs, pawnHangs: 0, freeMissed: 0, clockUsedPct: clock });
const game = (url: string, endTime: number, hangs: number, extra: object = {}) => ({
  url, endTime, result: 'win', myColor: 'w', myRating: 600, oppRating: 610, oppName: 'someone', moves: 'e2e4 e7e5', stats: stats(hangs),
  plies: hangs ? [{ ply: 2, played: 'g1f3', best: 'd2d4', label: 'hung-piece', explanation: 'x', fenBefore: 'f' }] : [], ...extra,
});

describe('accounts', () => {
  it('creates a crew with an invite code, a token and a one-time recovery code', async () => {
    const r = await create();
    expect(r.status).toBe(200);
    expect(r.json.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(r.json.token).toHaveLength(64);
    expect(r.json.recovery).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
  });
  it('joins with the code, logs in again, rejects a wrong passcode plainly', async () => {
    const { json: c } = await create();
    expect((await join(c.code)).status).toBe(200);
    expect((await call('POST', '/api/login', { code: c.code, name: 'arben', passcode: 'rook4567' })).json.token).toHaveLength(64);
    const bad = await call('POST', '/api/login', { code: c.code, name: 'Arben', passcode: 'nope' });
    expect(bad.status).toBe(401);
    expect(bad.json.error).toBe('Name or passcode is wrong.');
  });
  it('rejects a taken name and a bad code', async () => {
    const { json: c } = await create();
    await join(c.code);
    expect((await join(c.code)).json.error).toBe('That name is taken in this crew.');
    expect((await join('ZZZZZZ')).json.error).toBe('No crew with that code.');
  });
  it('rate-limits logins after 10 failures in 15 minutes', async () => {
    const { json: c } = await create();
    for (let i = 0; i < 10; i++) await call('POST', '/api/login', { code: c.code, name: 'Olti', passcode: 'x' });
    const r = await call('POST', '/api/login', { code: c.code, name: 'Olti', passcode: 'knight123' });
    expect(r.status).toBe(429);
  });
  it('resets the passcode with the recovery code', async () => {
    const { json: c } = await create();
    const r = await call('POST', '/api/recover', { code: c.code, name: 'Olti', recovery: c.recovery, newPasscode: 'bishop999' });
    expect(r.status).toBe(200);
    expect((await call('POST', '/api/login', { code: c.code, name: 'Olti', passcode: 'bishop999' })).status).toBe(200);
  });
  it('requires a token for crew data', async () => {
    expect((await call('GET', '/api/crew')).status).toBe(401);
  });
});

describe('games, feed and isolation', () => {
  it('members see each other’s games newest first; another crew sees nothing', async () => {
    const { json: a } = await create();
    const { json: b } = await join(a.code);
    await call('POST', '/api/games', { games: [game('g1', 1, 1), game('g2', 2, 0)] }, a.token);
    const feed = await call('GET', '/api/feed', undefined, b.token);
    expect(feed.json.games.map((g: any) => g.url)).toEqual(['g2', 'g1']);
    expect(feed.json.games[0]).toMatchObject({ memberName: 'Olti', hangs: 0 });
    const other = await call('POST', '/api/crews', { crewName: 'Other', name: 'Eve', chesscom: 'eve', passcode: 'eveeve12' });
    expect((await call('GET', '/api/feed', undefined, other.json.token)).json.games).toEqual([]);
    expect((await call('GET', `/api/game?member=${feed.json.games[0].memberId}&url=g2`, undefined, other.json.token)).status).toBe(404);
  });
  it('uploading the same game twice updates it instead of duplicating', async () => {
    const { json: a } = await create();
    await call('POST', '/api/games', { games: [game('g1', 1, 2)] }, a.token);
    await call('POST', '/api/games', { games: [game('g1', 1, 1)] }, a.token);
    const feed = await call('GET', '/api/feed', undefined, a.token);
    expect(feed.json.games).toHaveLength(1);
    expect(feed.json.games[0].hangs).toBe(1);
  });
  it('a hidden game leaves the feed for others but still counts toward the owner’s level', async () => {
    const { json: a } = await create();
    const { json: b } = await join(a.code);
    const games = Array.from({ length: 5 }, (_, i) => game(`h${i}`, Date.now() - i * 1000, 0));
    await call('POST', '/api/games', { games }, a.token);
    await call('POST', '/api/games/hide', { url: 'h4', hidden: true }, a.token);
    const feed = await call('GET', '/api/feed', undefined, b.token);
    expect(feed.json.games.map((g: any) => g.url)).not.toContain('h4');
    const crew = await call('GET', '/api/crew', undefined, b.token);
    expect(crew.json.members.find((m: any) => m.name === 'Olti')).toMatchObject({ level: 10, games: 5 });
  });
});

describe('notes', () => {
  it('adds a note to a crew member’s move and shows it on the game', async () => {
    const { json: a } = await create();
    const { json: b } = await join(a.code);
    await call('POST', '/api/games', { games: [game('g1', 1, 1)] }, a.token);
    const owner = (await call('GET', '/api/feed', undefined, b.token)).json.games[0].memberId;
    expect((await call('POST', '/api/notes', { owner, url: 'g1', ply: 2, text: 'Your knight was loose here', arrow: 'f3g5' }, b.token)).status).toBe(200);
    expect((await call('POST', '/api/notes', { owner, url: 'g1', ply: 2, text: 'x'.repeat(141) }, b.token)).status).toBe(400);
    const g = await call('GET', `/api/game?member=${owner}&url=g1`, undefined, a.token);
    expect(g.json.notes).toEqual([expect.objectContaining({ ply: 2, text: 'Your knight was loose here', arrow: 'f3g5', author: 'Arben' })]);
  });
});
