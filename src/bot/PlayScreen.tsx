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
import { checkMove } from './alarm';
import { getBot, warmBot } from './maia';

interface BotGame {
  id: string; startFen: string; moves: string[]; color: 'w' | 'b'; elo: number; playerElo: number;
  alarm: boolean; clock: { left: number; inc: number } | null; alarms: number;
  over?: { result: 'win' | 'loss' | 'draw'; why: string };
  reviewing?: boolean;
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
    warmBot();
    void kvGet<BotGame>('bot-game').then((g) => setGame(startFen ? null : g ?? null));
    return () => resumeAnalysis();
  }, []);
  const save = (g: BotGame | null) => { setGame(g); void kvSet('bot-game', g); };

  if (game === undefined) return null;
  if (!game) return <Setup startFen={startFen} onStart={save} />;
  if (game.over && game.reviewing) return <Review game={game} onNew={() => save(null)} />;
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

function resultTitle(o: NonNullable<BotGame['over']>): string {
  if (o.why === 'Checkmate') return o.result === 'win' ? 'Checkmate — you won' : 'Checkmate — Maia won';
  if (o.why === 'Resigned') return 'You resigned';
  if (o.why === 'Out of time') return 'Out of time — Maia won';
  return `Draw — ${o.why.toLowerCase()}`;
}

