import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { EngineClient, parseInfo, type Transport } from '../../src/engine/client';

/** A scripted fake engine: answers each `go` with the given lines. */
function fake(script: (cmd: string, say: (l: string) => void) => void): () => Transport {
  return () => {
    let cb: (l: string) => void = () => {};
    return {
      post: (cmd) => queueMicrotask(() => {
        if (cmd === 'uci') cb('uciok');
        else if (cmd === 'isready') cb('readyok');
        else script(cmd, cb);
      }),
      onLine: (f) => { cb = f; },
      terminate: () => {},
    };
  };
}

describe('parseInfo', () => {
  it('reads multipv, cp score and pv', () => {
    expect(parseInfo('info depth 12 seldepth 18 multipv 2 score cp -35 nodes 1000 pv e7e5 g1f3')).toEqual({ multipv: 2, score: { cp: -35 }, pv: ['e7e5', 'g1f3'] });
  });
  it('reads mate scores', () => {
    expect(parseInfo('info depth 5 score mate -2 pv h7h6 d8d1')).toEqual({ multipv: 1, score: { mate: -2 }, pv: ['h7h6', 'd8d1'] });
  });
  it('ignores lines without a pv', () => {
    expect(parseInfo('info string NNUE evaluation enabled')).toBeNull();
  });
});

describe('EngineClient', () => {
  it('serves queued calls in order', async () => {
    let n = 0;
    const e = new EngineClient(fake((cmd, say) => {
      if (cmd.startsWith('go')) { n++; say(`info depth 1 multipv 1 score cp ${n} pv a2a3`); say('bestmove a2a3'); }
    }));
    const [a, b] = await Promise.all([e.analyse('8/8/8/8/8/8/P7/K6k w - - 0 1', { nodes: 1 }), e.analyse('8/8/8/8/8/8/P7/K6k w - - 0 1', { nodes: 1 })]);
    expect(a[0].score).toEqual({ cp: 1 });
    expect(b[0].score).toEqual({ cp: 2 });
  });

  it('rejects in-flight calls on restart', async () => {
    const e = new EngineClient(fake(() => {}));
    const p = e.analyse('8/8/8/8/8/8/P7/K6k w - - 0 1', { nodes: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await e.restart();
    await expect(p).rejects.toThrow('EngineRestarted');
  });
});

describe('real Stockfish (node)', () => {
  it('finds a back-rank mate in one', async () => {
    const require = createRequire(import.meta.url);
    const e = new EngineClient(() => {
      let cb: (l: string) => void = () => {};
      const sf = require('stockfish')('lite-single', (line: string) => cb(line));
      return { post: (c) => sf.processCommand(c), onLine: (f) => { cb = f; }, terminate: () => sf.terminate?.() };
    });
    const lines = await e.analyse('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', { nodes: 50_000, multipv: 2 });
    expect(lines[0].uci).toBe('d1d8');
    expect(lines[0].score).toEqual({ mate: 1 });
    expect(lines).toHaveLength(2);
    e.terminate();
  }, 30_000);
});
