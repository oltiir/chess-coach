import { describe, expect, it } from 'vitest';
import { safetyLevel, leaderboard, questDots, headToHead, recap, weekStart } from '../../worker/crew';

describe('Safety Level', () => {
  it('maps hangs per game to 1-10', () => {
    expect(safetyLevel(0, null)).toBe(10);
    expect(safetyLevel(0.5, null)).toBe(8);
    expect(safetyLevel(1.0, null)).toBe(6);
    expect(safetyLevel(3, null)).toBe(1);
  });
  it('only moves when hpg is past the band edge by 0.05', () => {
    expect(safetyLevel(0.62, 8)).toBe(8); // just over 0.6: stays 8
    expect(safetyLevel(0.66, 8)).toBe(7);
    expect(safetyLevel(0.57, 7)).toBe(7); // just under 0.6: stays 7
    expect(safetyLevel(0.54, 7)).toBe(8);
  });
});

describe('leaderboard', () => {
  it('sorts by level, then hangs per game, calibrating last', () => {
    const rows = leaderboard([
      { id: 'a', name: 'A', level: 6, hpg: 1.0, games: 10 },
      { id: 'b', name: 'B', level: null, hpg: 0, games: 2 },
      { id: 'c', name: 'C', level: 8, hpg: 0.5, games: 10 },
      { id: 'd', name: 'D', level: 6, hpg: 0.9, games: 10 },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['c', 'd', 'a', 'b']);
  });
});

const MON = Date.UTC(2026, 9, 26); // Monday 26 Oct 2026
describe('weekly quest and rivals', () => {
  it('fills a dot for 3 games using at least half the clock this week', () => {
    const g = (t: number, clock: number) => ({ endTime: t, clockUsedPct: clock });
    expect(questDots({ x: [g(MON + 1, 0.5), g(MON + 2, 0.7), g(MON + 3, 0.9)], y: [g(MON + 1, 0.9), g(MON + 2, 0.2), g(MON - 1, 0.9)] }, MON + 5))
      .toEqual({ x: true, y: false });
    expect(weekStart(MON + 3 * 86_400_000)).toBe(MON);
  });
  it('head-to-head uses results, or fewer hangs when ratings differ by more than 150', () => {
    const mine = [{ oppName: 'arben_k', result: 'loss', hangs: 0, url: 'g1', oppRating: 900, myRating: 600 }];
    const theirs = [{ url: 'g1', hangs: 2 }];
    expect(headToHead(mine, theirs, 'arben_k')).toEqual({ wins: 1, losses: 0, draws: 0, cleanOff: true });
    const close = [{ oppName: 'arben_k', result: 'loss', hangs: 0, url: 'g2', oppRating: 650, myRating: 600 }];
    expect(headToHead(close, [{ url: 'g2', hangs: 2 }], 'arben_k')).toEqual({ wins: 0, losses: 1, draws: 0, cleanOff: false });
  });
});

describe('recap', () => {
  it('finds the most improved (3+ games last week, smoothed) and the cleanest game', () => {
    const W = 7 * 86_400_000;
    const g = (t: number, hangs: number, ownMoves = 30) => ({ endTime: t, hangs, ownMoves, url: `u${t}` });
    const r = recap({
      a: { name: 'A', games: [g(MON - 3 * W, 2), g(MON - 2 * W, 2), g(MON - W + 1, 0, 40), g(MON - W + 2, 0), g(MON - W + 3, 1)] },
      b: { name: 'B', games: [g(MON - 3 * W, 1), g(MON - W + 1, 1)] },
    }, MON + 1);
    expect(r.mostImproved).toBe('A');
    expect(r.cleanest).toEqual({ member: 'A', url: `u${MON - W + 1}`, ownMoves: 40 });
    expect(r.lines.find((l) => l.name === 'B')).toEqual({ name: 'B', games: 1, hpg: 1 });
  });
});
