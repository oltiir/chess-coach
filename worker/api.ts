import type { Db, Env } from './db';
import { headToHead, leaderboard, questDots, recap, safetyLevel } from './crew';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fail = (status: number, error: string) => json({ error }, status);

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function pbkdf2(pass: string, saltHex: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256));
}
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const inviteCode = () => [...random(6)].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const recoveryCode = () => [0, 1, 2].map(() => [...random(4)].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')).join('-');
const clean = (s: unknown, max = 24) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const nameKey = (s: string) => s.toLowerCase();

async function issueToken(db: Db, memberId: string) {
  const token = hex(random(32));
  await db.prepare('INSERT INTO tokens (hash, member_id, created_at) VALUES (?, ?, ?)').bind(await sha256(token), memberId, Date.now()).run();
  return token;
}

interface Member { id: string; crew_id: string; name: string; chesscom: string; level: number | null; rival_id: string | null }
async function auth(req: Request, db: Db): Promise<Member | null> {
  const t = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!t) return null;
  return db.prepare('SELECT m.id, m.crew_id, m.name, m.chesscom, m.level, m.rival_id FROM tokens t JOIN members m ON m.id = t.member_id WHERE t.hash = ?')
    .bind(await sha256(t)).first<Member>();
}

async function addMember(db: Db, crewId: string, b: Record<string, unknown>) {
  const name = clean(b.name);
  const chesscom = clean(b.chesscom, 40);
  const pass = String(b.passcode ?? '');
  if (!name || !chesscom) return fail(400, 'Name and chess.com username are needed.');
  if (pass.length < 6) return fail(400, 'Passcode needs at least 6 characters.');
  if (await db.prepare('SELECT 1 FROM members WHERE crew_id = ? AND name_key = ?').bind(crewId, nameKey(name)).first())
    return fail(409, 'That name is taken in this crew.');
  const salt = hex(random(16));
  const recovery = recoveryCode();
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO members (id, crew_id, name, name_key, chesscom, pass_hash, pass_salt, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, crewId, name, nameKey(name), chesscom, await pbkdf2(pass, salt), salt, await sha256(recovery), Date.now()).run();
  return { id, name, recovery, token: await issueToken(db, id) };
}

const WINDOW = 15 * 60_000;
async function tooManyFailures(db: Db, key: string) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE key = ? AND ts > ?').bind(key, Date.now() - WINDOW).first<{ n: number }>();
  return (r?.n ?? 0) >= 10;
}

/** Recomputes a member's Safety Level from their last 10 analysed games (hidden ones count: it's their habit). */
async function refreshLevel(db: Db, m: { id: string; level: number | null }) {
  const { results } = await db.prepare('SELECT hangs FROM games WHERE member_id = ? ORDER BY end_time DESC LIMIT 10').bind(m.id).all<{ hangs: number }>();
  const level = results.length < 5 ? null : safetyLevel(results.reduce((a, g) => a + g.hangs, 0) / results.length, m.level);
  await db.prepare('UPDATE members SET level = ? WHERE id = ?').bind(level, m.id).run();
  return level;
}

