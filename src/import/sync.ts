import { kvGet, kvSet, openDb } from '../store/db';
import { toGameRecord } from './chesscom';

export type SyncError = 'offline' | 'not-found' | 'rate-limited' | 'server';
export interface SyncResult { added: number; error?: SyncError }

class HttpError extends Error { constructor(public status: number) { super(`HTTP ${status}`); } }

const sleep2s = () => new Promise<void>((r) => setTimeout(r, 2000));

/** GET with one retry on 429. Throws HttpError on failure. Returns null on 304. */
async function get(url: string, sleep: () => Promise<void>, etag?: string): Promise<Response | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: etag ? { 'If-None-Match': etag } : {} });
    if (res.status === 304) return null;
    if (res.ok) return res;
    if (res.status === 429 && attempt === 0) { await sleep(); continue; }
    throw new HttpError(res.status);
  }
}

/**
 * Pulls the player's games from chess.com one month at a time (serially, as the API asks).
 * Only the newest two months and never-fetched months are requested; stored games are never removed.
 */
export async function syncGames(username: string, opts: { sleep?: () => Promise<void> } = {}): Promise<SyncResult> {
  const sleep = opts.sleep ?? sleep2s;
  const user = username.trim().toLowerCase();
  const db = await openDb();
  let added = 0;
  try {
    const arch = await get(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`, sleep);
    const months: string[] = arch ? (await arch.json()).archives : [];
    const fetched = (await kvGet<string[]>(`fetched:${user}`)) ?? [];
    const todo = months.filter((m, i) => i >= months.length - 2 || !fetched.includes(m));
    for (const m of todo) {
      const res = await get(m, sleep, await kvGet<string>(`etag:${m}`));
      if (res) {
        const { games } = await res.json();
        for (const g of games ?? []) {
          const rec = toGameRecord(g, user);
          if (!(await db.get('games', rec.url))) added++;
          await db.put('games', rec);
        }
        const etag = res.headers.get('etag');
        if (etag) await kvSet(`etag:${m}`, etag);
      }
      if (!fetched.includes(m)) fetched.push(m);
      await kvSet(`fetched:${user}`, fetched);
    }
    await kvSet('last-sync', Date.now());
    return { added };
  } catch (e) {
    if (e instanceof HttpError) {
      const error: SyncError = e.status === 404 ? 'not-found' : e.status === 429 ? 'rate-limited' : 'server';
      return { added, error };
    }
    return { added, error: 'offline' };
  }
}
