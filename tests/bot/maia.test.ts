import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';
import { MOVE_VOCAB, boardToTokens, moveIndex } from '../../src/bot/maiaTokens';
import { MaiaBot } from '../../src/bot/maia';

describe('Maia tokens', () => {
  it('has the 4352-move vocabulary with no duplicates', () => {
    expect(MOVE_VOCAB).toHaveLength(4352);
    expect(new Set(MOVE_VOCAB).size).toBe(4352);
    expect(MOVE_VOCAB[0]).toBe('a1a1');
    expect(MOVE_VOCAB[1]).toBe('a1b1');
    expect(MOVE_VOCAB[4096]).toBe('a7a8q');
  });
  it('puts 32 pieces on the start board', () => {
    expect(boardToTokens(new Chess().fen()).reduce((a, b) => a + b, 0)).toBe(32);
  });
  it('mirrors the board for black: after 1.e4 black sees the same picture as white after a mirrored 1...e5', () => {
    const black = boardToTokens(new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1').fen());
    const white = boardToTokens('rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect([...black]).toEqual([...white]);
  });
  it('maps every legal move to a valid index, mirrored for black', () => {
    const fens = [new Chess().fen(), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', '8/P7/8/8/8/8/1p6/k6K b - - 0 1'];
    for (const f of fens) for (const m of new Chess(f).moves({ verbose: true })) {
      const i = moveIndex(m.from + m.to + (m.promotion ?? ''), new Chess(f).turn() === 'b');
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(4352);
    }
    expect(MOVE_VOCAB[moveIndex('e7e5', true)]).toBe('e2e4');
    expect(MOVE_VOCAB[moveIndex('b2b1q', true)]).toBe('b7b8q');
  });
});

describe('MaiaBot with the real model (node)', () => {
  const load = () => MaiaBot.load(readFileSync('public/models/maia3-5m.fp16.onnx'));
  it('plays a normal opening move at 1100', async () => {
    const bot = await load();
    const top = await bot.topMoves(new Chess().fen(), 1100, 1100, 3);
    expect(top.some((m) => m === 'e2e4' || m === 'd2d4')).toBe(true);
  }, 60_000);
  it('always returns a legal move', async () => {
    const bot = await load();
    const c = new Chess();
    for (let i = 0; i < 30 && !c.isGameOver(); i++) {
      const uci = await bot.chooseMove(c.fen(), 700, 600);
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    }
  }, 60_000);
});
