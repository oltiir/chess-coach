import { useEffect, useRef, useState } from 'preact/hooks';
import { Board } from '../chess/board';
import { play, sideToMove } from '../chess/rules';
import type { Puzzle } from '../store/types';
import { reasonFor } from './reason';

export interface PuzzleResult { solved: boolean; firstTry: boolean; ms: number }
type Status = 'setup' | 'play' | 'retry' | 'revealed' | 'solved';

interface Props { puzzle: Puzzle; onDone: (r: PuzzleResult) => void; onNext?: () => void; nextLabel?: string }

export function PuzzleSolver({ puzzle, onDone, onNext, nextLabel = 'Next' }: Props) {
  const [fen, setFen] = useState(puzzle.fen);
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState<Status>('setup');
  const [last, setLast] = useState<[string, string] | undefined>();
  const [nonce, setNonce] = useState(0);
  const [reason, setReason] = useState('');
  const wrong = useRef(0);
  const start = useRef(0);
  const reported = useRef(false);
  const player = sideToMove(puzzle.fen) === 'w' ? 'black' : 'white';

  const begin = () => {
    setFen(puzzle.fen); setIdx(0); setStatus('setup'); setLast(undefined); setReason('');
    const t = setTimeout(() => {
      const after = play(puzzle.fen, puzzle.moves[0])!;
      setFen(after.fen()); setLast([puzzle.moves[0].slice(0, 2), puzzle.moves[0].slice(2, 4)]);
      setIdx(1); setStatus('play'); start.current = Date.now();
    }, 600);
    return () => clearTimeout(t);
  };

  useEffect(() => { wrong.current = 0; reported.current = false; return begin(); }, [puzzle.id]);

  const report = (r: PuzzleResult) => { if (!reported.current) { reported.current = true; onDone(r); } };

  const reveal = () => {
    const best = puzzle.moves[idx];
    setReason(reasonFor(puzzle, fen, best));
    setStatus('revealed');
    report({ solved: false, firstTry: false, ms: Date.now() - start.current });
  };

  const onMove = (uci: string) => {
    if (status !== 'play' && status !== 'retry') return;
    const expected = puzzle.moves[idx];
    const after = play(fen, uci);
    if (!after) return;
    if (uci === expected || after.isCheckmate()) {
      const keyMove = puzzle.moves[1];
      setFen(after.fen()); setLast([uci.slice(0, 2), uci.slice(2, 4)]);
      if (idx + 1 >= puzzle.moves.length || after.isCheckmate()) {
        setReason(reasonFor(puzzle, play(puzzle.fen, puzzle.moves[0])!.fen(), idx === 1 ? uci : keyMove));
        setStatus('solved');
        report({ solved: true, firstTry: wrong.current === 0, ms: Date.now() - start.current });
        return;
      }
      setStatus('play');
      const reply = puzzle.moves[idx + 1];
      setTimeout(() => {
        setFen(play(after.fen(), reply)!.fen()); setLast([reply.slice(0, 2), reply.slice(2, 4)]); setIdx(idx + 2);
      }, 350);
      return;
    }
    wrong.current++;
    setNonce((n) => n + 1);
    if (wrong.current >= 2) reveal(); else setStatus('retry');
  };

  const best = puzzle.moves[idx];
  return (
    <div class="solver" data-puzzle-id={puzzle.id}>
      <div class="solver-head">
        <span class={`turn-dot ${player}`} aria-hidden="true" />
        <span>{player === 'white' ? 'White' : 'Black'} to move</span>
      </div>
      <Board
        fen={fen}
        orientation={player}
        movable={status === 'play' || status === 'retry'}
        onMove={onMove}
        lastMove={last}
        nonce={nonce}
        arrows={status === 'revealed' && best ? [{ from: best.slice(0, 2), to: best.slice(2, 4) }] : undefined}
      />
      <div class="solver-foot" aria-live="polite">
        {status === 'setup' && <p class="dim">Watch their move…</p>}
        {status === 'play' && <p class="dim">Find the best move.</p>}
        {status === 'retry' && (
          <div class="row between">
            <p class="msg bad">Not quite — try again</p>
            <button class="btn ghost" onClick={reveal}>Show me</button>
          </div>
        )}
        {(status === 'solved' || status === 'revealed') && (
          <>
            <p class={`msg ${status === 'solved' ? 'good' : ''}`}>
              {status === 'solved' ? (wrong.current === 0 ? 'Solved first try' : 'Solved') : 'Here’s the move'}
            </p>
            <p class="reason">{reason}</p>
            <div class="row">
              <button class="btn secondary" onClick={() => { wrong.current = Math.max(wrong.current, 0); begin(); }}>Replay</button>
              {onNext && <button class="btn" style="flex:1" onClick={onNext}>{nextLabel}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
