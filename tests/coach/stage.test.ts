import { describe, expect, it } from 'vitest';
import { nextStage } from '../../src/coach/stage';

describe('alarm stages fade with performance', () => {
  it('moves up after 2 clean games in a row (0 hangs, at most 1 alarm/flag)', () => {
    let s = { stage: 0, good: 0 };
    s = nextStage(s, { hangs: 0, helps: 1 });
    expect(s).toEqual({ stage: 0, good: 1 });
    s = nextStage(s, { hangs: 0, helps: 0 });
    expect(s).toEqual({ stage: 1, good: 0 });
  });
  it('a game with hangs resets the run; 3+ hangs drops a stage', () => {
    expect(nextStage({ stage: 1, good: 1 }, { hangs: 1, helps: 0 })).toEqual({ stage: 1, good: 0 });
    expect(nextStage({ stage: 2, good: 0 }, { hangs: 3, helps: 0 })).toEqual({ stage: 1, good: 0 });
    expect(nextStage({ stage: 0, good: 0 }, { hangs: 5, helps: 4 })).toEqual({ stage: 0, good: 0 });
  });
  it('tops out at stage 2', () => {
    expect(nextStage({ stage: 2, good: 1 }, { hangs: 0, helps: 0 })).toEqual({ stage: 2, good: 0 });
  });
});
