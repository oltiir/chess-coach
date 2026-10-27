import { describe, expect, it } from 'vitest';
import { reasonFor } from '../../src/puzzles/reason';

const pz = (themes: string[]) => ({ id: 'x', fen: '', moves: [], rating: 800, themes });

describe('reasonFor', () => {
  it('explains a fork', () => {
    expect(reasonFor(pz(['fork']), 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5c7')).toBe('Fork: your knight attacks the king and the rook.');
  });
  it('explains a free piece', () => {
    expect(reasonFor(pz(['hangingPiece']), '4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1', 'e4d5')).toBe('Free piece: the knight on d5 was undefended — take it.');
  });
  it('explains mate', () => {
    expect(reasonFor(pz(['mateIn1', 'backRankMate']), '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d8')).toBe('Checkmate: Rd8#.');
  });
  it('falls back to naming the move', () => {
    expect(reasonFor(pz(['pin']), '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8')).toBe('Pin: Ra8+ is the move.');
  });
});
