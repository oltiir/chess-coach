import { describe, expect, it } from 'vitest';
import { metrics, weekOf } from '../../src/progress/metrics';
import type { Attempt, GameAnalysis, GameRecord } from '../../src/store/types';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 28, 12).getTime(); // Wed 28 Oct 2026
const MON = new Date(2026, 9, 26).getTime();

let n = 0;
const game = (endTime: number, timeClass: GameRecord['timeClass'] = 'rapid', myRating = 600): GameRecord => ({
  url: `g${++n}`, endTime, timeClass, timeControl: '600+5', myColor: 'w', myRating, oppRating: 600, oppName: 'x', result: 'win', pgn: '',
});
const analysis = (url: string, hangs: number, freeMissed = 0, clockUsedPct: number | null = 0.5): GameAnalysis => ({
  url, engine: 'sf19-lite', nodes: 1, plies: [], done: true, nextPly: 0,
  stats: { ownMoves: 30, hangs, pawnHangs: 0, freeMissed, clockUsedPct },
});

describe('weekOf', () => {
  it('starts weeks on Monday', () => {
    expect(weekOf(NOW)).toBe('2026-10-26');
    expect(weekOf(MON - 1)).toBe('2026-10-19');
  });
});

describe('metrics', () => {
  it('averages pieces hung over the last 10 analysed rapid games and the 10 before', () => {
    const games = Array.from({ length: 20 }, (_, i) => game(NOW - (20 - i) * DAY));
    const analyses = games.map((g, i) => analysis(g.url, i < 10 ? 2 : 1));
    const m = metrics(games, analyses, [], NOW);
    expect(m.hangsPerGame.rolling).toBe(1);
    expect(m.hangsPerGame.prev).toBe(2);
    expect(m.hangsPerGame.n).toBe(10);
  });

  it('builds weekly points only for weeks with games', () => {
    const games = [game(MON + DAY), game(MON + 2 * DAY), game(MON - 14 * DAY)];
    const analyses = [analysis(games[0].url, 1, 1, 0.4), analysis(games[1].url, 3, 0, 0.6), analysis(games[2].url, 0)];
    const m = metrics(games, analyses, [], NOW);
    expect(m.hangsPerGame.weekly).toEqual([{ week: '2026-10-12', avg: 0, n: 1 }, { week: '2026-10-26', avg: 2, n: 2 }]);
    expect(m.freeMissedPerGame.weekly.at(-1)).toEqual({ week: '2026-10-26', avg: 0.5, n: 2 });
    expect(m.clockUsed.at(-1)).toEqual({ week: '2026-10-26', avg: 0.5, n: 2 });
  });

  it('ignores blitz, bot and unfinished analyses for hang stats but counts blitz this week', () => {
    const blitz = game(MON + DAY, 'blitz');
    const bot = game(MON + DAY, 'bot');
    const old = game(MON - DAY, 'blitz');
    const unfinished = game(MON + DAY);
    const m = metrics([blitz, bot, old, unfinished], [analysis(blitz.url, 5), analysis(bot.url, 5), { ...analysis(unfinished.url, 5), done: false }], [], NOW);
    expect(m.hangsPerGame.rolling).toBeNull();
    expect(m.blitzThisWeek).toBe(1);
    expect(m.analysed).toEqual({ done: 0, total: 1 });
  });

  it('tracks rapid rating over time', () => {
    const m = metrics([game(2, 'rapid', 650), game(1, 'rapid', 600), game(3, 'blitz', 200)], [], [], NOW);
    expect(m.rapidRating).toEqual([{ t: 1, rating: 600 }, { t: 2, rating: 650 }]);
  });

  it('reports first-try accuracy per ladder step and repeat solve time', () => {
    const a = (itemId: string, ts: number, firstTry: boolean, ms: number): Attempt =>
      ({ id: `${itemId}${ts}`, kind: 'puzzle', itemId, ts, firstTry, solved: true, ms, device: 'd', theme: 'fork' });
    const attempts = [a('p1', MON + 1, false, 9000), a('p1', MON + DAY, true, 4000), a('p2', MON + 2, true, 3000), a('p3', MON + DAY + 5, true, 6000)];
    const m = metrics([], [], attempts, NOW);
    expect(m.themeAccuracy.fork).toEqual({ firstTryPct: 0.75, n: 4 });
    expect(m.repeatSolveMs).toEqual([{ week: '2026-10-26', avg: 4000, n: 1 }]);
    expect(m.daysTrainedThisWeek).toBe(2);
  });
});

describe('odds games', () => {
  it('are left out of the pieces-hung stats', () => {
    const odds = { ...game(MON + DAY), pgn: '[SetUp "1"]\n[FEN "3qk3/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1"]\n\n1. e4' };
    const normal = game(MON + DAY);
    const m = metrics([odds, normal], [analysis(odds.url, 9), analysis(normal.url, 1)], [], NOW);
    expect(m.hangsPerGame.rolling).toBe(1);
  });
});

describe('rating series', () => {
  it('keeps only the last 50 rapid games', () => {
    const games = Array.from({ length: 70 }, (_, i) => game(i + 1, 'rapid', 500 + i));
    const m = metrics(games, [], [], NOW);
    expect(m.rapidRating).toHaveLength(50);
    expect(m.rapidRating[0].rating).toBe(520);
  });
  it('reports how many games the rolling average uses', () => {
    const games = [game(1), game(2), game(3)];
    expect(metrics(games, games.map((g) => analysis(g.url, 1)), [], NOW).hangsPerGame.n).toBe(3);
  });
});
