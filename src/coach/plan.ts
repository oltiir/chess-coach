import { isStandard } from '../import/chesscom';
import type { DB } from '../store/db';
import type { GameAnalysis, GameRecord, MistakeLabel, Puzzle } from '../store/types';
import { GROUPS } from './groups';
import { window, type Ratings } from './rating';

export interface ErrorProfile { counts: Record<string, number>; total: number; games: number; clockUsed: number | null }

const LABEL_GROUP: Partial<Record<MistakeLabel, string>> = {
  'hung-piece': 'defence', 'allowed-mate': 'defence', 'missed-free-piece': 'free', 'missed-pin': 'pins',
  'missed-skewer': 'pins', 'missed-fork': 'forks', 'missed-mate': 'mates',
};

/** Measured from his last 40 rapid games on 2026-10-28; used until the app has analysed games of its own. */
export const PRIOR: ErrorProfile = { counts: { defence: 32, pins: 12, free: 8, mates: 5, forks: 1 }, total: 58, games: 40, clockUsed: 0.43 };

/** What his own games say: mistakes by group over the last 20 analysed rapid games. */
export function errorProfile(games: GameRecord[], analyses: GameAnalysis[]): ErrorProfile {
  const byUrl = new Map(analyses.map((a) => [a.url, a]));
  const recent = games
    .filter((g) => g.timeClass === 'rapid' && isStandard(g) && byUrl.get(g.url)?.done && !byUrl.get(g.url)?.failed)
    .sort((a, b) => b.endTime - a.endTime)
    .slice(0, 20)
    .map((g) => byUrl.get(g.url)!);
  if (!recent.length) return PRIOR;
  const counts: Record<string, number> = {};
  for (const a of recent) for (const p of a.plies) {
    const grp = p.label && LABEL_GROUP[p.label];
    if (p.flag && grp) counts[grp] = (counts[grp] ?? 0) + 1;
  }
  const clocks = recent.map((a) => a.stats.clockUsedPct).filter((c): c is number => c !== null);
  return { counts, total: Object.values(counts).reduce((x, y) => x + y, 0), games: recent.length, clockUsed: clocks.length ? clocks.reduce((x, y) => x + y, 0) / clocks.length : null };
}

/** 0.5 × share of own mistakes + 0.3 × weakness (how far below the best group) + 0.2 spread evenly. */
export function groupWeights(p: ErrorProfile, r: Ratings): Record<string, number> {
  const best = Math.max(...GROUPS.map((g) => r.groups[g.key].r));
  return Object.fromEntries(GROUPS.map((g) => {
    const share = p.total ? (p.counts[g.key] ?? 0) / p.total : 0;
    const weak = Math.min(1, Math.max(0, (best - r.groups[g.key].r) / 300));
    return [g.key, 0.5 * share + 0.3 * weak + 0.2 / GROUPS.length];
  }));
}

/** A weighted sequence of groups with no group twice in a row (interleaving). */
export function orderGroups(n: number, weights: Record<string, number>, rnd = Math.random): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const options = Object.entries(weights).filter(([k, w]) => w > 0 && k !== out[i - 1]);
    const sum = options.reduce((a, [, w]) => a + w, 0);
    let x = rnd() * sum;
    const pick = options.find(([, w]) => (x -= w) <= 0) ?? options[options.length - 1];
    out.push(pick[0]);
  }
  return out;
}

/** An unseen puzzle from a group, rated for ~80% first-try success; the window widens if it runs dry. */
export async function pickPuzzle(db: DB, group: string, rating: number, seen: Set<string>, rnd = Math.random): Promise<Puzzle | null> {
  const pool = new Map<string, Puzzle>();
  for (const t of GROUPS.find((g) => g.key === group)!.themes)
    for (const p of await db.getAllFromIndex('puzzles', 'themes', t)) if (!seen.has(p.id)) pool.set(p.id, p);
  const all = [...pool.values()];
  const { min, max } = window(rating);
  for (let widen = 0; widen <= 1500; widen += 100) {
    const fit = all.filter((p) => p.rating >= min - widen && p.rating <= max + widen);
    if (fit.length) return fit[Math.floor(rnd() * fit.length)];
  }
  return null;
}

const WHAT: Record<string, string> = {
  defence: 'pieces left loose or mates allowed', pins: 'missed pins or skewers', free: 'free pieces you didn’t take',
  forks: 'missed forks', mates: 'missed mates', discovered: 'missed discovered attacks', removal: 'missed tactics against defenders', trapped: 'trapped pieces',
};

/** One line of "why today's plan", from the data. */
export function whyLine(p: ErrorProfile, top: string): string {
  const n = p.counts[top] ?? 0;
  const head = n
    ? `${n} of your last ${p.total} mistakes were ${WHAT[top]}, so today leans on that.`
    : `Today mixes your weakest themes.`;
  const clock = p.clockUsed !== null && p.clockUsed < 0.6
    ? ` You use ${Math.round(p.clockUsed * 100)}% of your clock in rapid — slow down and check before you move.`
    : '';
  return head + clock;
}
