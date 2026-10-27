// Pure crew rules: Safety Level, leaderboard, weekly quest, rivals, Monday recap.

const BANDS: [number, number][] = [[0.2, 10], [0.4, 9], [0.6, 8], [0.8, 7], [1.0, 6], [1.3, 5], [1.6, 4], [2.0, 3], [2.5, 2]];
const raw = (hpg: number) => BANDS.find(([max]) => hpg <= max)?.[1] ?? 1;
const MARGIN = 0.05;
const DAY = 86_400_000;

/** Level from hangs per game; only changes once hpg is past the band edge by MARGIN, so it doesn't flap. */
export function safetyLevel(hpg: number, previous: number | null): number {
  const next = raw(hpg);
  if (previous === null || next === previous) return next;
  const edge = next < previous
    ? BANDS.find(([, l]) => l === previous)?.[0] ?? Infinity // getting worse: past the top of the old band
    : BANDS.find(([, l]) => l === next)?.[0] ?? Infinity; // getting better: below the top of the new band
  return next < previous ? (hpg > edge + MARGIN ? next : previous) : (hpg < edge - MARGIN ? next : previous);
}

export interface Row { id: string; name: string; level: number | null; hpg: number; games: number }
export function leaderboard(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    if ((a.level === null) !== (b.level === null)) return a.level === null ? 1 : -1;
    return (b.level ?? 0) - (a.level ?? 0) || a.hpg - b.hpg || a.name.localeCompare(b.name);
  });
}

export const weekStart = (t: number) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); };

/** Weekly quest: 3 rapid games using at least half the clock, per member. */
export function questDots(byMember: Record<string, { endTime: number; clockUsedPct: number | null }[]>, now: number) {
  const from = weekStart(now);
  return Object.fromEntries(Object.entries(byMember).map(([id, gs]) =>
    [id, gs.filter((g) => g.endTime >= from && (g.clockUsedPct ?? 0) >= 0.5).length >= 3]));
}

/** Rival record from my games against them; clean-off (fewer hangs wins) when ratings differ by more than 150. */
export function headToHead(
  mine: { oppName: string; result: string; hangs: number; url: string; oppRating: number; myRating: number }[],
  theirs: { url: string; hangs: number }[],
  rivalChesscom: string,
) {
  const out = { wins: 0, losses: 0, draws: 0, cleanOff: false };
  for (const g of mine.filter((x) => x.oppName.toLowerCase() === rivalChesscom.toLowerCase())) {
    const them = theirs.find((t) => t.url === g.url);
    let r = g.result;
    if (Math.abs(g.oppRating - g.myRating) > 150 && them) {
      out.cleanOff = true;
      if (g.hangs !== them.hangs) r = g.hangs < them.hangs ? 'win' : 'loss';
    }
    if (r === 'win') out.wins++; else if (r === 'loss') out.losses++; else out.draws++;
  }
  return out;
}

interface RecapGame { endTime: number; hangs: number; ownMoves: number; url: string }
/** Last week's recap: a line per member, most improved (smoothed vs a 4-week baseline), cleanest game. */
export function recap(members: Record<string, { name: string; games: RecapGame[] }>, now: number) {
  const thisWeek = weekStart(now);
  const lastWeek = thisWeek - 7 * DAY;
  const baseFrom = lastWeek - 28 * DAY;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const lines: { name: string; games: number; hpg: number }[] = [];
  let best: { name: string; score: number } | null = null;
  let cleanest: { member: string; url: string; ownMoves: number } | null = null;
  for (const m of Object.values(members)) {
    const last = m.games.filter((g) => g.endTime >= lastWeek && g.endTime < thisWeek);
    const base = m.games.filter((g) => g.endTime >= baseFrom && g.endTime < lastWeek);
    if (last.length) lines.push({ name: m.name, games: last.length, hpg: Math.round(mean(last.map((g) => g.hangs)) * 100) / 100 });
    if (last.length >= 3 && base.length) {
      const b = mean(base.map((g) => g.hangs));
      const smoothed = (last.reduce((a, g) => a + g.hangs, 0) + 3 * b) / (last.length + 3);
      const score = b - smoothed;
      if (score > 0 && (!best || score > best.score)) best = { name: m.name, score };
    }
    for (const g of last) if (g.hangs === 0 && (!cleanest || g.ownMoves > cleanest.ownMoves)) cleanest = { member: m.name, url: g.url, ownMoves: g.ownMoves };
  }
  return { week: new Date(lastWeek).toISOString().slice(0, 10), lines, mostImproved: best?.name ?? null, cleanest };
}
