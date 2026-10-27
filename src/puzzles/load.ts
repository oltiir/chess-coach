import { kvGet, kvSet, openDb } from '../store/db';
import type { Puzzle } from '../store/types';

const VERSION = 1;

export function parseTsv(text: string): Puzzle[] {
  return text.trim().split('\n').map((l) => {
    const [id, fen, moves, rating, themes] = l.split('\t');
    return { id, fen, moves: moves.split(' '), rating: +rating, themes: themes.split(' ') };
  });
}

/** Loads the bundled puzzle set into IndexedDB on first run. Safe to call on every launch. */
export async function ensurePuzzlesLoaded(): Promise<number> {
  const db = await openDb();
  if ((await kvGet<number>('puzzles-version')) === VERSION) return db.count('puzzles');
  const puzzles = parseTsv(await (await fetch(`${import.meta.env?.BASE_URL ?? '/'}data/puzzles.tsv`)).text());
  const tx = db.transaction('puzzles', 'readwrite');
  for (const p of puzzles) tx.store.put(p);
  await tx.done;
  await kvSet('puzzles-version', VERSION);
  return puzzles.length;
}
