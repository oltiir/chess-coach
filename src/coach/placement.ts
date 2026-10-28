import type { Placement } from './rating';

/** Stage A: 8 mixed puzzles served at the current estimate; the estimate moves by these steps after each answer. */
export const STAGE_A_STEPS = [200, 200, 150, 100, 75, 50, 50, 50];
export const PLACEMENT_START = 900;

/** Ratings to serve for stage A given the answers so far, the current estimate, and the stage B rating. */
export function placementTargets(answers: boolean[]) {
  const stageA: number[] = [];
  let theta = PLACEMENT_START;
  answers.slice(0, STAGE_A_STEPS.length).forEach((solved, i) => {
    stageA.push(theta);
    theta += solved ? STAGE_A_STEPS[i] : -STAGE_A_STEPS[i];
  });
  return { stageA, theta, stageB: theta - 150 };
}

/** Stage B: one puzzle per group at θ − 150; a miss puts the group at θ − 150, a solve at θ + 50. */
export function finishPlacement(theta: number, groupSolved: Record<string, boolean>, ts: number): Placement {
  return { ts, global: theta, groups: Object.fromEntries(Object.entries(groupSolved).map(([g, ok]) => [g, ok ? theta + 50 : theta - 150])) };
}
