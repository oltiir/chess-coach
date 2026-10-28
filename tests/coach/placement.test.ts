import { describe, expect, it } from 'vitest';
import { STAGE_A_STEPS, placementTargets, finishPlacement } from '../../src/coach/placement';

describe('placement', () => {
  it('stage A walks the rating up or down with shrinking steps, starting at 900', () => {
    const answers = [true, true, false, true, false, true, true, false];
    const t = placementTargets(answers);
    expect(t.stageA).toEqual([900, 1100, 1300, 1150, 1250, 1175, 1225, 1275]);
    expect(t.theta).toBe(1225);
    expect(STAGE_A_STEPS).toEqual([200, 200, 150, 100, 75, 50, 50, 50]);
  });
  it('stage B serves each group at θ−150 and sets the group from the answer', () => {
    const p = finishPlacement(1225, { defence: false, pins: true }, 42);
    expect(p).toEqual({ ts: 42, global: 1225, groups: { defence: 1075, pins: 1275 } });
    expect(placementTargets([true]).stageB).toBe(placementTargets([true]).theta - 150);
  });
});
