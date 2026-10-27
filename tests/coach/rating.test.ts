import { describe, expect, it } from 'vitest';
import { glicko, expected, window, ratingsFrom, type Ratings } from '../../src/coach/rating';
import type { Attempt } from '../../src/store/types';

describe('Glicko update', () => {
  it('expected score follows the Elo curve', () => {
    expect(expected(1000, 1000)).toBeCloseTo(0.5);
    expect(expected(1000, 1000 - 301)).toBeCloseTo(0.85, 2);
  });
  it('a win against a harder puzzle raises the rating, a loss to an easier one lowers it, RD shrinks', () => {
    const up = glicko({ r: 1000, rd: 150 }, 1100, 1);
    expect(up.r).toBeGreaterThan(1000);
    expect(up.rd).toBeLessThan(150);
    const down = glicko({ r: 1000, rd: 150 }, 800, 0);
    expect(down.r).toBeLessThan(1000);
  });
  it('never lets RD below 50', () => {
    let s = { r: 1000, rd: 60 };
    for (let i = 0; i < 50; i++) s = glicko(s, 1000, i % 2);
    expect(s.rd).toBe(50);
  });
});

describe('difficulty window', () => {
  it('targets 75-85% expected success', () => {
    expect(window(1000)).toEqual({ min: 700, max: 810 });
  });
});

describe('ratings from history', () => {
  const at = (ts: number, group: string, rating: number, firstTry: boolean): Attempt =>
    ({ id: `${ts}`, kind: 'puzzle', itemId: `p${ts}`, ts, firstTry, solved: firstTry, ms: 5000, device: 'd', theme: group, rating, groups: [group] });
  it('replays rated attempts after placement onto the placement result', () => {
    const placement = { ts: 10, global: 900, groups: { defence: 800, pins: 950 } };
    const r: Ratings = ratingsFrom(placement, [at(5, 'defence', 2000, true), at(20, 'defence', 900, true), at(30, 'pins', 700, false)]);
    expect(r.groups.defence.r).toBeGreaterThan(800); // the attempt before placement is ignored, the later win counts
    expect(r.groups.pins.r).toBeLessThan(950);
    expect(r.groups.forks).toEqual({ r: 900, rd: 150 }); // unplaced group starts at the global rating
    expect(r.global.r).not.toBe(900);
  });
  it('without placement everyone starts at 900 with high uncertainty', () => {
    const r = ratingsFrom(null, []);
    expect(r.global).toEqual({ r: 900, rd: 350 });
    expect(r.placed).toBe(false);
  });
});
