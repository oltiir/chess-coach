import { Chess } from 'chess.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { analyseGame } from '../analysis/analyseGame';
import { pauseAnalysis, resumeAnalysis } from '../background';
import { Board } from '../chess/board';
import { play, uciToSan } from '../chess/rules';
import { getEngine } from '../engine/client';
import { makeDrills, saveDrills } from '../drills/makeDrills';
import { kvGet, kvSet, openDb } from '../store/db';
import { getSettings } from '../store/exportImport';
import type { Drill, GameAnalysis, GameRecord } from '../store/types';
import { SafetyCheckCard } from '../ui/SafetyCheckCard';
import { checkMove } from './alarm';
import { getBot } from './maia';

interface BotGame {
  id: string; startFen: string; moves: string[]; color: 'w' | 'b'; elo: number; playerElo: number;
  alarm: boolean; clock: { left: number; inc: number } | null; alarms: number;
  over?: { result: 'win' | 'loss' | 'draw'; why: string };
}

const START = new Chess().fen();
const roundTo50 = (n: number) => Math.round(n / 50) * 50;

function replay(g: BotGame): Chess {
  const c = new Chess(g.startFen);
  for (const m of g.moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  return c;
}

function overState(c: Chess, me: 'w' | 'b'): BotGame['over'] | undefined {
  if (c.isCheckmate()) return c.turn() === me ? { result: 'loss', why: 'Checkmate' } : { result: 'win', why: 'Checkmate' };
  if (c.isStalemate()) return { result: 'draw', why: 'Stalemate' };
  if (c.isThreefoldRepetition()) return { result: 'draw', why: 'Repetition' };
  if (c.isInsufficientMaterial()) return { result: 'draw', why: 'Not enough material' };
  if (c.isDraw()) return { result: 'draw', why: '50-move rule' };
  return undefined;
}

export function PlayScreen({ startFen }: { startFen?: string }) {
  const [game, setGame] = useState<BotGame | null | undefined>(undefined);
  useEffect(() => {
    pauseAnalysis();
    void kvGet<BotGame>('bot-game').then((g) => setGame(startFen ? null : g ?? null));
    return () => resumeAnalysis();
  }, []);
  const save = (g: BotGame | null) => { setGame(g); void kvSet('bot-game', g); };

  if (game === undefined) return null;
  if (!game) return <Setup startFen={startFen} onStart={save} />;
  if (game.over) return <Review game={game} onNew={() => save(null)} />;
  return <Game game={game} onChange={save} />;
}

function Setup({ startFen, onStart }: { startFen?: string; onStart: (g: BotGame) => void }) {
  const [side, setSide] = useState<'random' | 'w' | 'b'>('random');
  const [elo, setElo] = useState(600);
  const [playerElo, setPlayerElo] = useState(600);
  const [alarm, setAlarm] = useState(true);
  const [clock, setClock] = useState(false);
  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      setAlarm(s.alarm);
      const rapid = (await (await openDb()).getAll('games')).filter((g) => g.timeClass === 'rapid').sort((a, b) => b.endTime - a.endTime)[0];
      const mine = rapid ? roundTo50(rapid.myRating) : 600;
      setPlayerElo(mine);
      setElo(Math.max(600, s.botElo ?? mine));
    })();
  }, []);
  const fixedSide = startFen ? (new Chess(startFen).turn() as 'w' | 'b') : null;
  const start = () => onStart({
    id: crypto.randomUUID(), startFen: startFen ?? START, moves: [],
    color: fixedSide ?? (side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : side),
    elo, playerElo, alarm, clock: clock ? { left: 15 * 60, inc: 10 } : null, alarms: 0,
  });
  return (
    <div class="stack">
      <div class="card stack">
        <h2>New practice game</h2>
        {!fixedSide && (
          <Field label="You play">
            <Segmented value={side} onChange={setSide} options={[['random', 'Random'], ['w', 'White'], ['b', 'Black']]} />
          </Field>
        )}
        <Field label="Bot strength">
          <div class="stepper">
            <button class="btn secondary small" aria-label="Weaker" onClick={() => setElo(Math.max(600, elo - 50))}>−</button>
            <span class="stepper-value">{elo}</span>
            <button class="btn secondary small" aria-label="Stronger" onClick={() => setElo(Math.min(2000, elo + 50))}>+</button>
          </div>
        </Field>
        <Field label="Blunder alarm" hint={alarm ? 'Stops you before you hang a piece' : 'Test mode: no help'}>
          <Toggle checked={alarm} onChange={setAlarm} label="Blunder alarm" />
        </Field>
        <Field label="Clock" hint={clock ? '15 minutes + 10 seconds a move' : 'No clock'}>
          <Toggle checked={clock} onChange={setClock} label="15|10 clock" />
        </Field>
        <button class="btn block" onClick={start}>Start game</button>
      </div>
      <p class="dim small-print">The bot is Maia, trained on real human games, so it plays and blunders like a person of that rating.</p>
    </div>
  );
}

