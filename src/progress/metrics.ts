import { dayKey, daysTrainedThisWeek } from '../today/session';
import type { Attempt, GameAnalysis, GameRecord } from '../store/types';
import { isStandard } from '../import/chesscom';

export interface WeekPoint { week: string; avg: number; n: number }
export interface Rate { rolling: number | null; prev: number | null; weekly: WeekPoint[]; n: number }

export interface ProgressData {
  hangsPerGame: Rate; freeMissedPerGame: Rate; pawnHangsPerGame: Rate;
  rapidRating: { t: number; rating: number }[];
  themeAccuracy: Record<string, { firstTryPct: number; n: number }>;
  repeatSolveMs: WeekPoint[]; clockUsed: WeekPoint[];
  blitzThisWeek: number; daysTrainedThisWeek: number;
  analysed: { done: number; total: number };
}

const mondayOf = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime(); };
export const weekOf = (t: number) => dayKey(mondayOf(t));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function weekly(points: { t: number; v: number }[]): WeekPoint[] {
  const by = new Map<string, number[]>();
  for (const p of points) by.set(weekOf(p.t), [...(by.get(weekOf(p.t)) ?? []), p.v]);
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([week, vs]) => ({ week, avg: mean(vs)!, n: vs.length }));
}

function rate(points: { t: number; v: number }[]): Rate {
  const vs = points.map((p) => p.v);
  return { rolling: mean(vs.slice(-10)), prev: mean(vs.slice(-20, -10)), weekly: weekly(points), n: Math.min(10, vs.length) };
}

export function metrics(games: GameRecord[], analyses: GameAnalysis[], attempts: Attempt[], now: number): ProgressData {
  const byUrl = new Map(analyses.map((a) => [a.url, a]));
  const rapid = games.filter((g) => g.timeClass === 'rapid').sort((a, b) => a.endTime - b.endTime);
  const analysable = games.filter((g) => (g.timeClass === 'rapid' || g.timeClass === 'daily') && isStandard(g));
  const done = rapid.filter((g) => isStandard(g) && byUrl.get(g.url)?.done && !byUrl.get(g.url)?.failed).map((g) => ({ g, s: byUrl.get(g.url)!.stats }));
  const series = (f: (s: GameAnalysis['stats']) => number) => done.map(({ g, s }) => ({ t: g.endTime, v: f(s) }));

  const themeAccuracy: ProgressData['themeAccuracy'] = {};
  for (const a of attempts) {
    if (a.kind !== 'puzzle' || !a.theme) continue;
    const cur = themeAccuracy[a.theme] ?? { firstTryPct: 0, n: 0 };
    themeAccuracy[a.theme] = { firstTryPct: (cur.firstTryPct * cur.n + (a.firstTry ? 1 : 0)) / (cur.n + 1), n: cur.n + 1 };
  }

  const seen = new Set<string>();
  const repeats: { t: number; v: number }[] = [];
  for (const a of [...attempts].sort((x, y) => x.ts - y.ts)) {
    if (seen.has(a.itemId)) repeats.push({ t: a.ts, v: a.ms });
    seen.add(a.itemId);
  }
  const repeatSolveMs = weekly(repeats).map((w) => {
    const vs = repeats.filter((r) => weekOf(r.t) === w.week).map((r) => r.v).sort((a, b) => a - b);
    return { ...w, avg: vs[Math.floor((vs.length - 1) / 2)] };
  });

  const monday = mondayOf(now);
  return {
    hangsPerGame: rate(series((s) => s.hangs)),
    freeMissedPerGame: rate(series((s) => s.freeMissed)),
    pawnHangsPerGame: rate(series((s) => s.pawnHangs)),
    rapidRating: rapid.slice(-50).map((g) => ({ t: g.endTime, rating: g.myRating })),
    themeAccuracy,
    repeatSolveMs,
    clockUsed: weekly(done.filter(({ s }) => s.clockUsedPct !== null).map(({ g, s }) => ({ t: g.endTime, v: s.clockUsedPct! }))),
    blitzThisWeek: games.filter((g) => g.timeClass === 'blitz' && g.endTime >= monday).length,
    daysTrainedThisWeek: daysTrainedThisWeek(attempts, now),
    analysed: { done: analysable.filter((g) => byUrl.get(g.url)?.done).length, total: analysable.length },
  };
}