function Game({ game, onChange }: { game: BotGame; onChange: (g: BotGame | null) => void }) {
  const c = replay(game);
  const fen = c.fen();
  const myTurn = c.turn() === game.color;
  const [pending, setPending] = useState<{ uci: string; fen: string; alarm: boolean } | null>(null);
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
  const [botError, setBotError] = useState(false);
  const [botTry, setBotTry] = useState(0);
  useEffect(() => {
    if (myTurn || game.over) return;
    let live = true;
    const t0 = Date.now();
    setBotError(false);
    void getBot()
      .then(async (bot) => {
        const uci = await bot.chooseMove(fen, game.elo, game.playerElo);
        await new Promise((r) => setTimeout(r, Math.max(0, 500 - (Date.now() - t0))));
        if (!live || gRef.current.over) return; // resigned (or left) while Maia was thinking
        const moves = [...gRef.current.moves, uci];
        onChange({ ...gRef.current, moves, over: overState(replay({ ...gRef.current, moves }), game.color) });
      })
      .catch(() => { if (live) setBotError(true); });
    return () => { live = false; };
  }, [game.moves.length, botTry]);

  // Player's clock
  useEffect(() => {
    if (!game.clock || !myTurn || game.over) return;
    setLeft(game.clock.left);
    const t = setInterval(() => setLeft((s) => {
      if (s <= 1) { clearInterval(t); onChange({ ...gRef.current, over: { result: 'loss', why: 'Out of time' } }); return 0; }
      void kvSet('bot-game', { ...gRef.current, clock: { ...gRef.current.clock!, left: s - 1 } }); // survives a reload mid-turn
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [myTurn, game.moves.length]);

  const onMove = async (uci: string) => {
    if (!myTurn || checking || pending) return;
    if (!game.alarm) return commit(uci);
    // Keep the piece where the player put it while the coach checks the move.
    setPending({ uci, fen: play(fen, uci)!.fen(), alarm: false });
    setChecking(true);
    const r = await checkMove(fen, uci, getEngine()).catch(() => ({ alarm: false }));
    setChecking(false);
    if (r.alarm) setPending({ uci, fen: play(fen, uci)!.fen(), alarm: true });
    else { setPending(null); commit(uci); }
  };

  const last = game.moves[game.moves.length - 1];
  const orientation = game.color === 'w' ? 'white' : 'black';
  const over = game.over;
  return (
    <div class="solver">
      <div class="solver-head">
        <span class={`turn-dot ${c.turn() === 'w' ? 'white' : 'black'}`} aria-hidden="true" />
        <span>{over ? 'Game over' : pending?.alarm ? 'Check your move' : checking ? 'Checking your move…' : myTurn ? 'Your move' : botError ? 'Maia couldn’t move.' : 'Maia is thinking…'}</span>
        <span class="aside">
          {game.clock && <span class={`clock ${left < 60 ? 'low' : ''}`}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
          <span class="pill">Maia {game.elo}</span>
        </span>
      </div>
      <Board
        fen={pending ? pending.fen : fen}
        orientation={orientation}
        movable={!over && myTurn && !pending && !checking}
        onMove={(u) => void onMove(u)}
        lastMove={pending ? [pending.uci.slice(0, 2), pending.uci.slice(2, 4)] : last ? [last.slice(0, 2), last.slice(2, 4)] : undefined}
        nonce={nonce}
      />
      <div class="solver-foot">
        {over ? (
          <div class={`card result ${over.result}`} role="status" aria-label="Game result">
            <h2>{resultTitle(over)}</h2>
            <p class="dim">vs Maia {game.elo}{game.alarm ? ` · the alarm stopped you ${game.alarms}×` : ''}</p>
            <div class="row">
              <button class="btn" style="flex:1" onClick={() => onChange({ ...game, reviewing: true })}>Review game</button>
              <button class="btn secondary" onClick={() => onChange(null)}>New game</button>
            </div>
          </div>
        ) : botError ? (
          <div class="row between">
            <span class="dim">Something went wrong loading the bot.</span>
            <button class="btn small" onClick={() => setBotTry((n) => n + 1)}>Try again</button>
          </div>
        ) : pending?.alarm ? (
          <div class="card alarm" role="alertdialog" aria-label="Blunder alarm">
            <h2>Look again: what can they capture after this?</h2>
            <p class="dim">You’re about to play {uciToSan(fen, pending.uci)}. Run the safety check first.</p>
            <div class="row">
              <button class="btn" style="flex:1" onClick={() => { setPending(null); setNonce((n) => n + 1); onChange({ ...game, alarms: game.alarms + 1 }); }}>Rethink</button>
              <button class="btn secondary" onClick={() => { const u = pending.uci; setPending(null); commit(u, game.alarms + 1); }}>Play it anyway</button>
            </div>
          </div>
        ) : (
          <div class="row between">
            <span class="dim">{game.alarm ? 'Blunder alarm on' : 'Test mode'}</span>
            <button class="btn secondary small" onClick={() => onChange({ ...game, over: { result: 'loss', why: 'Resigned' } })}>Resign</button>
          </div>
        )}
      </div>
    </div>
  );
}

const LABELS: Record<Drill['label'], string> = {
  'hung-piece': 'Hung a piece', 'missed-free-piece': 'Missed a free piece', 'missed-fork': 'Missed a fork',
  'missed-pin': 'Missed a pin', 'missed-skewer': 'Missed a skewer', 'missed-mate': 'Missed mate',
  'allowed-mate': 'Allowed mate', other: 'Mistake',
};

function Review({ game, onNew }: { game: BotGame; onNew: () => void }) {
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [sel, setSel] = useState(0);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const final = replay(game);
  useEffect(() => {
    void (async () => {
      const rec: GameRecord = {
        url: `bot:${game.id}`, endTime: Date.now(), timeClass: 'bot', timeControl: '-', myColor: game.color,
        myRating: game.playerElo, oppRating: game.elo, oppName: `Maia ${game.elo}`, result: game.over!.result, pgn: final.pgn(),
      };
      const db = await openDb();
      try {
        let a = await db.get('analyses', rec.url);
        if (!a?.done) {
          a = { ...(await analyseGame(rec, getEngine(), 100_000)) };
          a.stats = { ...a.stats, alarms: game.alarms };
          await db.put('games', rec);
          await db.put('analyses', a);
        }
        const ds = makeDrills(a, rec);
        const saved = new Set((await db.getAllKeys('drills')).map(String));
        setAdded(new Set(ds.filter((d) => saved.has(d.id)).map((d) => d.id)));
        setAnalysis(a);
        setDrills(ds);
      } catch {
        setFailed(true);
      }
    })();
  }, [game.id, attempt]);

  // What the board shows: a key moment (with arrows) or any position in the game (0 = start).
  const [ply, setPly] = useState<number | null>(null);
  const total = game.moves.length;
  const d = ply === null ? drills[sel] : undefined;
  const shown = (() => {
    if (d) return { fen: d.fen, last: undefined as [string, string] | undefined };
    const n = ply ?? total;
    const c = new Chess(game.startFen);
    for (const m of game.moves.slice(0, n)) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    const lm = game.moves[n - 1];
    return { fen: c.fen(), last: lm ? ([lm.slice(0, 2), lm.slice(2, 4)] as [string, string]) : undefined };
  })();
  const at = ply ?? (d ? Number(d.id.split('#')[1]) : total);
  const go = (n: number) => setPly(Math.max(0, Math.min(total, n)));
  const moveNo = (fen: string) => fen.split(' ')[5];
  const orientation = game.color === 'w' ? 'white' : 'black';
  return (
    <div class="solver review">
      <div class="solver-head">
        <span>{resultTitle(game.over!)}</span>
        <span class="aside"><button class="btn secondary small" onClick={onNew}>New game</button></span>
      </div>
      <Board
        fen={shown.fen}
        orientation={orientation}
        movable={false}
        lastMove={shown.last}
        arrows={d ? [{ from: d.played.slice(0, 2), to: d.played.slice(2, 4), color: 'red' }, { from: d.best.slice(0, 2), to: d.best.slice(2, 4), color: 'green' }] : undefined}
      />
      <div class="solver-foot">
        <div class="review-nav">
          <button class="btn secondary small" aria-label="Previous move" disabled={at <= 0} onClick={() => go(at - 1)}>‹</button>
          <span class="pos">{d ? `Before move ${moveNo(d.fen)}` : at === 0 ? 'Start position' : `Move ${at} of ${total}`}</span>
          <button class="btn secondary small" aria-label="Next move" disabled={!d && at >= total} onClick={() => go(d ? at : at + 1)}>›</button>
        </div>
        {!analysis && !failed && <p class="dim">Reviewing your game…</p>}
        {failed && (
          <div class="row between">
            <span class="dim">Couldn’t review this game.</span>
            <button class="btn secondary small" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Try again</button>
          </div>
        )}
        {analysis && !drills.length && <p>No big mistakes found{analysis.stats.hangs === 0 ? ' and no hung pieces' : ''}. Nice and careful.</p>}
        {d && (
          <div class="moment-detail">
            <p class="reason">
              <span class="pill bad">{LABELS[d.label]}</span> You played <strong>{uciToSan(d.fen, d.played)}</strong> (red). {d.explanation}
            </p>
            <button class="btn secondary small" disabled={added.has(d.id)} onClick={() => { void saveDrills([d]); setAdded(new Set([...added, d.id])); }}>
              {added.has(d.id) ? 'Added to Today' : 'Practise this'}
            </button>
          </div>
        )}
        {drills.length > 1 && (
          <div class="moments" role="group" aria-label="Key moments">
            {drills.map((x, i) => (
              <button key={x.id} class={`moment ${ply === null && i === sel ? 'on' : ''}`} aria-pressed={ply === null && i === sel} onClick={() => { setSel(i); setPly(null); }}>
                Move {moveNo(x.fen)}: {uciToSan(x.fen, x.played)}
                <small>{LABELS[x.label]}</small>
              </button>
            ))}
          </div>
        )}
        {drills.length === 1 && (
          <button class={`moment ${ply === null ? 'on' : ''}`} aria-pressed={ply === null} onClick={() => { setSel(0); setPly(null); }}>
            Move {moveNo(drills[0].fen)}: {uciToSan(drills[0].fen, drills[0].played)}
            <small>{LABELS[drills[0].label]}</small>
          </button>
        )}
      </div>
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
