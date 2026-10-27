import { Chess } from 'chess.js';
import { useEffect, useState } from 'preact/hooks';
import { Board, type Arrow } from '../chess/board';
import { uciToSan } from '../chess/rules';
import { openDb } from '../store/db';
import type { Drill, MistakeLabel } from '../store/types';
import { api, cached, getAccount } from './api';

interface Ply { ply: number; played: string; best: string; label: MistakeLabel; hang: string | null; explanation: string; fenBefore: string }
interface Note { ply: number; text: string; arrow: string | null; author: string; createdAt: number }
interface Game {
  memberId: string; memberName: string; url: string; endTime: number; result: string; myColor: 'w' | 'b'; oppName: string; oppRating: number;
  moves: string; hangs: number; freeMissed: number; clockUsed: number | null; plies: Ply[]; hidden: boolean; notes: Note[];
}

const LABELS: Record<MistakeLabel, string> = {
  'hung-piece': 'Hung a piece', 'missed-free-piece': 'Missed a free piece', 'missed-fork': 'Missed a fork', 'missed-pin': 'Missed a pin',
  'missed-skewer': 'Missed a skewer', 'missed-mate': 'Missed mate', 'allowed-mate': 'Allowed mate', other: 'Mistake',
};

export function CrewGame({ memberId, url }: { memberId: string; url: string }) {
  const [g, setG] = useState<Game | null>(null);
  const [err, setErr] = useState('');
  const [ply, setPly] = useState(0); // number of moves played on the board
  const [mine, setMine] = useState(false);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState<Set<number>>(new Set());
  const load = async () => {
    const r = await cached<Game>(`game:${memberId}:${url}`, `/api/game?member=${encodeURIComponent(memberId)}&url=${encodeURIComponent(url)}`);
    if (!r.data) { setErr(r.error ?? 'Game not found.'); return; }
    setG(r.data);
    setMine((await getAccount())?.id === memberId);
    setErr(r.error ?? '');
  };
  useEffect(() => { void load().then(() => {}); }, [memberId, url]);
  useEffect(() => { if (g && ply === 0) setPly(g.plies[0]?.ply ?? g.moves.split(' ').length); }, [g?.url]);
  if (!g) return <p class="dim">{err || 'Loading game…'}</p>;

  const moves = g.moves ? g.moves.split(' ') : [];
  const c = new Chess();
  for (const m of moves.slice(0, ply)) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  const marked = g.plies.find((p) => p.ply === ply); // the position before a marked move
  const last = moves[ply - 1];
  const arrows: Arrow[] = marked ? [{ from: marked.played.slice(0, 2), to: marked.played.slice(2, 4), color: 'red' }, { from: marked.best.slice(0, 2), to: marked.best.slice(2, 4), color: 'green' }] : [];
  for (const n of g.notes.filter((x) => x.ply === ply && x.arrow)) arrows.push({ from: n.arrow!.slice(0, 2), to: n.arrow!.slice(2, 4), color: 'blue' });
  const here = g.notes.filter((n) => n.ply === ply);
  const go = (n: number) => setPly(Math.max(0, Math.min(moves.length, n)));
  const tryIt = async (p: Ply) => {
    const d: Drill = {
      id: `crew:${g.memberId}:${g.url}#${p.ply}`, fen: p.fenBefore, best: p.best, played: p.played, candidates: [],
      label: p.label, explanation: p.explanation || `Best was ${uciToSan(p.fenBefore, p.best)}.`, source: 'crew', createdAt: Date.now(),
      context: `${g.memberName}’s game vs ${g.oppName}`,
    };
    const db = await openDb();
    if (!(await db.get('drills', d.id))) await db.put('drills', d);
    setTried(new Set([...tried, p.ply]));
    location.hash = `#/drill/${encodeURIComponent(d.id)}`;
  };
  const addNote = async (e: Event) => {
    e.preventDefault();
    if (!note.trim()) return;
    await api('/api/notes', { owner: g.memberId, url: g.url, ply, text: note.trim(), arrow: marked?.best ?? null });
    setNote('');
    void load();
  };
  return (
    <div class="solver crew-game">
      <div class="solver-head">
        <a class="btn ghost small" href="#/crew" aria-label="Back to crew">‹ Crew</a>
        <span>{g.memberName} vs {g.oppName}</span>
        <span class="aside"><span class={`res ${g.result}`}>{{ win: 'Won', loss: 'Lost', draw: 'Draw' }[g.result] ?? g.result}</span></span>
      </div>
      <Board fen={c.fen()} orientation={g.myColor === 'w' ? 'white' : 'black'} movable={false}
        lastMove={last && !marked ? [last.slice(0, 2), last.slice(2, 4)] : undefined} arrows={arrows} highlight={marked?.hang ?? undefined} />
      <div class="solver-foot">
        <div class="review-nav">
          <button class="btn secondary small" aria-label="Previous move" disabled={ply <= 0} onClick={() => go(ply - 1)}>‹</button>
          <span class="pos">{ply === 0 ? 'Start position' : `Move ${ply} of ${moves.length}`}</span>
          <button class="btn secondary small" aria-label="Next move" disabled={ply >= moves.length} onClick={() => go(ply + 1)}>›</button>
        </div>
        {marked && (
          <div class="moment-detail">
            <p class="reason"><span class="pill bad">{LABELS[marked.label]}</span> {g.memberName} played <strong>{uciToSan(marked.fenBefore, marked.played)}</strong> (red). {marked.explanation}</p>
            {!mine && <button class="btn secondary small" disabled={tried.has(marked.ply)} onClick={() => void tryIt(marked)}>Try this position</button>}
          </div>
        )}
        {g.plies.length > 0 && (
          <div class="moments" role="group" aria-label="Marked moves">
            {g.plies.map((p) => (
              <button key={p.ply} class={`moment ${p.ply === ply ? 'on' : ''}`} aria-pressed={p.ply === ply} onClick={() => setPly(p.ply)}>
                Move {Math.floor(p.ply / 2) + 1}: {uciToSan(p.fenBefore, p.played)}<small>{LABELS[p.label]}</small>
              </button>
            ))}
          </div>
        )}
        <section class="notes" aria-label="Notes on this move">
          {here.map((n) => <p key={n.createdAt} class="note"><strong>{n.author}:</strong> {n.text}</p>)}
          <form class="row" onSubmit={(e) => void addNote(e)}>
            <input class="input" maxLength={140} placeholder={mine ? 'Note to self on this move' : `Tip for ${g.memberName} on this move`} value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} aria-label="Note" />
            <button class="btn secondary small" disabled={!note.trim()}>Add</button>
          </form>
        </section>
        {mine && (
          <button class="btn ghost small" onClick={async () => { await api('/api/games/hide', { url: g.url, hidden: !g.hidden }); void load(); }}>
            {g.hidden ? 'Show this game to the crew' : 'Hide this game from the crew'}
          </button>
        )}
        {err && <p class="dim">{err}</p>}
      </div>
    </div>
  );
}
