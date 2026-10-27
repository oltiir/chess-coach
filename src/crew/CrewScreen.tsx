import { useEffect, useState } from 'preact/hooks';
import { getSettings } from '../store/exportImport';
import { api, cached, CrewError, getAccount, saveAccount, uploadPending, type Account } from './api';

interface Member { id: string; name: string; level: number | null; hpg: number; games: number; rating: number | null; zeroHangPct: number }
interface Crew {
  crew: { name: string; code: string }; me: { id: string; name: string; rivalId: string | null }; members: Member[];
  quest: { title: string; done: Record<string, boolean> };
  rival: { id: string; name: string; record: { wins: number; losses: number; draws: number; cleanOff: boolean } } | null;
  recap: { week: string; lines: { name: string; games: number; hpg: number }[]; mostImproved: string | null; cleanest: { member: string; url: string; ownMoves: number } | null };
}
export interface FeedGame {
  memberId: string; memberName: string; url: string; endTime: number; result: string; oppName: string; oppRating: number;
  hangs: number; freeMissed: number; clockUsed: number | null; ownMoves: number; hidden: number;
}

const one = (n: number) => n.toFixed(1);
const date = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const gameHref = (memberId: string, url: string) => `#/crew/game/${memberId}/${encodeURIComponent(url)}`;

export function CrewScreen() {
  const [acct, setAcct] = useState<Account | null | undefined>(undefined);
  const [recovery, setRecovery] = useState<string | null>(null);
  useEffect(() => { void getAccount().then(setAcct); }, []);
  if (acct === undefined) return null;
  if (recovery) return <RecoveryCard code={recovery} onDone={() => setRecovery(null)} />;
  if (!acct) return <JoinCrew onJoined={(a, rec) => { setAcct(a); setRecovery(rec ?? null); void uploadPending(); }} />;
  return <CrewHome acct={acct} onLeave={() => { void saveAccount(null); setAcct(null); }} />;
}

function JoinCrew({ onJoined }: { onJoined: (a: Account, recovery?: string) => void }) {
  const [mode, setMode] = useState<'join' | 'create' | 'login' | 'recover'>('join');
  const [f, setF] = useState({ code: '', crewName: '', name: '', chesscom: '', passcode: '', recovery: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void getSettings().then((s) => setF((x) => ({ ...x, chesscom: s.username }))); }, []);
  const set = (k: keyof typeof f) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const path = { join: '/api/join', create: '/api/crews', login: '/api/login', recover: '/api/recover' }[mode];
      const body = mode === 'recover' ? { code: f.code, name: f.name, recovery: f.recovery, newPasscode: f.passcode } : f;
      const r = await api<Account & { recovery?: string }>(path, body);
      const a = { token: r.token, code: r.code, crewName: r.crewName, id: r.id, name: r.name };
      await saveAccount(a);
      onJoined(a, r.recovery);
    } catch (x) { setErr((x as CrewError).message); }
    setBusy(false);
  };
  const field = (k: keyof typeof f, label: string, opts: Record<string, unknown> = {}) => (
    <label class="form-field"><span class="field-label">{label}</span><input class="input" value={f[k]} onInput={set(k)} required autocomplete="off" autocapitalize="off" spellcheck={false} {...opts} /></label>
  );
  return (
    <div class="stack">
      <div class="card">
        <h2>Train with your friends</h2>
        <p class="dim" style="margin:0">See each other’s games, leave tips on moves, and climb the Safety Level board — ranked by how rarely you hang pieces, not by rating.</p>
      </div>
      <div class="segmented wide" role="tablist">
        {([['join', 'Join a crew'], ['create', 'Start a crew'], ['login', 'Log back in']] as const).map(([m, l]) => (
          <button key={m} role="tab" aria-selected={mode === m} class={mode === m ? 'on' : ''} onClick={() => { setMode(m); setErr(''); }}>{l}</button>
        ))}
      </div>
      <form class="card stack" onSubmit={(e) => void submit(e)}>
        {mode === 'create' ? field('crewName', 'Crew name', { maxLength: 32, placeholder: 'e.g. Saturday chess' }) : field('code', 'Invite code', { maxLength: 6, placeholder: 'ABC123', style: 'text-transform:uppercase' })}
        {field('name', 'Your name', { maxLength: 24 })}
        {(mode === 'join' || mode === 'create') && field('chesscom', 'chess.com username', { maxLength: 40 })}
        {mode === 'recover' && field('recovery', 'Recovery code', { placeholder: 'abcd-efgh-jkmn' })}
        {field('passcode', mode === 'recover' ? 'New passcode' : 'Passcode', { type: 'password', minLength: 6, autocomplete: mode === 'login' ? 'current-password' : 'new-password' })}
        {err && <p class="msg bad" role="alert" style="font-size:15px">{err}</p>}
        <button class="btn block" disabled={busy}>{{ join: 'Join crew', create: 'Start crew', login: 'Log in', recover: 'Set new passcode' }[mode]}</button>
        {mode === 'login' && <button type="button" class="btn ghost small" onClick={() => setMode('recover')}>Forgot passcode?</button>}
      </form>
    </div>
  );
}

