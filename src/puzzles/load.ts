import { kvGet, kvSet, openDb } from '../store/db';
import type { Puzzle } from '../store/types';

const VERSION = 1;
const CHUNK = 400;

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
  const lines = (await (await fetch(`${import.meta.env?.BASE_URL ?? '/'}data/puzzles.tsv`)).text()).trim().split('\n');
  // Import in small chunks, yielding between them, so the first launch never freezes the page.
  for (let i = 0; i < lines.length; i += CHUNK) {
    const tx = db.transaction('puzzles', 'readwrite');
    for (const p of parseTsv(lines.slice(i, i + CHUNK).join('\n'))) void tx.store.put(p);
    await tx.done;
    await new Promise((r) => setTimeout(r, 0));
  }
  await kvSet('puzzles-version', VERSION);
  return lines.length;
}