function Game({ game, onChange }: { game: BotGame; onChange: (g: BotGame) => void }) {
  const c = replay(game);
  const fen = c.fen();
  const myTurn = c.turn() === game.color;
  const [pending, setPending] = useState<{ uci: string; fen: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [left, setLeft] = useState(game.clock?.left ?? 0);
  const gRef = useRef(game);
  gRef.current = game;

  const commit = (uci: string, alarms = game.alarms) => {
    const moves = [...game.moves, uci];
    const after = replay({ ...game, moves });
    const clock = game.clock && { ...game.clock, left: left + game.clock.inc };
    onChange({ ...game, moves, alarms, clock, over: overState(after, game.color) });
  };

  // Bot's move
  useEffect(() => {
    if (myTurn || game.over) return;
    let live = true;
    const t0 = Date.now();
    void getBot().then(async (bot) => {
      const uci = await bot.chooseMove(fen, game.elo, game.playerElo);
      await new Promise((r) => setTimeout(r, Math.max(0, 500 - (Date.now() - t0))));
      if (!live) return;
      const moves = [...gRef.current.moves, uci];
      onChange({ ...gRef.current, moves, over: overState(replay({ ...gRef.current, moves }), game.color) });
    });
    return () => { live = false; };
  }, [game.moves.length]);

  // Player's clock
  useEffect(() => {
    if (!game.clock || !myTurn) return;
    setLeft(game.clock.left);
    const t = setInterval(() => setLeft((s) => {
      if (s <= 1) { clearInterval(t); onChange({ ...gRef.current, over: { result: 'loss', why: 'Out of time' } }); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [myTurn, game.moves.length]);

  const onMove = async (uci: string) => {
    if (!myTurn || checking) return;
    if (!game.alarm) return commit(uci);
    setChecking(true);
    const r = await checkMove(fen, uci, getEngine()).catch(() => ({ alarm: false }));
    setChecking(false);
    if (r.alarm) setPending({ uci, fen: play(fen, uci)!.fen() });
    else commit(uci);
  };

  const last = game.moves[game.moves.length - 1];
  const orientation = game.color === 'w' ? 'white' : 'black';
  return (
    <div class="solver">
      <div class="solver-head">
        <span class={`turn-dot ${c.turn() === 'w' ? 'white' : 'black'}`} aria-hidden="true" />
        <span>{checking ? 'Checking your move…' : myTurn ? 'Your move' : 'Maia is thinking…'}</span>
        <span class="aside">
          {game.clock && <span class={`clock ${left < 60 ? 'low' : ''}`}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
          <span class="pill">Maia {game.elo}</span>
        </span>
      </div>
      <Board
        fen={pending ? pending.fen : fen}
        orientation={orientation}
        movable={myTurn && !pending && !checking}
        onMove={(u) => void onMove(u)}
        lastMove={last ? [last.slice(0, 2), last.slice(2, 4)] : undefined}
        nonce={nonce}
      />
      <div class="solver-foot">
        <div class="row between">
          <span class="dim">{game.alarm ? 'Blunder alarm on' : 'Test mode'}</span>
          <button class="btn secondary small" onClick={() => onChange({ ...game, over: { result: 'loss', why: 'Resigned' } })}>Resign</button>
        </div>
      </div>
      {pending && (
        <div class="sheet-backdrop">
          <div class="sheet" role="dialog" aria-label="Blunder alarm">
            <h2>Look again: what can they capture after this?</h2>
            <p class="dim">Run the safety check before you commit.</p>
            <div class="row">
              <button class="btn" style="flex:1" onClick={() => { setPending(null); setNonce((n) => n + 1); onChange({ ...game, alarms: game.alarms + 1 }); }}>Rethink</button>
              <button class="btn secondary" onClick={() => { const u = pending.uci; setPending(null); commit(u, game.alarms + 1); }}>Play it anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Review({ game, onNew }: { game: BotGame; onNew: () => void }) {
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  useEffect(() => {
    void (async () => {
      const c = replay(game);
      const rec: GameRecord = {
        url: `bot:${game.id}`, endTime: Date.now(), timeClass: 'bot', timeControl: '-', myColor: game.color,
        myRating: game.playerElo, oppRating: game.elo, oppName: `Maia ${game.elo}`, result: game.over!.result, pgn: c.pgn(),
      };
      const db = await openDb();
      const a = { ...(await analyseGame(rec, getEngine(), 100_000)) };
      a.stats = { ...a.stats, alarms: game.alarms };
      await db.put('games', rec);
      await db.put('analyses', a);
      setAnalysis(a);
      setDrills(makeDrills(a, rec));
    })();
  }, [game.id]);
  const title = { win: 'You won', loss: 'You lost', draw: 'Draw' }[game.over!.result];
  return (
    <div class="stack">
      <div class="card">
        <h2>{title}</h2>
        <p class="dim">{game.over!.why} · vs Maia {game.elo}{game.alarm ? ` · alarm stopped you ${game.alarms}×` : ''}</p>
        {analysis && <p>{analysis.stats.hangs === 0 ? 'No hung pieces. Nice and careful.' : `Pieces hung: ${analysis.stats.hangs}`}</p>}
      </div>
      <h2>Key moments</h2>
      {!analysis && <p class="dim">Reviewing your game…</p>}
      {analysis && drills.length === 0 && <p class="dim">No big mistakes found.</p>}
      {drills.map((d) => (
        <div class="card" key={d.id}>
          <p><strong>{uciToSan(d.fen, d.played)}</strong> — {d.explanation}</p>
          <button class="btn secondary small" disabled={added.has(d.id)} onClick={() => { void saveDrills([d]); setAdded(new Set([...added, d.id])); }}>
            {added.has(d.id) ? 'Added to Today' : 'Practise this'}
          </button>
        </div>
      ))}
      <button class="btn block" onClick={onNew}>New game</button>
      <SafetyCheckCard />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: preact.ComponentChildren }) {
  return (
    <div class="field">
      <div><div class="field-label">{label}</div>{hint && <div class="dim field-hint">{hint}</div>}</div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div class="segmented" role="radiogroup">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} class={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} class={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}
