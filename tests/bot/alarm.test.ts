import { afterAll, describe, expect, it } from 'vitest';
import { checkMove } from '../../src/bot/alarm';
import { nodeEngine } from '../analysis/sf';

const engine = nodeEngine();
afterAll(() => engine.terminate());
const FEN = 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3';

describe('blunder alarm', () => {
  it('stops a move that hangs a knight', async () => {
    expect(await checkMove(FEN, 'f3g5', engine)).toEqual({ alarm: true, reason: 'hang' });
  }, 30_000);
  it('lets a normal developing move through', async () => {
    expect(await checkMove(FEN, 'b1c3', engine)).toEqual({ alarm: false, reason: null });
  }, 30_000);
  it('stops a move that walks into mate', async () => {
    // Black to move; ...g5?? allows Qh5#
    expect((await checkMove('rnbqkbnr/ppppp2p/5p2/6p1/4P3/3P4/PPP2PPP/RNBQKBNR b KQkq - 0 3', 'h7h6', engine)).alarm).toBe(true);
  }, 30_000);
});
