import { describe, expect, it } from 'vitest';
import type { Attempt } from '../../src/store/types';
import { dueItems } from '../../src/puzzles/schedule';

const DAY = 86_400_000;
const att = (itemId: string, firstTry: boolean, theme: string, ts: number): Attempt =>
  ({ id: `${itemId}-${ts}`, kind: 'puzzle', itemId, ts, firstTry, solved: true, ms: 5000, device: 'd', theme });

describe('repeat schedule with a speed gate', () => {
  const t = (id: string, firstTry: boolean, ts: number, firstMoveMs = 4000) => ({ ...att(id, firstTry, 'fork', ts), firstMoveMs });
  it('a miss is due after 1 day, then 3 and 7 days after fast clean solves, and retires after a fast clean solve at 7 days', () => {
    const a1 = t('x', false, 0);
    expect(dueItems([a1], DAY - 1)).toEqual([]);
    expect(dueItems([a1], DAY)).toEqual([{ kind: 'puzzle', itemId: 'x' }]);
    const a2 = t('x', true, DAY);
    expect(dueItems([a1, a2], 4 * DAY - 1)).toEqual([]);
    expect(dueItems([a1, a2], 4 * DAY)).toHaveLength(1);
    const a3 = t('x', true, 4 * DAY);
    expect(dueItems([a1, a2, a3], 11 * DAY - 1)).toEqual([]);
    expect(dueItems([a1, a2, a3], 11 * DAY)).toHaveLength(1);
    const a4 = t('x', true, 11 * DAY);
    expect(dueItems([a1, a2, a3, a4], 400 * DAY)).toEqual([]);
  });
  it('a slow clean solve repeats the same interval', () => {
    const list = [t('s', false, 0), t('s', true, DAY, 25_000)];
    expect(dueItems(list, 2 * DAY)).toHaveLength(1);
  });
  it('a miss during review restarts the schedule', () => {
    const list = [t('y', false, 0), t('y', true, DAY), t('y', false, 4 * DAY)];
    expect(dueItems(list, 5 * DAY)).toHaveLength(1);
  });
  it('items solved first try the first time never come back', () => {
    expect(dueItems([t('z', true, 0)], 100 * DAY)).toEqual([]);
  });
});

