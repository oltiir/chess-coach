import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './board.css';
import { Chess } from 'chess.js';
import { isPromotion, legalDests } from './rules';

export interface Arrow { from: string; to: string; color?: 'green' | 'red' | 'blue' }

interface Props {
  fen: string;
  orientation: 'white' | 'black';
  movable: boolean;
  onMove?: (uci: string) => void;
  lastMove?: [string, string];
  arrows?: Arrow[];
  highlight?: string; // square to mark, e.g. a hung piece
  nonce?: number; // bump to force the board back to `fen` (e.g. after a rejected move)
}

const brushes = { green: 'green', red: 'red', blue: 'blue' } as const;

export function Board({ fen, orientation, movable, onMove, lastMove, arrows, highlight, nonce }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [reset, setReset] = useState(0); // re-applies the whole position (pieces, turn, legal moves)
  const cb = useRef(onMove);
  cb.current = onMove;

  useLayoutEffect(() => {
    api.current = Chessground(el.current!, {
      fen, // start on the real position so pieces don't fly in from the opening setup
      orientation,
      animation: { duration: 180 },
      highlight: { lastMove: true, check: true },
      draggable: { showGhost: true },
      premovable: { enabled: false },
    });
    return () => api.current?.destroy();
  }, []);

  useLayoutEffect(() => {
    const c = new Chess(fen);
    const turn = c.turn() === 'w' ? 'white' : 'black';
    const shapes: DrawShape[] = (arrows ?? []).map((a) => ({ orig: a.from as Key, dest: a.to as Key, brush: brushes[a.color ?? 'green'] }));
    if (highlight) shapes.push({ orig: highlight as Key, brush: 'red' });
    api.current!.set({
      fen,
      orientation,
      turnColor: turn,
      check: c.inCheck(),
      lastMove: lastMove as Key[] | undefined,
      movable: {
        free: false,
        color: movable ? turn : undefined,
        dests: movable ? (legalDests(fen) as Map<Key, Key[]>) : new Map(),
        showDests: true,
        events: {
          after: (from, to) => {
            if (isPromotion(fen, from, to)) setPromo({ from, to });
            else cb.current?.(from + to);
          },
        },
      },
      drawable: { enabled: false, autoShapes: shapes },
    });
  }, [fen, orientation, movable, lastMove?.[0], lastMove?.[1], JSON.stringify(arrows), highlight, nonce, reset]);

  const color = new Chess(fen).turn();
  return (
    <div class="board-wrap">
      <div class="board" ref={el} />
      {promo && (
        <div class="promo" role="dialog" aria-label="Promote to">
          {(['q', 'r', 'b', 'n'] as const).map((p) => (
            <button
              key={p}
              class={`promo-piece ${color === 'w' ? 'white' : 'black'} ${{ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[p]}`}
              aria-label={{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p]}
              onClick={() => { const m = promo; setPromo(null); cb.current?.(m.from + m.to + p); }}
            />
          ))}
          <button class="btn ghost" onClick={() => { setPromo(null); setReset((n) => n + 1); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}
