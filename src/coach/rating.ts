import type { Attempt } from '../store/types';
import { GROUPS } from './groups';

/** Glicko-1 for puzzle training: each first-try attempt is a game against the puzzle's (fixed) Lichess rating. */
export interface Skill { r: number; rd: number }
export interface Placement { ts: number; global: number; groups: Record<string, number> }
export interface Ratings { global: Skill; groups: Record<string, Skill>; placed: boolean }

const Q = Math.log(10) / 400;
const PUZZLE_RD = 80;
const RD_MIN = 50;
const RD_PLACED = 150;
const RD_NEW = 350;
export const START = 900;

const g = (rd: number) => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));
/** Plain Elo expectation (used for choosing difficulty). */
export const expected = (r: number, puzzle: number) => 1 / (1 + 10 ** (-(r - puzzle) / 400));
const expectedG = (r: number, puzzle: number) => 1 / (1 + 10 ** (-g(PUZZLE_RD) * (r - puzzle) / 400));

export function glicko(s: Skill, puzzle: number, score: 0 | 1 | number): Skill {
  const gj = g(PUZZLE_RD);
  const e = expectedG(s.r, puzzle);
  const d2 = 1 / (Q * Q * gj * gj * e * (1 - e));
  const denom = 1 / (s.rd * s.rd) + 1 / d2;
  return { r: s.r + (Q / denom) * gj * (score - e), rd: Math.max(RD_MIN, Math.sqrt(1 / denom)) };
}

/** New-puzzle rating window: expected first-try success between 0.75 and 0.85. */
export const window = (r: number) => ({ min: Math.round(r - 300), max: Math.round(r - 190) });

/** Ratings are derived from the attempt log (merge-safe), starting from the placement result. */
export function ratingsFrom(placement: Placement | null, attempts: Attempt[]): Ratings {
  const rd = placement ? RD_PLACED : RD_NEW;
  const base = placement?.global ?? START;
  const global: Skill = { r: base, rd };
  const groups: Record<string, Skill> = Object.fromEntries(GROUPS.map((x) => [x.key, { r: placement?.groups[x.key] ?? base, rd }]));
  let gl = global;
  for (const a of [...attempts].sort((x, y) => x.ts - y.ts)) {
    if (a.kind !== 'puzzle' || !a.rating || !a.groups?.length || (placement && a.ts <= placement.ts)) continue;
    const score = a.firstTry ? 1 : 0;
    gl = glicko(gl, a.rating, score);
    for (const k of a.groups) if (groups[k]) groups[k] = glicko(groups[k], a.rating, score);
  }
  return { global: gl, groups, placed: !!placement };
}
