import { describe, expect, it } from 'vitest';
import { GROUPS, groupsOf } from '../../src/coach/groups';
// @ts-expect-error plain JS build script
import { filterRow } from '../../scripts/build-puzzles.mjs';

describe('theme groups', () => {
  it('has the 8 groups from the design', () => {
    expect(GROUPS.map((g) => g.key)).toEqual(['defence', 'free', 'pins', 'forks', 'discovered', 'mates', 'removal', 'trapped']);
  });
  it('maps Lichess themes to groups', () => {
    expect(groupsOf(['defensiveMove', 'endgame'])).toEqual(['defence']);
    expect(groupsOf(['skewer', 'fork', 'short'])).toEqual(['pins', 'forks']);
    expect(groupsOf(['backRankMate', 'mateIn1'])).toEqual(['mates']);
    expect(groupsOf(['capturingDefender'])).toEqual(['removal']);
    expect(groupsOf(['endgame'])).toEqual([]);
  });
});

describe('puzzle build filter', () => {
  const row = (rating: number, themes: string) => ['id', 'fen', 'a1a2 a2a3', `${rating}`, '75', '90', '500', themes];
  it('keeps 400-2000 puzzles in any group', () => {
    expect(filterRow(row(1900, 'defensiveMove'))).not.toBeNull();
    expect(filterRow(row(2100, 'defensiveMove'))).toBeNull();
    expect(filterRow(row(900, 'endgame crushing'))).toBeNull();
  });
});
