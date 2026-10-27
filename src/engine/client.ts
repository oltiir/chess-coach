import type { Score } from '../chess/wc';

export interface EngineLine { uci: string; pv: string[]; score: Score }
export interface Transport { post(cmd: string): void; onLine(cb: (line: string) => void): void; terminate(): void }

export function parseInfo(line: string): { multipv: number; score: Score; pv: string[] } | null {
  if (!line.startsWith('info') || !line.includes(' pv ')) return null;
  const t = line.split(' ');
  const at = (k: string) => t.indexOf(k);
  const kind = t[at('score') + 1];
  const val = +t[at('score') + 2];
  if (at('score') < 0) return null;
  return {
    multipv: at('multipv') >= 0 ? +t[at('multipv') + 1] : 1,
    score: kind === 'mate' ? { mate: val } : { cp: val },
    pv: t.slice(at('pv') + 1),
  };
}

interface Job { fen: string; nodes: number; multipv: number; resolve: (l: EngineLine[]) => void; reject: (e: Error) => void }

/** Talks UCI to one Stockfish instance; analyse() calls are queued and served one at a time. Scores are from the side to move. */
export class EngineClient {
  private t!: Transport;
  private ready!: Promise<void>;
  private queue: Job[] = [];
  private current: Job | null = null;
  private lines = new Map<number, EngineLine>();
  private waiters: [string, () => void][] = [];

  constructor(private make: () => Transport) { this.boot(); }

  private boot() {
    this.t = this.make();
    this.t.onLine((l) => this.onLine(l));
    this.ready = new Promise<void>((r) => this.expect('uciok', r)).then(() => this.isReady());
    this.t.post('uci');
  }

  private expect(prefix: string, cb: () => void) { this.waiters.push([prefix, cb]); }

  isReady(): Promise<void> {
    return new Promise((r) => { this.expect('readyok', r); this.t.post('isready'); });
  }

  private onLine(line: string) {
    const w = this.waiters.findIndex(([p]) => line.startsWith(p));
    if (w >= 0) { const [, cb] = this.waiters.splice(w, 1)[0]; cb(); return; }
    if (!this.current) return;
    const info = parseInfo(line);
    if (info && info.pv.length) this.lines.set(info.multipv, { uci: info.pv[0], pv: info.pv, score: info.score });
    if (line.startsWith('bestmove')) {
      const job = this.current;
      const out = [...this.lines.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l).slice(0, job.multipv);
      this.current = null;
      job.resolve(out);
      this.pump();
    }
  }

  private async pump() {
    if (this.current || !this.queue.length) return;
    const job = (this.current = this.queue.shift()!);
    this.lines.clear();
    await this.ready;
    if (this.current !== job) return;
    this.t.post(`setoption name MultiPV value ${job.multipv}`);
    this.t.post(`position fen ${job.fen}`);
    this.t.post(`go nodes ${job.nodes}`);
  }

  analyse(fen: string, opts: { nodes: number; multipv?: number }): Promise<EngineLine[]> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, nodes: opts.nodes, multipv: opts.multipv ?? 1, resolve, reject });
      void this.pump();
    });
  }

  stop() { this.t.post('stop'); }

  async restart() {
    this.t.terminate();
    const err = new Error('EngineRestarted');
    for (const j of [this.current, ...this.queue]) j?.reject(err);
    this.current = null;
    this.queue = [];
    this.waiters = [];
    this.boot();
    await this.ready;
  }

  terminate() { this.t.terminate(); }
}

let engine: EngineClient | null = null;

/** The app-wide engine, running Stockfish 19 lite (single-threaded) in a Web Worker. */
export function getEngine(): EngineClient {
  if (engine) return engine;
  engine = new EngineClient(() => {
    const w = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`);
    let cb: (l: string) => void = () => {};
    w.onmessage = (e) => cb(typeof e.data === 'string' ? e.data : String(e.data));
    return { post: (c) => w.postMessage(c), onLine: (f) => { cb = f; }, terminate: () => w.terminate() };
  });
  // iOS suspends workers in the background; if it doesn't answer on return, start a fresh one.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !engine) return;
    const e = engine;
    const timer = setTimeout(() => void e.restart(), 1000);
    void e.isReady().then(() => clearTimeout(timer));
  });
  return engine;
}
