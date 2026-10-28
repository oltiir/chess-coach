import { useEffect, useRef, useState } from 'preact/hooks';
import { puzzlesReady } from '../boot';
import { coachState, logPuzzle, nextPuzzles } from '../coach/coach';
import { GROUPS } from '../coach/groups';
import type { Ratings } from '../coach/rating';
import { openDb } from '../store/db';
import type { Puzzle } from '../store/types';
import { PuzzleSet } from './PuzzleSet';
import { PuzzleSolver, type PuzzleResult } from './PuzzleSolver';

export function PuzzleScreen({ puzzleId }: { puzzleId?: string }) {
  const [state, setState] = useState<{ ratings: Ratings; weights: Record<string, number> } | null>(null);
  const [set, setSet] = useState<{ puzzle: Puzzle; group: string }[] | null>(null);
  const [single, setSingle] = useState<Puzzle | null>(null);
  const [summary, setSummary] = useState<{ results: PuzzleResult[]; before: number } | null>(null);
  const before = useRef(0); // puzzle rating when the set started

  const refresh = async () => { await puzzlesReady; setState(await coachState()); };
  useEffect(() => { void refresh(); }, [set, summary]);
  useEffect(() => {
    if (!puzzleId) { setSingle(null); return; }
    void puzzlesReady.then(async () => setSingle((await (await openDb()).get('puzzles', puzzleId)) ?? null));
  }, [puzzleId]);

  const start = async (group?: string) => {
    setSummary(null);
    before.current = state?.ratings.global.r ?? 0;
    setSet(await nextPuzzles(10, group));
  };

  if (single)
    return <PuzzleSolver puzzle={single} onDone={(r) => void logPuzzle(single, r)} onNext={() => { location.hash = '#/puzzles'; }} nextLabel="More puzzles" />;
  if (set?.length)
    return <PuzzleSet puzzles={set} onFinish={(r) => { setSet(null); setSummary({ results: r, before: before.current }); }} />;
  if (!state) return <p class="dim">Getting puzzles ready…</p>;

  const { ratings, weights } = state;
  const top = Object.entries(weights).sort((a, b) => b[1] - a[1])[0][0];
  const delta = summary ? Math.round(ratings.global.r - summary.before) : 0;
  return (
    <div class="stack">
      {summary && (
        <div class="card">
          <h2>Set done</h2>
          <p style="margin:0">{summary.results.filter((r) => r.firstTry).length} of {summary.results.length} first try · puzzle rating {delta >= 0 ? '+' : ''}{delta}. Missed ones come back tomorrow.</p>
        </div>
      )}
      <div class="card">
        <p class="dim" style="margin:0 0 4px">Puzzle rating</p>
        <h2 class="hero-title" style="margin:0 0 8px">{Math.round(ratings.global.r)}{!ratings.placed && <span class="dim" style="font-size:15px; font-weight:400"> · placement on Today</span>}</h2>
        <p class="dim small-print">10 puzzles mixed by your weak spots, themes hidden, about 4 in 5 solvable first try.</p>
        <button class="btn block" onClick={() => void start()}>Start 10 puzzles</button>
      </div>
      <section class="card">
        <h2>By theme</h2>
        <p class="dim small-print" style="margin-top:-4px">Practise one theme on purpose. “Focus” marks where your games say you lose most.</p>
        {GROUPS.map((g) => {
          const s = ratings.groups[g.key];
          return (
            <div class="group-row" key={g.key}>
              <span class="name">{g.label}<small>{g.key === top ? 'Focus' : ''}</small></span>
              <span class="group-rating">{Math.round(s.r)}<small>±{Math.round(s.rd * 2)}</small></span>
              <button class="btn secondary small" onClick={() => void start(g.key)}>Practise</button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
