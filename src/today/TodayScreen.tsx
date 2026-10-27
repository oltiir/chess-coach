import { useEffect, useState } from 'preact/hooks';
import { puzzlesReady } from '../boot';
import { PuzzleSolver, type PuzzleResult } from '../puzzles/PuzzleSolver';
import { stepOf } from '../puzzles/select';
import { allAttempts, logAttempt } from '../store/attempts';
import { openDb } from '../store/db';
import { getSettings } from '../store/exportImport';
import { SafetyCheckCard } from '../ui/SafetyCheckCard';
import { DrillSolver } from '../drills/DrillSolver';
import type { Drill } from '../store/types';
import { buildSession, dayKey, daysTrainedThisWeek, finishItem, type Session } from './session';

type Mode = 'home' | 'running' | 'summary';

export function TodayScreen({ drillId }: { drillId?: string }) {
  const [single, setSingle] = useState<Drill | null>(null);
  useEffect(() => {
    if (!drillId) { setSingle(null); return; }
    void openDb().then(async (db) => setSingle((await db.get('drills', drillId)) ?? null));
  }, [drillId]);
  const [session, setSession] = useState<Session | null>(null);
  const [days, setDays] = useState(0);
  const [mode, setMode] = useState<Mode>('home');
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);

  const load = async () => {
    await puzzlesReady;
    const db = await openDb();
    const attempts = await allAttempts();
    const s = await buildSession(Date.now(), attempts, await db.getAll('drills'), db, (await getSettings()).puzzleSeed);
    setSession(s);
    setDays(daysTrainedThisWeek(attempts, Date.now()));
    // Rebuild the summary from saved answers so it survives a reload.
    const today = dayKey(Date.now());
    const first = new Map<string, boolean>();
    for (const a of [...attempts].sort((x, y) => x.ts - y.ts))
      if (dayKey(a.ts) === today && !first.has(a.itemId)) first.set(a.itemId, a.firstTry);
    const res: Record<string, boolean> = {};
    for (const id of s.doneIds) { const v = first.get(id.slice(2)); if (v !== undefined) res[id] = v; }
    setResults(res);
  };
  useEffect(() => { void load(); }, []);

  if (single)
    return (
      <DrillSolver
        drill={single}
        onDone={(r) => void logAttempt({ kind: 'drill', itemId: single.id, ts: Date.now(), ...r })}
        onNext={() => { location.hash = '#/today'; }}
        nextLabel="Done"
      />
    );
  if (!session) return <p class="dim">Getting today’s session ready…</p>;
  const remaining = session.items.filter((i) => !session.doneIds.includes(i.id));
  const total = session.items.length;
  const doneCount = total - remaining.length;
  const drillCount = session.items.filter((i) => i.kind === 'drill').length;

  const record = async (id: string, r: PuzzleResult) => {
    const item = session.items.find((i) => i.id === id)!;
    const attempt = item.kind === 'puzzle'
      ? { kind: 'puzzle' as const, itemId: item.puzzle.id, ts: Date.now(), ...r, theme: stepOf(item.puzzle), rating: item.puzzle.rating }
      : { kind: 'drill' as const, itemId: item.drill.id, ts: Date.now(), ...r };
    setResults((x) => ({ ...x, [id]: r.firstTry }));
    await finishItem(Date.now(), id, attempt);
    setSession((s) => s && { ...s, doneIds: [...s.doneIds, id] });
  };
  const next = () => {
    const nextItem = remaining.find((i) => i.id !== currentId);
    if (nextItem) setCurrentId(nextItem.id);
    else { setMode('summary'); void allAttempts().then((a) => setDays(daysTrainedThisWeek(a, Date.now()))); }
  };
  const begin = () => { setCurrentId(remaining[0]?.id ?? null); setMode('running'); };

  const current = session.items.find((i) => i.id === currentId);
  if (mode === 'running' && current) {
    const item = current;
    const position = session.items.indexOf(item) + 1;
    const aside = (
      <>
        <span class="dim counter">{position} / {total}</span>
        <button class="btn secondary small" onClick={() => setMode('home')}>Pause</button>
      </>
    );
    return (
      <div>
        <div class="progress-track" aria-hidden="true"><span style={{ width: `${((position - 1) / total) * 100}%` }} /></div>
        {item.kind === 'puzzle' ? (
          <PuzzleSolver key={item.id} puzzle={item.puzzle} onDone={(r) => void record(item.id, r)} onNext={next} nextLabel={remaining.some((i) => i.id !== item.id) ? 'Next' : 'Finish'} aside={aside} />
        ) : (
          <DrillSolver key={item.id} drill={item.drill} onDone={(r) => void record(item.id, r)} onNext={next} aside={aside} />
        )}
      </div>
    );
  }

  if (mode === 'summary' || (mode === 'home' && total > 0 && !remaining.length)) {
    const vals = Object.values(results);
    const missed = vals.filter((v) => !v).length;
    return (
      <div class="stack">
        <div class="card">
          <h2>Session done</h2>
          {vals.length > 0 && <p>{vals.length - missed} solved first try · {missed} missed</p>}
          <p class="dim">Back tomorrow: {missed} to try again, plus new ones.</p>
        </div>
        <WeekCard days={days} />
        <ChessComCard />
      </div>
    );
  }

  return (
    <div class="stack">
      <div class="card hero">
        <p class="dim" style="margin:0">Today’s session</p>
        <h2 class="hero-title">{drillCount ? `${total} items` : `${total} themed puzzles`}</h2>
        <p class="dim">About 12 minutes{drillCount > 0 ? ` · ${drillCount} from your own games, then themed puzzles` : ''}</p>
        <button class="btn block" onClick={begin}>
          {doneCount > 0 ? `Continue (${doneCount}/${total})` : 'Start'}
        </button>
      </div>
      <SafetyCheckCard />
      <WeekCard days={days} />
      <ChessComCard />
    </div>
  );
}

function WeekCard({ days }: { days: number }) {
  return (
    <div class="card row between">
      <span>Days trained this week</span>
      <span class="week-dots" aria-label={`${days} of 7`}>
        {Array.from({ length: 7 }, (_, i) => <span key={i} class={i < days ? 'on' : ''} />)}
      </span>
    </div>
  );
}

function ChessComCard() {
  return (
    <a class="card link-card" href="https://www.chess.com/play/online" target="_blank" rel="noopener">
      <strong>Before you play on chess.com</strong>
      <span class="dim">Play 15|10 rapid. Run the three questions before every move.</span>
    </a>
  );
}
