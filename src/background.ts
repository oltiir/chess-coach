import { runQueue } from './analysis/queue';
import { getEngine } from './engine/client';
import { syncGames, type SyncError } from './import/sync';
import { getSettings } from './store/exportImport';
import type { GameAnalysis } from './store/types';

export interface BgStatus { syncError?: SyncError; syncing: boolean; analysed: { done: number; total: number } | null }

let status: BgStatus = { syncing: false, analysed: null };
const subs = new Set<(s: BgStatus) => void>();
const set = (patch: Partial<BgStatus>) => { status = { ...status, ...patch }; subs.forEach((f) => f(status)); };
export const subscribe = (f: (s: BgStatus) => void) => { subs.add(f); f(status); return () => void subs.delete(f); };

const gameDoneHooks: ((a: GameAnalysis) => Promise<void>)[] = [];
export const onGameAnalysed = (f: (a: GameAnalysis) => Promise<void>) => gameDoneHooks.push(f);

let ctl: AbortController | null = null;
let paused = false;

/** Stop background analysis while the engine is needed for something interactive. */
export function pauseAnalysis() { paused = true; ctl?.abort(); }
export function resumeAnalysis() { paused = false; void analyse(); }

async function analyse() {
  if (paused) return;
  ctl?.abort();
  const c = (ctl = new AbortController());
  try {
    await runQueue(c.signal, getEngine(), {
      onPly: (_, progress) => set({ analysed: progress }),
      onGameDone: (a) => { for (const f of gameDoneHooks) void f(a); },
    });
  } catch (e) {
    if ((e as Error).message !== 'EngineRestarted') console.error(e);
  }
}

/** Sync with chess.com (if online), then analyse new games in the background. */
export async function syncAndAnalyse() {
  if (navigator.onLine) {
    set({ syncing: true });
    const r = await syncGames((await getSettings()).username);
    set({ syncing: false, syncError: r.error });
  } else set({ syncError: 'offline' });
  void analyse();
}

export function startBackground() {
  setTimeout(() => void syncAndAnalyse(), 3000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => void analyse(), 1500); });
}
