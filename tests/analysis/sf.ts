import { createRequire } from 'node:module';
import { EngineClient } from '../../src/engine/client';

/** A real Stockfish lite engine running in Node, for tests. */
export function nodeEngine() {
  const require = createRequire(import.meta.url);
  return new EngineClient(() => {
    let cb: (l: string) => void = () => {};
    const sf = require('stockfish')('lite-single', (line: string) => cb(line));
    return { post: (c) => sf.processCommand(c), onLine: (f) => { cb = f; }, terminate: () => sf.terminate?.() };
  });
}
