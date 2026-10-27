import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS build script
import { filterRow } from '../../scripts/build-puzzles.mjs';

// PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
const row = (rating: number, rd: number, pop: number, plays: number, themes: string) =>
  ['00abc', '6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1', 'g8f8 d1d8', `${rating}`, `${rd}`, `${pop}`, `${plays}`, themes, 'https://lichess.org/x', ''];

describe('filterRow', () => {
  it('keeps an easy popular back-rank puzzle', () => {
    expect(filterRow(row(900, 75, 95, 500, 'backRankMate mate mateIn1 short'))).toEqual({
      id: '00abc', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1', moves: ['g8f8', 'd1d8'], rating: 900,
      themes: ['backRankMate', 'mate', 'mateIn1', 'short'],
    });
  });
  it('rejects ratings outside 400-2000', () => {
    expect(filterRow(row(2100, 75, 95, 500, 'fork'))).toBeNull();
    expect(filterRow(row(350, 75, 95, 500, 'fork'))).toBeNull();
  });
  it('rejects uncertain, unpopular or rarely played puzzles', () => {
    expect(filterRow(row(900, 95, 95, 500, 'fork'))).toBeNull();
    expect(filterRow(row(900, 75, 79, 500, 'fork'))).toBeNull();
    expect(filterRow(row(900, 75, 95, 99, 'fork'))).toBeNull();
  });
  it('rejects puzzles with no ladder theme', () => {
    expect(filterRow(row(900, 75, 95, 500, 'endgame crushing long'))).toBeNull();
  });
});
