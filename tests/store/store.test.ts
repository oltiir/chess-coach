import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { logAttempt, allAttempts } from '../../src/store/attempts';
import { exportAll, importMerge } from '../../src/store/exportImport';
import { closeDb, openDb } from '../../src/store/db';

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const base = { kind: 'puzzle' as const, itemId: 'p1', ts: 1, firstTry: true, solved: true, ms: 1000 };

describe('attempt log', () => {
  it('persists an attempt with an id and device', async () => {
    const a = await logAttempt(base);
    expect(a.id).toMatch(/[0-9a-f-]{36}/);
    expect(a.device).toBeTruthy();
    expect(await allAttempts()).toHaveLength(1);
  });
});

describe('export / import merge', () => {
  it('importing its own export adds nothing', async () => {
    await logAttempt(base);
    const f = await exportAll();
    expect(await importMerge(f)).toEqual({ added: 0 });
    expect(await allAttempts()).toHaveLength(1);
  });

  it('merging another device adds only unseen ids and never deletes', async () => {
    await logAttempt(base);
    const mine = await exportAll();
    const other = { ...mine, attempts: [...mine.attempts, { ...mine.attempts[0], id: 'other-1', device: 'laptop' }] };
    expect(await importMerge(other)).toEqual({ added: 1 });
    const older = { ...mine, attempts: [] };
    await importMerge(older);
    expect(await allAttempts()).toHaveLength(2);
  });

  it('keeps the most advanced analysis per game', async () => {
    const db = await openDb();
    const a = { url: 'g1', engine: 'sf19-lite', nodes: 1, plies: [], stats: { ownMoves: 0, hangs: 0, pawnHangs: 0, freeMissed: 0, clockUsedPct: null }, done: false, nextPly: 10 };
    await db.put('analyses', a);
    const f = await exportAll();
    await importMerge({ ...f, analyses: [{ ...a, nextPly: 4 }] });
    expect((await db.get('analyses', 'g1'))!.nextPly).toBe(10);
    await importMerge({ ...f, analyses: [{ ...a, nextPly: 2, done: true }] });
    expect((await db.get('analyses', 'g1'))!.done).toBe(true);
  });

  it('rejects an unknown version', async () => {
    const f = await exportAll();
    await expect(importMerge({ ...f, version: 9 as 1 })).rejects.toThrow('Unsupported backup version');
  });
});
