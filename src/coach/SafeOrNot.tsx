import { useEffect, useRef, useState } from 'preact/hooks';
import { Board } from '../chess/board';
import { uciToSan } from '../chess/rules';
import { findHangs } from '../chess/material';
import { play } from '../chess/rules';
import { kvGet, kvSet } from '../store/db';
import type { PuzzleResult } from './coach';
import type { SafeItem } from './drills';

interface Props { items: SafeItem[]; onDone: (r: PuzzleResult) => void; onNext: () => void; aside?: preact.ComponentChildren; nextLabel?: string }

/** Five quick calls: is this move safe? A binary task, kept near 85% correct by shrinking the timer. */
export function SafeOrNot({ items, onDone, onNext, aside, nextLabel = 'Next' }: Props) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [shown, setShown] = useState<null | boolean>(null);
  const [limit, setLimit] = useState(8);
  const [left, setLeft] = useState(8);
  const t0 = useRef(Date.now());
  const start = useRef(Date.now());
  useEffect(() => { void kvGet<number>('safe-timer').then((s) => { setLimit(s ?? 8); setLeft(s ?? 8); }); }, []);
  useEffect(() => {
    if (shown !== null) return;
    t0.current = Date.now();
    setLeft(limit);
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 0.1)), 100);
    return () => clearInterval(t);
  }, [i, shown, limit]);

  const item = items[i];
  const color = item.fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const answer = async (saysSafe: boolean) => {
    const ok = saysSafe === item.safe && left > 0;
    const next = [...answers, ok];
    setAnswers(next); setShown(ok);
    const hist = [...((await kvGet<boolean[]>('safe-history')) ?? []), ok].slice(-20);
    await kvSet('safe-history', hist);
    const last10 = hist.slice(-10);
    if (last10.length === 10) {
      const rate = last10.filter(Boolean).length / 10;
      const nl = rate > 0.9 ? Math.max(4, limit - 1) : rate < 0.75 ? Math.min(10, limit + 1) : limit;
      if (nl !== limit) { await kvSet('safe-timer', nl); await kvSet('safe-history', []); }
    }
    if (next.length === items.length) {
      const right = next.filter(Boolean).length;
      onDone({ solved: right >= items.length - 1, firstTry: right === items.length, ms: Date.now() - start.current, firstMoveMs: (Date.now() - start.current) / items.length });
    }
  };
  const after = play(item.fen, item.move);
  const hung = !item.safe && after ? findHangs(after.fen())?.square : undefined;
  const finished = answers.length === items.length && shown !== null;
  return (
    <div class="solver safe-or-not">
      <div class="solver-head"><span class={`turn-dot ${color}`} aria-hidden="true" /><span>Safe or not? {Math.min(i + 1, items.length)}/{items.length}</span>{aside && <span class="aside">{aside}</span>}</div>
      <Board fen={shown !== null && after ? after.fen() : item.fen} orientation={color} movable={false}
        arrows={shown === null ? [{ from: item.move.slice(0, 2), to: item.move.slice(2, 4), color: 'blue' }] : undefined}
        lastMove={shown !== null ? [item.move.slice(0, 2), item.move.slice(2, 4)] : undefined} highlight={shown !== null ? hung : undefined} />
      <div class="solver-foot" aria-live="polite">
        {shown === null ? (
          <>
            <div class="timer" aria-hidden="true"><span style={{ width: `${(left / limit) * 100}%` }} /></div>
            <p>Is <strong>{uciToSan(item.fen, item.move)}</strong> safe? {left === 0 && <span class="bad">Time’s up — answer anyway.</span>}</p>
            <div class="row">
              <button class="btn secondary" style="flex:1" onClick={() => void answer(false)}>Not safe</button>
              <button class="btn" style="flex:1" onClick={() => void answer(true)}>Safe</button>
            </div>
          </>
        ) : (
          <>
            <p class={`msg ${shown ? 'good' : 'bad'}`}>{shown ? 'Right' : 'Wrong'} — it’s {item.safe ? 'safe' : 'not safe'}</p>
            <p class="reason">{item.safe ? 'Nothing of yours can be won after it.' : `After it, the piece on ${hung} can be won (red).`}</p>
            {finished
              ? <button class="btn block" onClick={onNext}>{nextLabel} · {answers.filter(Boolean).length}/{items.length} right</button>
              : <button class="btn block" onClick={() => { setI(i + 1); setShown(null); }}>Next position</button>}
          </>
        )}
      </div>
    </div>
  );
}
