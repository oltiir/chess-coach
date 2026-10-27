import { useEffect, useRef, useState } from 'preact/hooks';
import { Board, type Arrow } from '../chess/board';
import { play, uciToSan } from '../chess/rules';
import { getEngine } from '../engine/client';
import type { PuzzleResult } from '../puzzles/PuzzleSolver';
import type { Drill } from '../store/types';
import { acceptMove, playerColor } from './makeDrills';

type Status = 'play' | 'checking' | 'retry' | 'good' | 'revealed';

interface Props { drill: Drill; onDone: (r: PuzzleResult) => void; onNext: () => void; aside?: preact.ComponentChildren; nextLabel?: string }

const arrow = (uci: string, color: Arrow['color']): Arrow => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), color });

/** "Find a better move" in a position from one of your own games. Nothing is revealed before you try. */
export function DrillSolver({ drill, onDone, onNext, aside, nextLabel = 'Next' }: Props) {
  const [status, setStatus] = useState<Status>('play');
  const [fen, setFen] = useState(drill.fen);
  const [nonce, setNonce] = useState(0);
  const [mine, setMine] = useState<string | null>(null);
  const wrong = useRef(0);
  const start = useRef(Date.now());
  const reported = useRef(false);
  const color = playerColor(drill.fen);

  useEffect(() => { setStatus('play'); setFen(drill.fen); wrong.current = 0; reported.current = false; start.current = Date.now(); }, [drill.id]);

  const report = (r: PuzzleResult) => { if (!reported.current) { reported.current = true; onDone(r); } };
  const reveal = () => { setFen(drill.fen); setNonce((n) => n + 1); setStatus('revealed'); report({ solved: false, firstTry: false, ms: Date.now() - start.current }); };

  const onMove = async (uci: string) => {
    if (status !== 'play' && status !== 'retry') return;
    const after = play(drill.fen, uci);
    if (!after) return;
    setFen(after.fen());
    setStatus('checking');
    const ok = await acceptMove(drill, uci, getEngine());
    if (ok) {
      setMine(uci);
      setStatus('good');
      report({ solved: true, firstTry: wrong.current === 0, ms: Date.now() - start.current });
      return;
    }
    wrong.current++;
    setFen(drill.fen);
    setNonce((n) => n + 1);
    if (wrong.current >= 2) reveal(); else setStatus('retry');
  };

  const done = status === 'good' || status === 'revealed';
  const arrows = done ? [arrow(drill.played, 'red'), ...(status === 'revealed' || mine !== drill.best ? [arrow(drill.best, 'green')] : [])] : undefined;
  return (
    <div class="solver drill" data-drill-id={drill.id}>
      <div class="solver-head">
        <span class={`turn-dot ${color}`} aria-hidden="true" />
        <span>Your game {drill.context}</span>
        {aside && <span class="aside">{aside}</span>}
      </div>
      <Board fen={fen} orientation={color} movable={status === 'play' || status === 'retry'} onMove={(u) => void onMove(u)} nonce={nonce} arrows={arrows} />
      <div class="solver-foot" aria-live="polite">
        {status === 'play' && <p class="dim">You went wrong here. Find a better move.</p>}
        {status === 'checking' && <p class="dim">Checking…</p>}
        {status === 'retry' && (
          <div class="row between">
            <p class="msg bad">Not quite — try again</p>
            <button class="btn secondary small" onClick={reveal}>Show me</button>
          </div>
        )}
        {done && (
          <>
            <p class={`msg ${status === 'good' ? 'good' : ''}`}>{status === 'good' ? 'That’s better' : 'Here’s a better move'}</p>
            <p class="reason">
              In the game you played {uciToSan(drill.fen, drill.played)}. {drill.explanation}
            </p>
            <button class="btn block" onClick={onNext}>{nextLabel}</button>
          </>
        )}
      </div>
    </div>
  );
}