function RecoveryCard({ code, onDone }: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div class="card stack">
      <h2>Save your recovery code</h2>
      <p class="dim" style="margin:0">If you forget your passcode, this is the only way back in. It won’t be shown again.</p>
      <div class="recovery-code">{code}</div>
      <div class="row">
        <button class="btn secondary" style="flex:1" onClick={() => void navigator.clipboard?.writeText(code).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy'}</button>
        <button class="btn" style="flex:1" onClick={onDone}>I saved it</button>
      </div>
    </div>
  );
}

function CrewHome({ acct, onLeave }: { acct: Account; onLeave: () => void }) {
  const [crew, setCrew] = useState<Crew | null>(null);
  const [feed, setFeed] = useState<FeedGame[]>([]);
  const [notice, setNotice] = useState('');
  const load = async () => {
    await uploadPending();
    const c = await cached<Crew>('crew', '/api/crew');
    const f = await cached<{ games: FeedGame[] }>('feed', '/api/feed');
    if (c.error && (c.error.includes('log in') || c.error.includes('join'))) return onLeave();
    setCrew(c.data); setFeed(f.data?.games ?? []); setNotice(c.error ?? '');
  };
  useEffect(() => { void load(); }, []);
  if (!crew) return <p class="dim">{notice || 'Loading your crew…'}</p>;
  const invite = async () => {
    const text = `Join my chess crew "${crew.crew.name}" on Chess Coach: ${location.origin}/#/crew — invite code ${crew.crew.code}`;
    if (navigator.share) await navigator.share({ text }).catch(() => {});
    else await navigator.clipboard?.writeText(text);
  };
  const others = crew.members.filter((m) => m.id !== crew.me.id);
  const meRow = crew.members.find((m) => m.id === crew.me.id);
  const suggestion = [...others].sort((a, b) => Math.abs((a.rating ?? 0) - (meRow?.rating ?? 0)) - Math.abs((b.rating ?? 0) - (meRow?.rating ?? 0)))[0];
  return (
    <div class="stack crew">
      {notice && <p class="dim" role="status">{notice}</p>}
      <div class="card row between">
        <div><h2 style="margin:0">{crew.crew.name}</h2><span class="dim">Invite code <strong class="code">{crew.crew.code}</strong></span></div>
        <button class="btn secondary small" onClick={() => void invite()}>Invite</button>
      </div>

      <section class="card" aria-labelledby="board-title">
        <h2 id="board-title">Safety Level</h2>
        <p class="dim small-print" style="margin-top:-4px">Based on pieces hung in your last 10 rapid games. Careful beats strong.</p>
        <ol class="board-list">
          {crew.members.map((m, i) => (
            <li key={m.id} class={m.id === crew.me.id ? 'me' : ''}>
              <span class="rank">{m.level === null ? '–' : i + 1}</span>
              <span class="who"><strong>{m.name}</strong><small class="dim">{m.level === null ? `Calibrating · ${m.games}/5 games` : `${one(m.hpg)} hung/game · ${Math.round(m.zeroHangPct * 100)}% clean games`}</small></span>
              <span class={`level ${m.level === null ? 'cal' : ''}`} aria-label={m.level === null ? 'No level yet' : `Level ${m.level}`}>{m.level ?? '?'}</span>
            </li>
          ))}
        </ol>
      </section>

      <section class="card">
        <h2>This week’s quest</h2>
        <p class="dim" style="margin:-4px 0 10px">{crew.quest.title}.</p>
        <div class="quest">
          {crew.members.map((m) => (
            <span key={m.id} class={`quest-dot ${crew.quest.done[m.id] ? 'on' : ''}`} title={m.name}>
              <span aria-hidden="true">{crew.quest.done[m.id] ? '✓' : ''}</span><small>{m.name}</small>
            </span>
          ))}
        </div>
      </section>

      {others.length > 0 && (
        <section class="card">
          <h2>Rival</h2>
          {crew.rival ? (
            <p style="margin:0 0 8px">You vs <strong>{crew.rival.name}</strong>: {crew.rival.record.wins}–{crew.rival.record.losses}{crew.rival.record.draws ? `–${crew.rival.record.draws}` : ''}
              {crew.rival.record.cleanOff && <span class="dim"> · fewer hung pieces wins when ratings are far apart</span>}</p>
          ) : <p class="dim" style="margin:0 0 8px">Pick a friend near your rating and play 15|10 games on chess.com. Games against them count here.</p>}
          <select class="input" aria-label="Rival" value={crew.me.rivalId ?? ''} onChange={async (e) => { await api('/api/rival', { rivalId: (e.target as HTMLSelectElement).value || null }); void load(); }}>
            <option value="">{crew.rival ? 'No rival' : 'Choose a rival…'}</option>
            {others.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === suggestion?.id ? ' (closest rating)' : ''}</option>)}
          </select>
        </section>
      )}

      <Recap recap={crew.recap} crewName={crew.crew.name} />

      <section>
        <h2>Recent games</h2>
        {feed.length === 0 && <p class="dim">No analysed rapid games yet. They show up here after the app analyses them on each phone.</p>}
        <ul class="feed">
          {feed.map((g) => (
            <li key={g.memberId + g.url}>
              <a class="card feed-item" href={gameHref(g.memberId, g.url)}>
                <span class="feed-top"><strong>{g.memberName}</strong> <span class={`res ${g.result}`}>{{ win: 'won', loss: 'lost', draw: 'drew' }[g.result] ?? g.result}</span> vs {g.oppName} ({g.oppRating})<span class="dim"> · {date(g.endTime)}</span></span>
                <span class="stat-line">
                  <span class={g.hangs ? 'bad' : 'good'}>{g.hangs} hung</span>
                  <span>{g.freeMissed} missed</span>
                  {g.clockUsed !== null && <span>{Math.round(g.clockUsed * 100)}% clock</span>}
                  {g.hidden ? <span class="dim">hidden</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <button class="btn ghost small" onClick={onLeave}>Log out of crew on this device</button>
    </div>
  );
}

function Recap({ recap, crewName }: { recap: Crew['recap']; crewName: string }) {
  if (!recap.lines.length) return null;
  const isMonday = new Date().getDay() === 1;
  const text = [`${crewName} — week of ${recap.week}`, ...recap.lines.map((l) => `${l.name}: ${l.games} games, ${one(l.hpg)} hung/game`),
    recap.mostImproved ? `Most improved: ${recap.mostImproved}` : '', recap.cleanest ? `Cleanest game: ${recap.cleanest.member} (${recap.cleanest.ownMoves} moves, nothing hung)` : '']
    .filter(Boolean).join('\n');
  return (
    <section class={`card ${isMonday ? 'recap-new' : ''}`}>
      <div class="row between"><h2 style="margin:0">{isMonday ? 'Monday recap' : 'Last week'}</h2>
        <button class="btn secondary small" onClick={() => void (navigator.share ? navigator.share({ text }).catch(() => {}) : navigator.clipboard?.writeText(text))}>Share</button></div>
      <ul class="recap-lines">{recap.lines.map((l) => <li key={l.name}><span>{l.name}</span><span class="dim">{l.games} games · {one(l.hpg)} hung/game</span></li>)}</ul>
      {recap.mostImproved && <p style="margin:6px 0 0">Most improved: <strong>{recap.mostImproved}</strong></p>}
      {recap.cleanest && <p style="margin:4px 0 0">Cleanest game: <strong>{recap.cleanest.member}</strong>, {recap.cleanest.ownMoves} moves without hanging anything</p>}
    </section>
  );
}
