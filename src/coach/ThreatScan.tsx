import { useState } from 'preact/hooks';
import { Chess, type Square } from 'chess.js';
import { Board } from '../chess/board';
import { PIECE_NAMES } from '../chess/names';
import { looseCaptures } from './drills';
import type { PuzzleResult } from './coach';

interface Props { fen: string; answer: string[]; onDone: (r: PuzzleResult) => void; onNext: () => void; aside?: preact.ComponentChildren; nextLabel?: string }

/** "Tap every piece of yours they can win." Trains the habit the player lacks: checking what's loose. */
export function ThreatScan({ fen, answer, onDone, onNext, aside, nextLabel = 'Next' }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [done, setDone] = useState<null | boolean>(null);
  const [start] = useState(Date.now());
  const color = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const pos = new Chess(fen);
  const mine = pos.turn();
  // Only my own pieces (not pawns or the king) can be picked, so stray taps don't count as wrong answers.
  const toggle = (sq: string) => {
    const p = pos.get(sq as Square);
    if (done !== null || !p || p.color !== mine || p.type === 'p' || p.type === 'k') return;
    setPicked((x) => (x.includes(sq) ? x.filter((y) => y !== sq) : [...x, sq]));
  };
  const caps = looseCaptures(fen);
  const flipped = (() => { const f = fen.split(' '); f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-'; return f.join(' '); })();
  const sanOf = (uci: string) => { try { return new Chess(flipped).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san; } catch { return uci; } };
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
      <Board fen={fen} orientation={color} movable={false} marks={marks} onSquare={toggle}
        arrows={done === null ? undefined : caps.map((c) => ({ from: c.uci.slice(0, 2), to: c.uci.slice(2, 4), color: 'red' as const }))} />
      <div class="solver-foot" aria-live="polite">
        {done === null ? (
          <>
            <p class="dim">It’s your move. If you passed, which of your pieces (not pawns) could they win — take it and come out ahead after the trades? Tap each one.</p>
            <div class="row">
              <button class="btn secondary" style="flex:1" onClick={() => check([])}>Nothing is loose</button>
              <button class="btn" style="flex:1" disabled={!picked.length} onClick={() => check(picked)}>Done ({picked.length})</button>
            </div>
          </>
        ) : (
          <>
            <p class={`msg ${done ? 'good' : 'bad'}`}>{done ? 'Spot on' : answer.length ? 'Not quite' : 'Nothing was loose here'}</p>
            <p class="reason">{caps.length
              ? `${caps.map((c) => `${sanOf(c.uci)} wins your ${PIECE_NAMES[pos.get(c.square as Square)!.type]}`).join('; ')} (green circle, red arrow). Before every move, ask: what can they take?`
              : 'Every piece was defended or safe. Checking takes seconds — keep doing it.'}</p>
            <button class="btn block" onClick={onNext}>{nextLabel}</button>
          </>
        )}
      </div>
    </div>
  );
}
