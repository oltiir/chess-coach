import { describe, expect, it } from 'vitest';
import { looseSquares, isSafe, makeSafeOrNot, makeThreatScan } from '../../src/coach/drills';

describe('threat scan', () => {
  it('finds my undefended knight the queen can take', () => {
    expect(looseSquares('4k3/8/8/N2q4/8/8/8/4K3 w - - 0 1')).toEqual(['a5']);
  });
  it('a defended knight is not loose', () => {
    expect(looseSquares('4k3/8/8/N2q4/1P6/8/8/4K3 w - - 0 1')).toEqual([]);
  });
  it('finds several loose pieces', () => {
    // queen d5 attacks a5 knight and (via the long diagonal) the h1 rook
    expect(looseSquares('4k3/8/8/N2q4/8/8/8/4K2R w - - 0 1').sort()).toEqual(['a5', 'h1']);
  });
  it('builds an item with the answer set', () => {
    expect(makeThreatScan('4k3/8/8/N2q4/8/8/8/4K3 w - - 0 1')).toEqual({ fen: '4k3/8/8/N2q4/8/8/8/4K3 w - - 0 1', answer: ['a5'] });
  });
});

describe('safe or not', () => {
  it('a knight move into the queen’s line is unsafe; a quiet one is safe', () => {
    expect(isSafe('4k3/8/8/3q4/8/8/8/N3K3 w - - 0 1', 'a1b3')).toBe(false);
    expect(isSafe('4k3/8/8/3q4/8/8/8/N3K3 w - - 0 1', 'a1c2')).toBe(true);
  });
  it('a capture that only trades is safe', () => {
    expect(isSafe('4k3/8/2p5/3n4/4P3/8/8/4K3 w - - 0 1', 'e4d5')).toBe(true);
  });
  it('makes a balanced item when both kinds of move exist', () => {
    const rnd = (() => { let i = 0; return () => ((i++ * 0.37) % 1); })();
    const unsafe = makeSafeOrNot('4k3/8/8/3q4/8/8/8/N3K3 w - - 0 1', false, rnd)!;
    expect(isSafe(unsafe.fen, unsafe.move)).toBe(false);
    expect(unsafe.safe).toBe(false);
    const safe = makeSafeOrNot('4k3/8/8/3q4/8/8/8/N3K3 w - - 0 1', true, rnd)!;
    expect(safe.safe).toBe(true);
  });
});
