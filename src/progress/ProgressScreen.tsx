import { useEffect, useState } from 'preact/hooks';
import { subscribe } from '../background';
import { GROUPS } from '../coach/groups';
import { coachState } from '../coach/coach';
import type { Ratings } from '../coach/rating';
import { allAttempts } from '../store/attempts';
import { openDb } from '../store/db';
import { LineChart } from './charts';
import { metrics, type ProgressData, type WeekPoint } from './metrics';

const one = (v: number) => v.toFixed(1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const shortWeek = (w: string) => new Date(w).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const weekPoints = (ws: WeekPoint[], fmt: (v: number) => string) =>
  ws.map((w) => ({ x: new Date(w.week).getTime(), y: w.avg, tip: `Week of ${shortWeek(w.week)}: ${fmt(w.avg)} (${w.n} games)` }));

export function ProgressScreen() {
  const [m, setM] = useState<ProgressData | null>(null);
  const [ratings, setRatings] = useState<Ratings | null>(null);
  const [doneCount, setDoneCount] = useState(-1);
  const load = async () => {
    const db = await openDb();
    setM(metrics(await db.getAll('games'), await db.getAll('analyses'), await allAttempts(), Date.now()));
    setRatings((await coachState()).ratings);
  };
  useEffect(() => { void load(); }, [doneCount]);
  useEffect(() => subscribe((s) => { if (s.analysed && s.analysed.done !== doneCount) setDoneCount(s.analysed.done); }), [doneCount]);
  if (!m) return null;

  const h = m.hangsPerGame;
  const better = h.rolling !== null && h.prev !== null && h.rolling < h.prev;
  const worse = h.rolling !== null && h.prev !== null && h.rolling > h.prev;
  const freeLast = m.freeMissedPerGame.rolling;
  const clockLast = m.clockUsed.at(-1);
  const repeatLast = m.repeatSolveMs.at(-1);
  const repeatFirst = m.repeatSolveMs[0];

  return (
    <div class="stack progress">
      {m.analysed.total > 0 && m.analysed.done < m.analysed.total && (
        <p class="dim">Analysing your games… ({m.analysed.done}/{m.analysed.total})</p>
      )}
      {m.blitzThisWeek > 0 && (
        <div class="note">You played {m.blitzThisWeek} blitz games this week — rapid 15|10 builds the safety habit.</div>
      )}

      <section class="card hero-stat" aria-labelledby="hang-title">
        <h2 id="hang-title">Pieces hung per game</h2>
        {h.rolling === null ? (
          <p class="dim">{m.analysed.total === 0
            ? 'Play a few 15|10 rapid games on chess.com and they’ll show up here.'
            : 'Your first analysed rapid game will show up here.'}</p>
        ) : (
          <>
            <div class="big-number">
              {one(h.rolling)}
              {h.prev !== null && (
                <span class={`trend ${better ? 'good' : worse ? 'bad' : ''}`}>
                  {better ? '↓' : worse ? '↑' : '→'} from {one(h.prev)}
                </span>
              )}
            </div>
            <p class="dim">Last {h.n === 1 ? 'rapid game' : `${h.n} rapid games`} · goal: under 1</p>
            <LineChart label="Pieces hung per game, weekly average" points={weekPoints(h.weekly, one)} format={one} />
          </>
        )}
      </section>

      <div class="tiles">
        <div class="card tile">
          <div class="dim">Free pieces missed</div>
          <div class="tile-value">{freeLast === null ? '—' : one(freeLast)}</div>
          <div class="dim tile-sub">per game, last 10</div>
        </div>
        <div class="card tile">
          <div class="dim">Clock used</div>
          <div class="tile-value">{clockLast ? pct(clockLast.avg) : '—'}</div>
          <div class="dim tile-sub">{clockLast ? 'this week · slower is safer' : 'no timed games yet'}</div>
        </div>
      </div>

      {m.rapidRating.length >= 2 && (
        <section class="card">
          <h2>Rapid rating</h2>
          <div class="big-number small">{m.rapidRating.at(-1)!.rating}</div>
          <LineChart
            label="Rapid rating over time"
            points={m.rapidRating.map((r, i) => ({ x: i, y: r.rating, tip: `${new Date(r.t).toLocaleDateString('en-GB')}: ${r.rating}` }))}
            format={(v) => String(Math.round(v))}
          />
          <p class="dim">Your last {m.rapidRating.length} rapid games. Judge it over 4–6 weeks, not day to day.</p>
        </section>
      )}

      {ratings && (
        <section class="card">
          <div class="row between"><h2 style="margin:0">Puzzle rating</h2><span class="big-number small">{Math.round(ratings.global.r)}</span></div>
          <p class="dim small-print" style="margin:4px 0 8px">{ratings.placed ? 'Updated after every puzzle. ± shows how sure the estimate is.' : 'Do the placement test on Today to set this.'}</p>
          {GROUPS.map((g) => (
            <div class="group-row" key={g.key}>
              <span class="name">{g.label}</span>
              <span class="group-rating">{Math.round(ratings.groups[g.key].r)}<small>±{Math.round(ratings.groups[g.key].rd * 2)}</small></span>
            </div>
          ))}
        </section>
      )}

      <div class="tiles">
        <div class="card tile">
          <div class="dim">Repeat puzzles</div>
          <div class="tile-value">{repeatLast ? `${Math.round(repeatLast.avg / 1000)}s` : '—'}</div>
          <div class="dim tile-sub">{repeatLast && repeatFirst && repeatFirst !== repeatLast ? `median solve, was ${Math.round(repeatFirst.avg / 1000)}s` : 'median solve time'}</div>
        </div>
        <div class="card tile">
          <div class="dim">Days trained</div>
          <div class="tile-value">{m.daysTrainedThisWeek}/7</div>
          <div class="dim tile-sub">this week</div>
        </div>
      </div>
    </div>
  );
}
