import { Chess } from 'chess.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { analyseGame, netHang } from '../analysis/analyseGame';
import { findHangs } from '../chess/material';
import { PIECE_NAMES } from '../chess/names';
import type { Square } from 'chess.js';
import { nextStage, STAGE_LABELS, type StageState } from '../coach/stage';
import { DrillSolver } from '../drills/DrillSolver';
import { logAttempt } from '../store/attempts';
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
  stage?: number; // 0 stop before, 1 flag after, 2 off (older games: from `alarm`)
  flags?: number;
  mode?: 'fix' | 'full' | 'position';
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

/** Positions just before one of his own hangs in real games: the most useful place to practise. */
async function fixPositions(): Promise<string[]> {
  const db = await openDb();
  const games = new Map((await db.getAll('games')).map((g) => [g.url, g]));
  return (await db.getAll('analyses'))
    .filter((a) => a.done && !a.failed && games.get(a.url)?.timeClass === 'rapid')
    .flatMap((a) => a.plies.filter((p) => p.hang || p.label === 'hung-piece').map((p) => p.fenBefore));
}

const effStage = (g: BotGame) => g.stage ?? (g.alarm ? 0 : 2);

function Setup({ startFen, onStart }: { startFen?: string; onStart: (g: BotGame) => void }) {
  const [side, setSide] = useState<'random' | 'w' | 'b'>('random');
  const [elo, setElo] = useState(700);
  const [playerElo, setPlayerElo] = useState(600);
  const [stage, setStage] = useState<'0' | '1' | '2'>('0');
  const [clock, setClock] = useState(false);
  const [positions, setPositions] = useState<string[]>([]);
  const [mode, setMode] = useState<'fix' | 'full'>('full');
  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      const st = (await kvGet<StageState>('alarm-stage')) ?? { stage: s.alarm ? 0 : 2, good: 0 };
      setStage(String(st.stage) as '0');
      const rapid = (await (await openDb()).getAll('games')).filter((g) => g.timeClass === 'rapid').sort((a, b) => b.endTime - a.endTime)[0];
      const mine = rapid ? roundTo50(rapid.myRating) : 600;
      setPlayerElo(mine);
      setElo(Math.max(600, s.botElo ?? mine + 100)); // a little stronger than you: stretch, not stroll
      const fx = await fixPositions();
      setPositions(fx);
      if (fx.length && !startFen) setMode('fix');
    })();
  }, []);
  const fixedFen = startFen ?? (mode === 'fix' && positions.length ? positions[Math.floor(Math.random() * positions.length)] : null);
  const start = () => {
    const fen = fixedFen ?? START;
    const color = fixedFen ? (new Chess(fen).turn() as 'w' | 'b') : side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : side;
    onStart({
      id: crypto.randomUUID(), startFen: fen, moves: [], color, elo, playerElo, alarm: stage === '0', stage: +stage, flags: 0,
      mode: startFen ? 'position' : mode, clock: clock ? { left: 15 * 60, inc: 10 } : null, alarms: 0,
    });
  };
  return (
    <div class="stack">
      <div class="card stack">
        <h2>Training game</h2>
        {!startFen && (
          <Segmented value={mode} onChange={setMode} options={[['fix', 'Fix a mistake'], ['full', 'Full game']]} />
        )}
        <p class="dim small-print" style="margin:0">
          {startFen ? 'Play on from this position.'
            : mode === 'fix' ? (positions.length ? `Starts just before one of your own blunders (${positions.length} to choose from). Play it out properly this time.` : 'No analysed blunders yet — sync your chess.com games first. Until then, play a full game.')
            : 'A full game from the start.'}
        </p>
        {mode === 'full' && !startFen && (
          <Field label="You play">
            <Segmented value={side} onChange={setSide} options={[['random', 'Random'], ['w', 'White'], ['b', 'Black']]} />
          </Field>
        )}
        <Field label="Bot strength" hint={`Your rating ${playerElo} + 100: a stretch`}>
          <div class="stepper">
            <button class="btn secondary small" aria-label="Weaker" onClick={() => setElo(Math.max(600, elo - 50))}>−</button>
            <span class="stepper-value">{elo}</span>
            <button class="btn secondary small" aria-label="Stronger" onClick={() => setElo(Math.min(2000, elo + 50))}>+</button>
          </div>
        </Field>
        <div class="form-field">
          <span class="field-label">Coach</span>
          <Segmented value={stage} onChange={setStage} options={[['0', 'Stop me'], ['1', 'Flag after'], ['2', 'Off']]} />
          <small class="dim">{STAGE_LABELS[+stage]}. Steps back on its own after 2 clean games in a row.</small>
        </div>
        <Field label="Clock" hint={clock ? '15 minutes + 10 seconds a move' : 'No clock'}>
          <Toggle checked={clock} onChange={setClock} label="15|10 clock" />
        </Field>
        <div class="goal"><strong>Goal:</strong> no pieces hung, at most 1 alarm. Before every move: what can they take?</div>
        <button class="btn block" disabled={mode === 'fix' && !positions.length && !startFen} onClick={start}>Start game</button>
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

  const [flag, setFlag] = useState<{ square: string; piece: string } | null>(null);
  const onMove = async (uci: string) => {
    if (!myTurn || checking || pending) return;
    setFlag(null);
    const stage = effStage(game);
    if (stage === 2) return commit(uci);
    if (stage === 1) {
      // Flag after: the move stands; if it hung something, mark it (no answer shown).
      commit(uci);
      const r = await checkMove(fen, uci, getEngine()).catch(() => ({ alarm: false }));
      if (r.alarm) {
        const after = play(fen, uci)!;
        const h = netHang(after.history({ verbose: true }).at(-1)!, findHangs(after.fen()));
        if (h) setFlag({ square: h.square, piece: PIECE_NAMES[after.get(h.square as Square)!.type] });
        onChange({ ...gRef.current, flags: (gRef.current.flags ?? 0) + 1 });
      }
      return;
    }
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
        highlight={flag?.square}
      />
      <div class="solver-foot">
        {flag && !over && (
          <p class="flag-note" role="status">That left your {flag.piece} on {flag.square} loose (red). Keep playing — you’ll review it after the game.</p>
        )}
        {over ? (
          <div class={`card result ${over.result}`} role="status" aria-label="Game result">
            <h2>{resultTitle(over)}</h2>
            <p class="dim">vs Maia {game.elo}{game.alarms ? ` · the coach stopped you ${game.alarms}×` : ''}{game.flags ? ` · flagged ${game.flags}×` : ''}</p>
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
            <span class="dim">Coach: {['stops you', 'flags after', 'off'][effStage(game)]}</span>
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
  const [quiz, setQuiz] = useState<Drill[]>([]);
  const [quizAt, setQuizAt] = useState(0);
  const [stageNote, setStageNote] = useState('');
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
        // The 3 costliest moments become a "find it yourself" quiz before any answer is shown.
        const drop = new Map(a.plies.map((p) => [`${rec.url}#${p.ply}`, p.drop]));
        setQuiz([...ds].sort((x, y) => (drop.get(y.id) ?? 0) - (drop.get(x.id) ?? 0)).slice(0, 3));
        await saveDrills(ds);
        // Fade or restore the coach based on this game (once per game).
        if (!(await kvGet(`stage-applied:${game.id}`))) {
          const before = (await kvGet<StageState>('alarm-stage')) ?? { stage: effStage(game), good: 0 };
          const after = nextStage({ ...before, stage: effStage(game) }, { hangs: a.stats.hangs, helps: game.alarms + (game.flags ?? 0) });
          await kvSet('alarm-stage', after);
          await kvSet(`stage-applied:${game.id}`, true);
          if (after.stage !== effStage(game)) setStageNote(after.stage > effStage(game) ? `Clean play — the coach steps back: next game it will ${['stop you', 'only flag after you move', 'stay quiet'][after.stage]}.` : 'Too many hung pieces — the coach will step in more again next game.');
        }
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
  if (quiz.length && quizAt < quiz.length) {
    const q = quiz[quizAt];
    return (
      <div>
        <p class="quiz-intro"><strong>Before the answers:</strong> your {quiz.length === 1 ? 'costliest move' : `${quiz.length} costliest moves`}. Find a better one yourself — that’s what makes it stick.
          <button class="btn ghost small" onClick={() => setQuizAt(quiz.length)}>Skip to answers</button></p>
        <DrillSolver key={q.id} drill={q} nextLabel={quizAt + 1 < quiz.length ? 'Next moment' : 'See the full review'}
          onDone={(r) => void logAttempt({ kind: 'drill', itemId: q.id, ts: Date.now(), ...r })}
          onNext={() => setQuizAt(quizAt + 1)}
          aside={<span class="dim counter">{quizAt + 1} / {quiz.length}</span>} />
      </div>
    );
  }
  const hangs = analysis?.stats.hangs ?? 0;
  const helps = game.alarms + (game.flags ?? 0);
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
        {analysis && (
          <p class={`goal-result ${hangs === 0 && helps <= 1 ? 'good' : ''}`}>
            {hangs === 0 && helps <= 1 ? 'Goal met: no pieces hung.' : `Goal missed: ${hangs} hung piece${hangs === 1 ? '' : 's'}${helps > 1 ? `, coach needed ${helps}×` : ''}.`}
            {stageNote && <span class="dim"> {stageNote}</span>}
          </p>
        )}
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
