import { useState } from 'preact/hooks';
import { Board } from '../chess/board';
import type { PuzzleResult } from './coach';

interface Props { fen: string; answer: string[]; onDone: (r: PuzzleResult) => void; onNext: () => void; aside?: preact.ComponentChildren; nextLabel?: string }

/** "Tap every piece of yours they can win." Trains the habit the player lacks: checking what's loose. */
export function ThreatScan({ fen, answer, onDone, onNext, aside, nextLabel = 'Next' }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [done, setDone] = useState<null | boolean>(null);
  const [start] = useState(Date.now());
  const color = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const toggle = (sq: string) => { if (done === null) setPicked((p) => (p.includes(sq) ? p.filter((x) => x !== sq) : [...p, sq])); };
  const check = (claim: string[]) => {
    const ok = claim.length === answer.length && claim.every((s) => answer.includes(s));
    setPicked(claim); setDone(ok);
    onDone({ solved: ok, firstTry: ok, ms: Date.now() - start, firstMoveMs: Date.now() - start });
  };
  const marks = done === null
    ? picked.map((s) => ({ square: s, color: 'blue' as const }))
    : [...answer.map((s) => ({ square: s, color: 'green' as const })), ...picked.filter((s) => !answer.includes(s)).map((s) => ({ square: s, color: 'red' as const }))];
  return (
    <div class="solver threat-scan">
      <div class="solver-head"><span class={`turn-dot ${color}`} aria-hidden="true" /><span>Threat scan</span>{aside && <span class="aside">{aside}</span>}</div>
      <Board fen={fen} orientation={color} movable={false} marks={marks} onSquare={toggle} />
      <div class="solver-foot" aria-live="polite">
        {done === null ? (
          <>
            <p class="dim">Tap every piece of yours they could win right now. Your move hasn’t been played yet.</p>
            <div class="row">
              <button class="btn secondary" style="flex:1" onClick={() => check([])}>Nothing is loose</button>
              <button class="btn" style="flex:1" disabled={!picked.length} onClick={() => check(picked)}>Done ({picked.length})</button>
            </div>
          </>
        ) : (
          <>
            <p class={`msg ${done ? 'good' : 'bad'}`}>{done ? 'Spot on' : answer.length ? 'Not quite' : 'Nothing was loose here'}</p>
            <p class="reason">{answer.length ? `Loose: ${answer.join(', ')} (green). Before every move, ask: what can they take?` : 'Every piece was defended or safe. Checking takes seconds — keep doing it.'}</p>
            <button class="btn block" onClick={onNext}>{nextLabel}</button>
          </>
        )}
      </div>
    </div>
  );
}
