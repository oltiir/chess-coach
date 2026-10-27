import { movesOf } from '../analysis/analyseGame';
import { explain } from '../analysis/classify';
import { isStandard } from '../import/chesscom';
import { kvGet, kvSet, openDb } from '../store/db';

export interface Account { token: string; code: string; crewName: string; id: string; name: string }
export class CrewError extends Error { constructor(message: string, public status: number) { super(message); } }

export const getAccount = () => kvGet<Account | null>('crew-account').then((a) => a ?? null);
export const saveAccount = (a: Account | null) => kvSet('crew-account', a);

/** Calls the crew API; offline or a dead server becomes a CrewError with status 0. */
export async function api<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const acct = token ?? (await getAccount())?.token;
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(acct ? { authorization: `Bearer ${acct}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new CrewError('You’re offline — showing the last crew update.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new CrewError(data.error ?? 'The crew server didn’t answer.', res.status);
  return data;
}

/** Fetch with an offline fallback to the last good copy. */
export async function cached<T>(key: string, path: string): Promise<{ data: T | null; error?: string }> {
  try {
    const data = await api<T>(path);
    await kvSet(`crew-cache:${key}`, data);
    return { data };
  } catch (e) {
    return { data: (await kvGet<T>(`crew-cache:${key}`)) ?? null, error: (e as Error).message };
  }
}

/** Sends finished, standard rapid games this device analysed that the crew hasn't seen yet. Returns how many. */
export async function uploadPending(): Promise<number> {
  if (!(await getAccount())) return 0;
  const db = await openDb();
  const done = new Set((await kvGet<string[]>('crew-uploaded')) ?? []);
  const analyses = new Map((await db.getAll('analyses')).map((a) => [a.url, a]));
  const pending = (await db.getAll('games')).filter((g) => {
    const a = analyses.get(g.url);
    return g.timeClass === 'rapid' && isStandard(g) && a?.done && !a.failed && !done.has(g.url);
  });
  let sent = 0;
  for (let i = 0; i < pending.length; i += 50) {
    const batch = pending.slice(i, i + 50).map((g) => {
      const a = analyses.get(g.url)!;
      return {
        url: g.url, endTime: g.endTime, result: g.result, myColor: g.myColor, myRating: g.myRating, oppRating: g.oppRating, oppName: g.oppName,
        moves: movesOf(g).map((m) => m.from + m.to + (m.promotion ?? '')).join(' '),
        stats: a.stats,
        plies: a.plies.filter((p) => p.flag || p.hang).map((p) => ({
          ply: p.ply, played: p.played, best: p.best, label: p.label ?? (p.hang ? 'hung-piece' : 'other'), hang: p.hang?.square ?? null,
          explanation: p.label ? explain(p) : '', fenBefore: p.fenBefore,
        })),
      };
    });
    try { await api('/api/games', { games: batch }); } catch { break; }
    for (const g of batch) done.add(g.url);
    sent += batch.length;
    await kvSet('crew-uploaded', [...done]);
  }
  return sent;
}
