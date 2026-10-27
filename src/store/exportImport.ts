import { kvGet, kvSet, openDb } from './db';
import { DEFAULT_SETTINGS, type Attempt, type Drill, type GameAnalysis, type GameRecord, type Settings } from './types';

export interface ExportFile {
  version: 1; exportedAt: number;
  attempts: Attempt[]; games: GameRecord[]; analyses: GameAnalysis[]; drills: Drill[]; settings: Settings;
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await kvGet<Partial<Settings>>('settings')) };
}

export async function saveSettings(patch: Partial<Settings>) {
  await kvSet('settings', { ...(await getSettings()), ...patch });
}

export async function exportAll(): Promise<ExportFile> {
  const db = await openDb();
  return {
    version: 1, exportedAt: Date.now(),
    attempts: await db.getAll('attempts'), games: await db.getAll('games'),
    analyses: await db.getAll('analyses'), drills: await db.getAll('drills'),
    settings: await getSettings(),
  };
}

const further = (a: GameAnalysis, b: GameAnalysis) =>
  a.done !== b.done ? (a.done ? a : b) : a.nextPly >= b.nextPly ? a : b;

/** Merges a backup into this device. Never deletes or overwrites newer data. */
export async function importMerge(f: ExportFile): Promise<{ added: number }> {
  const lists = ['attempts', 'games', 'analyses', 'drills'] as const;
  if (!f || typeof f !== 'object' || !('version' in f)) throw new Error('That file isn’t a Chess Coach backup.');
  if (f.version !== 1) throw new Error('Unsupported backup version');
  if (lists.some((k) => !Array.isArray(f[k]))) throw new Error('That file isn’t a Chess Coach backup.');
  const db = await openDb();
  const tx = db.transaction(['attempts', 'games', 'analyses', 'drills'], 'readwrite');
  let added = 0;
  for (const a of f.attempts) {
    if (!(await tx.objectStore('attempts').get(a.id))) { await tx.objectStore('attempts').put(a); added++; }
  }
  for (const g of f.games) {
    if (!(await tx.objectStore('games').get(g.url))) await tx.objectStore('games').put(g);
  }
  for (const d of f.drills) {
    if (!(await tx.objectStore('drills').get(d.id))) { await tx.objectStore('drills').put(d); added++; }
  }
  for (const a of f.analyses) {
    const mine = await tx.objectStore('analyses').get(a.url);
    await tx.objectStore('analyses').put(mine ? further(mine, a) : a);
  }
  await tx.done;
  const existing = (await kvGet<Partial<Settings>>('settings')) ?? {};
  await kvSet('settings', { ...f.settings, ...existing });
  return { added };
}
