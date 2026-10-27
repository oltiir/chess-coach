import type { DB } from '../store/db';
import type { Attempt, Puzzle } from '../store/types';
import { LADDER, stepFor, themeStatus } from './ladder';

const clamp = (x: number) => Math.max(400, Math.min(1400, x));

/** Rating band for a ladder step: starts at seed ±150, nudged ±50 per block of 10 attempts. */
export function bandFor(step: string, attempts: Attempt[], seed: number) {
  const mine = attempts.filter((a) => a.kind === 'puzzle' && a.theme === step).sort((a, b) => a.ts - b.ts);
  let centre = clamp(seed);
  for (let i = 0; i + 10 <= mine.length; i += 10) {
    const rate = mine.slice(i, i + 10).filter((a) => a.firstTry).length / 10;
    if (rate > 0.9) centre = clamp(centre + 50);
    else if (rate < 0.8) centre = clamp(centre - 50);
  }
  return { min: centre - 150, max: centre + 150 };
}

const shuffle = <T,>(xs: T[]) => {
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  return xs;
};

async function fromStep(db: DB, step: string, n: number, seen: Set<string>, attempts: Attempt[], seed: number) {
  if (n <= 0) return [];
  const pool = new Map<string, Puzzle>();
  for (const t of stepFor(step).themes)
    for (const p of await db.getAllFromIndex('puzzles', 'themes', t)) if (!seen.has(p.id)) pool.set(p.id, p);
  const { min, max } = bandFor(step, attempts, seed);
  const all = [...pool.values()];
  for (let widen = 0; widen <= 1000; widen += 100) {
    const fit = all.filter((p) => p.rating >= min - widen && p.rating <= max + widen);
    if (fit.length >= n || widen === 1000) return shuffle(fit).slice(0, n);
  }
  return [];
}

/** New puzzles: 70% from the current step, 30% from mastered steps, never one already tried. */
export async function pickNewPuzzles(db: DB, n: number, attempts: Attempt[], seed: number, step?: string): Promise<Puzzle[]> {
  const seen = new Set(attempts.map((a) => a.itemId));
  const st = themeStatus(attempts);
  if (step) return fromStep(db, step, n, seen, attempts, seed);
  const review = st.mastered.length ? Math.round(n * 0.3) : 0;
  const out: Puzzle[] = [];
  for (let i = 0; i < review; i++) {
    const k = st.mastered[Math.floor(Math.random() * st.mastered.length)];
    out.push(...(await fromStep(db, k, 1, new Set([...seen, ...out.map((p) => p.id)]), attempts, seed)));
  }
  out.push(...(await fromStep(db, st.current, n - out.length, new Set([...seen, ...out.map((p) => p.id)]), attempts, seed)));
  return out;
}

/** Which ladder step a puzzle counts toward. */
export const stepOf = (p: Puzzle, preferred?: string) =>
  (preferred && stepFor(preferred).themes.some((t) => p.themes.includes(t)) ? preferred : undefined) ??
  LADDER.find((s) => s.themes.some((t) => p.themes.includes(t)))?.key ?? 'hangingPiece';
