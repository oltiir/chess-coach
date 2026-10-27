import { describe, expect, it } from 'vitest';
import { judgeDrop, winningChances } from '../../src/chess/wc';
import { bestCapture, findHangs, staticExchange } from '../../src/chess/material';
import { legalDests, uciToSan } from '../../src/chess/rules';

describe('winning chances', () => {
  it('is 0 at equality and clamps at ±1000cp', () => {
    expect(winningChances({ cp: 0 })).toBe(0);
    expect(winningChances({ cp: 5000 })).toBe(winningChances({ cp: 1000 }));
    expect(winningChances({ mate: 3 })).toBeCloseTo(winningChances({ cp: 1000 }));
    expect(winningChances({ mate: -2 })).toBeCloseTo(winningChances({ cp: -1000 }));
  });
  it('judges drops with the Lichess thresholds', () => {
    expect(judgeDrop(0.5, 0.15)).toBe('blunder');
    expect(judgeDrop(0.5, 0.29)).toBe('mistake');
    expect(judgeDrop(0.5, 0.39)).toBe('inaccuracy');
    expect(judgeDrop(0.5, 0.45)).toBeNull();
  });
});

describe('static exchange', () => {
  it('wins a whole undefended knight', () => {
    expect(staticExchange('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1', 'e4d5')).toBe(3);
  });
  it('wins knight for pawn when the knight is defended', () => {
    expect(staticExchange('4k3/8/2p5/3n4/4P3/8/8/4K3 w - - 0 1', 'e4d5')).toBe(2);
  });
  it('loses the queen taking a pawn-defended rook', () => {
    expect(staticExchange('4k3/8/2p5/3r4/8/8/8/3QK3 w - - 0 1', 'd1d5')).toBe(-4);
  });
  it('finds the best capture', () => {
    expect(bestCapture('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1')).toEqual({ uci: 'e4d5', gain: 3, square: 'd5' });
    expect(bestCapture('4k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBeNull();
  });
});

describe('findHangs', () => {
  it('reports an undefended knight the opponent can take', () => {
    expect(findHangs('4k3/8/8/N2q4/8/8/8/4K3 b - - 0 1')).toEqual({ square: 'a5', value: 3 });
  });
  it('reports nothing when everything is defended', () => {
    expect(findHangs('4k3/8/8/N2q4/1P6/8/8/4K3 b - - 0 1')).toBeNull();
  });
});

describe('rules helpers', () => {
  it('converts special moves to SAN', () => {
    expect(uciToSan('8/P7/8/8/8/8/8/k6K w - - 0 1', 'a7a8q')).toBe('a8=Q+');
    expect(uciToSan('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1')).toBe('O-O');
    expect(uciToSan('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5d6')).toBe('exd6');
  });
  it('lists legal destinations per square', () => {
    const d = legalDests('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
    expect(d.get('e1')).toContain('g1');
    expect(d.get('h1')).toContain('h8');
  });
});
