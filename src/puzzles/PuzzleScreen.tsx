import { useEffect, useState } from 'preact/hooks';
import { puzzlesReady } from '../boot';
import { allAttempts, logAttempt } from '../store/attempts';
import { openDb } from '../store/db';
import { getSettings } from '../store/exportImport';
import type { Attempt, Puzzle } from '../store/types';
import { LADDER, themeStatus } from './ladder';
import { PuzzleSet } from './PuzzleSet';
import { PuzzleSolver, type PuzzleResult } from './PuzzleSolver';
import { pickNewPuzzles, stepOf } from './select';

export function PuzzleScreen({ puzzleId }: { puzzleId?: string }) {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [set, setSet] = useState<{ puzzles: Puzzle[]; step?: string } | null>(null);
  const [single, setSingle] = useState<Puzzle | null>(null);
  const [summary, setSummary] = useState<PuzzleResult[] | null>(null);

  const refresh = async () => { await puzzlesReady; setAttempts(await allAttempts()); };
  useEffect(() => { void refresh(); }, [set, summary]);
  useEffect(() => {
    if (!puzzleId) { setSingle(null); return; }
    void puzzlesReady.then(async () => setSingle((await (await openDb()).get('puzzles', puzzleId)) ?? null));
  }, [puzzleId]);

  const start = async (step?: string) => {
    const s = await getSettings();
    const puzzles = await pickNewPuzzles(await openDb(), 10, attempts ?? [], s.puzzleSeed, step);
    setSummary(null);
    setSet({ puzzles, step });
  };

  if (single)
    return (
      <PuzzleSolver
        puzzle={single}
        onDone={(r) => void logAttempt({ kind: 'puzzle', itemId: single.id, ts: Date.now(), ...r, theme: stepOf(single), rating: single.rating })}
        onNext={() => { location.hash = '#/puzzles'; }}
        nextLabel="More puzzles"
      />
    );
  if (set && set.puzzles.length)
    return <PuzzleSet puzzles={set.puzzles} step={set.step} onFinish={(r) => { setSet(null); setSummary(r); }} />;
  if (!attempts) return <p class="dim">Getting puzzles ready…</p>;

  const st = themeStatus(attempts);
  return (
    <div class="stack">
      {summary && (
        <div class="card">
          <h2>Set done</h2>
          <p>{summary.filter((r) => r.firstTry).length} of {summary.length} first try. The ones you missed come back tomorrow.</p>
        </div>
      )}
      <div class="card">
        <p class="dim" style="margin:0 0 4px">Working on</p>
        <h2>{LADDER.find((s) => s.key === st.current)!.label}</h2>
        <button class="btn block" onClick={() => void start()}>Start 10 puzzles</button>
      </div>
      <h2 style="margin-top:20px">Your path</h2>
      <ol class="ladder">
        {LADDER.map((s) => {
          const open = st.unlocked.includes(s.key);
          const done = st.mastered.includes(s.key);
          const acc = st.accuracy[s.key];
          return (
            <li class={`ladder-step ${open ? '' : 'locked'} ${done ? 'done' : ''}`} key={s.key}>
              <span class="ladder-mark" aria-hidden="true">{done ? '✓' : open ? '•' : ''}</span>
              <span class="ladder-label">
                {s.label}
                <small class="dim">{done ? 'Mastered' : open ? (acc !== undefined ? `${Math.round(acc * 100)}% first try` : 'Not started') : 'Locked'}</small>
              </span>
              {open && <button class="btn secondary small" onClick={() => void start(s.key)}>Practise</button>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
