import { useState } from 'preact/hooks';
import { logAttempt } from '../store/attempts';
import type { Puzzle } from '../store/types';
import { PuzzleSolver, type PuzzleResult } from './PuzzleSolver';
import { stepOf } from './select';

interface Props { puzzles: Puzzle[]; step?: string; onFinish: (results: PuzzleResult[]) => void }

/** Runs a list of puzzles one after another and logs every attempt. */
export function PuzzleSet({ puzzles, step, onFinish }: Props) {
  const [i, setI] = useState(0);
  const [results, setResults] = useState<PuzzleResult[]>([]);
  const p = puzzles[i];
  const done = (r: PuzzleResult) => {
    setResults((rs) => [...rs, r]);
    void logAttempt({ kind: 'puzzle', itemId: p.id, ts: Date.now(), firstTry: r.firstTry, solved: r.solved, ms: r.ms, theme: stepOf(p, step), rating: p.rating });
  };
  const next = () => (i + 1 < puzzles.length ? setI(i + 1) : onFinish(results));
  return (
    <div>
      <p class="dim counter">{i + 1} / {puzzles.length}</p>
      <PuzzleSolver puzzle={p} onDone={done} onNext={next} nextLabel={i + 1 < puzzles.length ? 'Next' : 'Finish'} />
    </div>
  );
}
