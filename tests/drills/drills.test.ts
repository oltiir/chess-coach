import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { analyseGame } from '../../src/analysis/analyseGame';
import { acceptMove, makeDrills, saveDrills } from '../../src/drills/makeDrills';
import { closeDb, openDb } from '../../src/store/db';
import type { Drill, GameRecord } from '../../src/store/types';
import { nodeEngine } from '../analysis/sf';

const engine = nodeEngine();
afterAll(() => engine.terminate());

const g: GameRecord = {
  url: 'https://www.chess.com/game/live/1', endTime: new Date(2026, 9, 20).getTime(), timeClass: 'rapid', timeControl: '600+5',
  myColor: 'w', myRating: 600, oppRating: 620, oppName: 'kasparov99', result: 'loss',
  pgn: '[TimeControl "600+5"]\n\n1. e4 e5 2. Nf3 d6 3. Ng5 h6',
};

beforeEach(async () => { await closeDb(); globalThis.indexedDB = new IDBFactory(); });

describe('makeDrills', () => {
  it('turns each labelled mistake into a drill from the position before it', async () => {
    const a = await analyseGame(g, engine, 40_000);
    const drills = makeDrills(a, g);
    expect(drills).toHaveLength(1);
    expect(drills[0]).toMatchObject({ id: `${g.url}#4`, played: 'f3g5', label: 'hung-piece', source: 'chesscom' });
    expect(drills[0].context).toBe('Your game vs kasparov99, 20 Oct');
    expect(drills[0].explanation).toContain('knight on g5');
  }, 60_000);

  it('never duplicates drills when saved twice', async () => {
    const a = await analyseGame(g, engine, 40_000);
    await saveDrills(makeDrills(a, g));
    await saveDrills(makeDrills(a, g));
    expect(await (await openDb()).count('drills')).toBe(1);
  }, 60_000);
});

describe('acceptMove', () => {
  const d: Drill = {
    id: 'x', fen: 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3', best: 'd2d4', played: 'f3g5',
    candidates: [{ uci: 'd2d4', wc: 0.2 }, { uci: 'f1c4', wc: 0.12 }, { uci: 'b1c3', wc: 0.05 }, { uci: 'f3g5', wc: -0.6 }],
    label: 'hung-piece', explanation: '', source: 'chesscom', createdAt: 1, context: '',
  };
  it('accepts candidates within the mistake threshold of the best', async () => {
    expect(await acceptMove(d, 'f1c4', engine)).toBe(true);
    expect(await acceptMove(d, 'b1c3', engine)).toBe(true);
  });
  it('rejects the move that was actually played', async () => {
    expect(await acceptMove(d, 'f3g5', engine)).toBe(false);
  });
  it('checks moves outside the candidate list with the engine', async () => {
    expect(await acceptMove(d, 'f3e5', engine)).toBe(false); // drops the knight to dxe5
    expect(await acceptMove({ ...d, candidates: d.candidates.slice(0, 1) }, 'b1c3', engine)).toBe(true);
  }, 30_000);
});

describe('acceptMove after an engine restart', () => {
  it('retries once when the engine was restarted mid-check', async () => {
    const { acceptWithRetry } = await import('../../src/drills/makeDrills');
    let calls = 0;
    const flaky = { analyse: async () => { if (calls++ === 0) throw new Error('EngineRestarted'); return [{ uci: 'x', pv: [], score: { cp: 0 } }]; } };
    const d = { ...drill0(), candidates: [{ uci: 'd2d4', wc: 0.05 }] };
    expect(await acceptWithRetry(d, 'b1c3', flaky as never)).toBe(true);
    expect(calls).toBe(2);
  });
});
function drill0() {
  return { id: 'x', fen: 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3', best: 'd2d4', played: 'f3g5', candidates: [], label: 'hung-piece' as const, explanation: '', source: 'chesscom' as const, createdAt: 1, context: '' };
}
