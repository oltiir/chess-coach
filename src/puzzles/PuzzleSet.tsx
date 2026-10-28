import { useState } from 'preact/hooks';
import { logPuzzle } from '../coach/coach';
import type { Puzzle } from '../store/types';
import { PuzzleSolver, type PuzzleResult } from './PuzzleSolver';

interface Props { puzzles: { puzzle: Puzzle; group: string }[]; onFinish: (results: PuzzleResult[]) => void }

/** Runs a list of puzzles one after another and logs every rated attempt. */
export function PuzzleSet({ puzzles, onFinish }: Props) {
  const [i, setI] = useState(0);
  const [results, setResults] = useState<PuzzleResult[]>([]);
  const { puzzle: p, group } = puzzles[i];
  const done = (r: PuzzleResult) => { setResults((rs) => [...rs, r]); void logPuzzle(p, r, group); };
  const next = () => (i + 1 < puzzles.length ? setI(i + 1) : onFinish(results));
  return (
    <div>
      <PuzzleSolver key={p.id} puzzle={p} onDone={done} onNext={next} nextLabel={i + 1 < puzzles.length ? 'Next' : 'Finish'}
        aside={<><span class="dim counter">{i + 1} / {puzzles.length}</span><button class="btn secondary small" onClick={() => onFinish(results)}>Stop</button></>} />
    </div>
  );
}
