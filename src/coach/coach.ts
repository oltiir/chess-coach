// Runtime glue: ratings, error profile and puzzle choice from what's stored on the device.
import { allAttempts, logAttempt } from '../store/attempts';
import { kvGet, openDb } from '../store/db';
import type { Puzzle } from '../store/types';
import { groupsOf } from './groups';
import { errorProfile, groupWeights, orderGroups, pickPuzzle, type ErrorProfile } from './plan';
import { ratingsFrom, type Placement, type Ratings } from './rating';

export async function coachState(): Promise<{ ratings: Ratings; profile: ErrorProfile; weights: Record<string, number> }> {
  const db = await openDb();
  const ratings = ratingsFrom((await kvGet<Placement>('placement')) ?? null, await allAttempts());
  const profile = errorProfile(await db.getAll('games'), await db.getAll('analyses'));
  return { ratings, profile, weights: groupWeights(profile, ratings) };
}

/** n new puzzles: groups chosen by weight (or fixed), interleaved, each at ~80% expected success. */
export async function nextPuzzles(n: number, group?: string, exclude: Set<string> = new Set()): Promise<{ puzzle: Puzzle; group: string }[]> {
  const { ratings, weights } = await coachState();
  const db = await openDb();
  const seen = new Set([...(await allAttempts()).map((a) => a.itemId), ...exclude]);
  const order = group ? Array(n).fill(group) : orderGroups(n, weights);
  const out: { puzzle: Puzzle; group: string }[] = [];
  for (const g of order) {
    const p = await pickPuzzle(db, g, ratings.groups[g].r, seen);
    if (p) { out.push({ puzzle: p, group: g }); seen.add(p.id); }
  }
  return out;
}

export interface PuzzleResult { solved: boolean; firstTry: boolean; ms: number; firstMoveMs?: number }

export function logPuzzle(p: Puzzle, r: PuzzleResult, servedGroup?: string) {
  const groups = groupsOf(p.themes);
  return logAttempt({ kind: 'puzzle', itemId: p.id, ts: Date.now(), ...r, rating: p.rating, groups, theme: servedGroup ?? groups[0] });
}
