import * as ort from 'onnxruntime-web/wasm';
import { Chess } from 'chess.js';
import { boardToTokens, moveIndex } from './maiaTokens';

export interface Bot { chooseMove(fen: string, botElo: number, playerElo: number): Promise<string> }

const clampElo = (e: number) => Math.max(600, Math.min(2600, e));

/** Maia-3 (5M, fp16): predicts the move a human of a given rating would play. */
export class MaiaBot implements Bot {
  private constructor(private session: ort.InferenceSession) {}

  static async load(model: string | Uint8Array): Promise<MaiaBot> {
    ort.env.wasm.numThreads = 1; // no cross-origin isolation on a plain static host / iOS home-screen app
    const opts: ort.InferenceSession.SessionOptions = { graphOptimizationLevel: 'basic', executionProviders: ['wasm'] };
    const session = typeof model === 'string' ? await ort.InferenceSession.create(model, opts) : await ort.InferenceSession.create(model, opts);
    return new MaiaBot(session);
  }

  /** Legal moves with their probabilities, best first. */
  async policy(fen: string, selfElo: number, oppoElo: number): Promise<{ uci: string; p: number }[]> {
    const c = new Chess(fen);
    const black = c.turn() === 'b';
    const out = await this.session.run({
      tokens: new ort.Tensor('float32', boardToTokens(fen), [1, 64, 12]),
      elo_self: new ort.Tensor('float32', new Float32Array([clampElo(selfElo)]), [1]),
      elo_oppo: new ort.Tensor('float32', new Float32Array([clampElo(oppoElo)]), [1]),
    });
    const logits = out.logits_move.data as Float32Array;
    const legal = c.moves({ verbose: true }).map((m) => {
      const uci = m.from + m.to + (m.promotion ?? '');
      return { uci, l: logits[moveIndex(uci, black)] };
    });
    const max = Math.max(...legal.map((m) => m.l));
    const exp = legal.map((m) => ({ uci: m.uci, e: Math.exp(m.l - max) }));
    const sum = exp.reduce((a, m) => a + m.e, 0);
    return exp.map((m) => ({ uci: m.uci, p: m.e / sum })).sort((a, b) => b.p - a.p);
  }

  async topMoves(fen: string, selfElo: number, oppoElo: number, n: number): Promise<string[]> {
    return (await this.policy(fen, selfElo, oppoElo)).slice(0, n).map((m) => m.uci);
  }

  /** Samples a move at temperature 1, so the bot varies its play like a person does. */
  async chooseMove(fen: string, botElo: number, playerElo: number): Promise<string> {
    return sample(await this.policy(fen, botElo, playerElo));
  }
}

/** Sample a move from a policy at temperature 1. */
export function sample(pol: { uci: string; p: number }[]): string {
  let r = Math.random();
  for (const m of pol) { r -= m.p; if (r <= 0) return m.uci; }
  return pol[0].uci;
}

/** Talks to Maia running in a Web Worker. */
class WorkerBot implements Bot {
  private w = new Worker(new URL('./maia.worker.ts', import.meta.url), { type: 'module' });
  private next = 0;
  private waiting = new Map<number, (r: { ok: boolean; policy?: { uci: string; p: number }[]; error?: string }) => void>();
  private url = `${import.meta.env.BASE_URL}models/maia3-5m.fp16.onnx`;

  constructor() {
    this.w.onmessage = (e) => { this.waiting.get(e.data.id)?.(e.data); this.waiting.delete(e.data.id); };
  }

  private ask(fen: string, self: number, oppo: number) {
    const id = this.next++;
    return new Promise<{ ok: boolean; policy?: { uci: string; p: number }[]; error?: string }>((res) => {
      this.waiting.set(id, res);
      this.w.postMessage({ id, url: this.url, fen, self, oppo });
    });
  }

  /** Loads the model in the background so the first move isn't slow. */
  async warm() { await this.ask('', 0, 0); }

  async chooseMove(fen: string, botElo: number, playerElo: number): Promise<string> {
    const r = await this.ask(fen, botElo, playerElo);
    if (!r.ok || !r.policy) throw new Error(r.error ?? 'Maia failed');
    return sample(r.policy);
  }
}

let bot: WorkerBot | null = null;
export const getBot = (): Promise<Bot> => Promise.resolve((bot ??= new WorkerBot()));
export const warmBot = () => void (bot ??= new WorkerBot()).warm();
