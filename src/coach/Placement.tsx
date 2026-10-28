import { useEffect, useState } from 'preact/hooks';
import { PuzzleSolver } from '../puzzles/PuzzleSolver';
import { kvSet, openDb } from '../store/db';
import type { Puzzle } from '../store/types';
import { logPuzzle } from './coach';
import { GROUPS, groupLabel } from './groups';
import { finishPlacement, placementTargets, STAGE_A_STEPS } from './placement';
import { pickPuzzle } from './plan';

const A = STAGE_A_STEPS.length;
const TOTAL = A + GROUPS.length;
const near = (target: number) => target + 245; // pickPuzzle's window [r-300, r-190] centred on target

/** 16 puzzles, themes hidden: 8 to find the overall level, then one per group to place each theme. */
export function Placement({ onFinish }: { onFinish: () => void }) {
  const [answersA, setAnswersA] = useState<boolean[]>([]);
  const [groupSolved, setGroupSolved] = useState<Record<string, boolean>>({});
  const [puzzle, setPuzzle] = useState<{ p: Puzzle; group: string } | null>(null);
  const [seen] = useState(new Set<string>());
  const [result, setResult] = useState<ReturnType<typeof finishPlacement> | null>(null);
  const [pending, setPending] = useState<ReturnType<typeof finishPlacement> | null>(null); // shown after the last Next
  const n = answersA.length + Object.keys(groupSolved).length;

  useEffect(() => {
    if (n >= TOTAL) return;
    void (async () => {
      const db = await openDb();
      const { theta, stageB } = placementTargets(answersA);
      const group = n < A ? GROUPS[(n * 3) % GROUPS.length].key : GROUPS[n - A].key;
      const p = await pickPuzzle(db, group, near(n < A ? theta : stageB), seen);
      if (p) { seen.add(p.id); setPuzzle({ p, group }); }
    })();
  }, [n]);

  const done = async (solved: boolean) => {
    if (!puzzle) return;
    if (n < A) setAnswersA([...answersA, solved]);
    else {
      const next = { ...groupSolved, [puzzle.group]: solved };
      setGroupSolved(next);
      if (Object.keys(next).length === GROUPS.length) {
        const p = finishPlacement(placementTargets(answersA).theta, next, Date.now());
        await kvSet('placement', p);
        setPending(p);
      }
    }
  };

  if (result) {
    const sorted = Object.entries(result.groups).sort((a, b) => b[1] - a[1]);
    return (
      <div class="card stack">
        <h2>Your level: {Math.round(result.global)}</h2>
        <p style="margin:0">Strongest: <strong>{groupLabel(sorted[0][0])}</strong> · Weakest: <strong>{groupLabel(sorted[sorted.length - 1][0])}</strong></p>
        <p class="dim" style="margin:0">From now on every puzzle is picked so you solve about 4 in 5 first try — hard enough to stretch you, never a waste of time. Your level moves after every puzzle.</p>
        <button class="btn block" onClick={onFinish}>Build today’s session</button>
      </div>
    );
  }
  if (!puzzle) return <p class="dim">Finding your next placement puzzle…</p>;
  return (
    <div>
      <div class="progress-track" aria-hidden="true"><span style={{ width: `${(n / TOTAL) * 100}%` }} /></div>
      <PuzzleSolver key={puzzle.p.id} puzzle={puzzle.p} hideReason
        onDone={(r) => { void logPuzzle(puzzle.p, r, puzzle.group); void done(r.firstTry); }}
        onNext={() => (pending ? setResult(pending) : setPuzzle(null))}
        aside={<span class="dim counter placement-progress">Placement {n + 1} / {TOTAL}</span>} />
    </div>
  );
}