export async function handle(req: Request, env: Env): Promise<Response> {
  const { DB: db } = env;
  const url = new URL(req.url);
  const path = url.pathname;
  const body = req.method === 'POST' ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};

  if (path === '/api/crews' && req.method === 'POST') {
    const crewName = clean(body.crewName, 32) || 'My crew';
    const id = crypto.randomUUID();
    let code = inviteCode();
    while (await db.prepare('SELECT 1 FROM crews WHERE code = ?').bind(code).first()) code = inviteCode();
    await db.prepare('INSERT INTO crews (id, name, code, created_at) VALUES (?, ?, ?, ?)').bind(id, crewName, code, Date.now()).run();
    const m = await addMember(db, id, body);
    return m instanceof Response ? m : json({ ...m, code, crewName });
  }
  if (path === '/api/join' && req.method === 'POST') {
    const crew = await db.prepare('SELECT id, name, code FROM crews WHERE code = ?').bind(clean(body.code, 6).toUpperCase()).first<{ id: string; name: string; code: string }>();
    if (!crew) return fail(404, 'No crew with that code.');
    const m = await addMember(db, crew.id, body);
    return m instanceof Response ? m : json({ ...m, code: crew.code, crewName: crew.name });
  }
  if ((path === '/api/login' || path === '/api/recover') && req.method === 'POST') {
    const code = clean(body.code, 6).toUpperCase();
    const key = `${code}:${nameKey(clean(body.name))}`;
    if (await tooManyFailures(db, key)) return fail(429, 'Too many tries. Wait 15 minutes.');
    const m = await db.prepare('SELECT m.id, m.name, m.pass_hash, m.pass_salt, m.recovery_hash, c.code, c.name AS crew_name FROM members m JOIN crews c ON c.id = m.crew_id WHERE c.code = ? AND m.name_key = ?')
      .bind(code, nameKey(clean(body.name))).first<{ id: string; name: string; pass_hash: string; pass_salt: string; recovery_hash: string; code: string; crew_name: string }>();
    const ok = m && (path === '/api/login'
      ? (await pbkdf2(String(body.passcode ?? ''), m.pass_salt)) === m.pass_hash
      : (await sha256(String(body.recovery ?? '').trim().toLowerCase())) === m.recovery_hash);
    if (!m || !ok) {
      await db.prepare('INSERT INTO login_failures (key, ts) VALUES (?, ?)').bind(key, Date.now()).run();
      return fail(401, path === '/api/login' ? 'Name or passcode is wrong.' : 'Name or recovery code is wrong.');
    }
    if (path === '/api/recover') {
      const pass = String(body.newPasscode ?? '');
      if (pass.length < 6) return fail(400, 'Passcode needs at least 6 characters.');
      const salt = hex(random(16));
      await db.prepare('UPDATE members SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(await pbkdf2(pass, salt), salt, m.id).run();
    }
    return json({ id: m.id, name: m.name, code: m.code, crewName: m.crew_name, token: await issueToken(db, m.id) });
  }

  const me = await auth(req, db);
  if (!me) return fail(401, 'Please join or log in to your crew.');

  if (path === '/api/games' && req.method === 'POST') {
    const games = Array.isArray(body.games) ? body.games.slice(0, 200) : [];
    for (const g of games as Record<string, any>[]) {
      const s = g.stats ?? {};
      await db.prepare(`INSERT INTO games (member_id, crew_id, url, end_time, result, my_color, my_rating, opp_rating, opp_name, moves, hangs, own_moves, free_missed, clock_used, plies)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (member_id, url) DO UPDATE SET end_time = excluded.end_time, result = excluded.result, my_rating = excluded.my_rating,
          opp_rating = excluded.opp_rating, opp_name = excluded.opp_name, moves = excluded.moves, hangs = excluded.hangs,
          own_moves = excluded.own_moves, free_missed = excluded.free_missed, clock_used = excluded.clock_used, plies = excluded.plies`)
        .bind(me.id, me.crew_id, String(g.url).slice(0, 200), +g.endTime || 0, String(g.result), g.myColor === 'b' ? 'b' : 'w', +g.myRating || 0,
          +g.oppRating || 0, clean(g.oppName, 40), String(g.moves ?? '').slice(0, 4000), +s.hangs || 0, +s.ownMoves || 0, +s.freeMissed || 0,
          s.clockUsedPct ?? null, JSON.stringify(Array.isArray(g.plies) ? g.plies.slice(0, 60) : []))
        .run();
    }
    return json({ saved: games.length, level: await refreshLevel(db, me) });
  }
  if (path === '/api/games/hide' && req.method === 'POST') {
    await db.prepare('UPDATE games SET hidden = ? WHERE member_id = ? AND url = ?').bind(body.hidden ? 1 : 0, me.id, String(body.url)).run();
    return json({ ok: true });
  }
  if (path === '/api/feed') {
    const { results } = await db.prepare(`SELECT g.member_id AS memberId, m.name AS memberName, g.url, g.end_time AS endTime, g.result, g.my_color AS myColor,
        g.my_rating AS myRating, g.opp_rating AS oppRating, g.opp_name AS oppName, g.hangs, g.free_missed AS freeMissed, g.clock_used AS clockUsed,
        g.own_moves AS ownMoves, g.hidden
      FROM games g JOIN members m ON m.id = g.member_id
      WHERE g.crew_id = ? AND (g.hidden = 0 OR g.member_id = ?) ORDER BY g.end_time DESC LIMIT 30`).bind(me.crew_id, me.id).all();
    return json({ games: results });
  }
  if (path === '/api/game') {
    const g = await db.prepare(`SELECT g.*, m.name AS member_name FROM games g JOIN members m ON m.id = g.member_id
      WHERE g.member_id = ? AND g.url = ? AND g.crew_id = ? AND (g.hidden = 0 OR g.member_id = ?)`)
      .bind(url.searchParams.get('member'), url.searchParams.get('url'), me.crew_id, me.id).first<Record<string, any>>();
    if (!g) return fail(404, 'Game not found.');
    const { results: notes } = await db.prepare(`SELECT n.ply, n.text, n.arrow, n.created_at AS createdAt, a.name AS author FROM notes n JOIN members a ON a.id = n.author_id
      WHERE n.owner_id = ? AND n.url = ? AND n.crew_id = ? ORDER BY n.created_at`).bind(g.member_id, g.url, me.crew_id).all();
    return json({
      memberId: g.member_id, memberName: g.member_name, url: g.url, endTime: g.end_time, result: g.result, myColor: g.my_color,
      myRating: g.my_rating, oppRating: g.opp_rating, oppName: g.opp_name, moves: g.moves, hangs: g.hangs, freeMissed: g.free_missed,
      clockUsed: g.clock_used, ownMoves: g.own_moves, plies: JSON.parse(g.plies), hidden: !!g.hidden, notes,
    });
  }
  if (path === '/api/notes' && req.method === 'POST') {
    const text = String(body.text ?? '').trim();
    if (!text || text.length > 140) return fail(400, 'Notes are 1–140 characters.');
    const g = await db.prepare('SELECT 1 FROM games WHERE member_id = ? AND url = ? AND crew_id = ?').bind(String(body.owner), String(body.url), me.crew_id).first();
    if (!g) return fail(404, 'Game not found.');
    const arrow = typeof body.arrow === 'string' && /^[a-h][1-8][a-h][1-8]$/.test(body.arrow) ? body.arrow : null;
    await db.prepare('INSERT INTO notes (id, crew_id, owner_id, url, ply, author_id, text, arrow, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), me.crew_id, String(body.owner), String(body.url), Number(body.ply) || 0, me.id, text, arrow, Date.now()).run();
    return json({ ok: true });
  }
  if (path === '/api/rival' && req.method === 'POST') {
    const rival = body.rivalId ? await db.prepare('SELECT id FROM members WHERE id = ? AND crew_id = ?').bind(String(body.rivalId), me.crew_id).first<{ id: string }>() : null;
    await db.prepare('UPDATE members SET rival_id = ? WHERE id = ?').bind(rival?.id ?? null, me.id).run();
    return json({ ok: true });
  }
  if (path === '/api/crew') {
    const crew = await db.prepare('SELECT name, code FROM crews WHERE id = ?').bind(me.crew_id).first<{ name: string; code: string }>();
    const { results: members } = await db.prepare('SELECT id, name, chesscom, level, rival_id FROM members WHERE crew_id = ? ORDER BY created_at').bind(me.crew_id).all<Member>();
    const { results: games } = await db.prepare(`SELECT member_id AS memberId, url, end_time AS endTime, result, hangs, own_moves AS ownMoves,
        clock_used AS clockUsedPct, opp_name AS oppName, opp_rating AS oppRating, my_rating AS myRating
      FROM games WHERE crew_id = ? AND end_time > ? ORDER BY end_time DESC`).bind(me.crew_id, Date.now() - 120 * 86_400_000).all<any>();
    const by = (id: string) => games.filter((g) => g.memberId === id);
    const rows = members.map((m) => {
      const last = by(m.id).slice(0, 10);
      return { id: m.id, name: m.name, level: m.level, hpg: last.length ? last.reduce((a, g) => a + g.hangs, 0) / last.length : 0, games: last.length,
        chesscom: m.chesscom, rating: by(m.id)[0]?.myRating ?? null, zeroHangPct: last.length ? last.filter((g) => g.hangs === 0).length / last.length : 0 };
    });
    const rival = members.find((m) => m.id === me.rival_id) ?? null;
    return json({
      crew, me: { id: me.id, name: me.name, rivalId: me.rival_id },
      members: leaderboard(rows),
      quest: { title: 'Everyone plays 3 rapid games using at least half their clock', done: questDots(Object.fromEntries(members.map((m) => [m.id, by(m.id)])), Date.now()) },
      rival: rival && { id: rival.id, name: rival.name, record: headToHead(by(me.id), by(rival.id), rival.chesscom) },
      recap: recap(Object.fromEntries(members.map((m) => [m.id, { name: m.name, games: by(m.id) }])), Date.now()),
    });
  }
  return fail(404, 'Not found.');
}
