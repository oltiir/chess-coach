/// <reference lib="webworker" />
// Runs Maia off the main thread so the board never freezes while the bot thinks.
import { MaiaBot } from './maia';

let bot: Promise<MaiaBot> | null = null;

self.onmessage = async (e: MessageEvent<{ id: number; url: string; fen: string; self: number; oppo: number }>) => {
  const { id, url, fen, self: selfElo, oppo } = e.data;
  try {
    bot ??= MaiaBot.load(url);
    const b = await bot;
    if (!fen) return postMessage({ id, ok: true });
    postMessage({ id, ok: true, policy: await b.policy(fen, selfElo, oppo) });
  } catch (err) {
    bot = null;
    postMessage({ id, ok: false, error: String(err) });
  }
};
