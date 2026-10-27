import { Chess, type Move } from 'chess.js';
import { bestCapture, findHangs, pieceValue } from '../chess/material';
import { moveToUci, play } from '../chess/rules';
import { judgeDrop, winningChances, type Score } from '../chess/wc';
import type { EngineClient } from '../engine/client';
import type { GameAnalysis, GameRecord, PlyAnalysis } from '../store/types';
import { explain, labelMistake } from './classify';
import { gameStats } from './stats';

export const ANALYSIS_NODES = 200_000;

const historyCache = new Map<string, Move[]>();
export function movesOf(g: GameRecord): Move[] {
  let h = historyCache.get(g.url);
  if (!h) {
    const c = new Chess();
    c.loadPgn(g.pgn);
    h = c.history({ verbose: true });
    historyCache.set(g.url, h);
  }
  return h;
}

const ownPlies = (g: GameRecord) => movesOf(g).map((m, i) => (m.color === g.myColor ? i : -1)).filter((i) => i >= 0);

export function newAnalysis(g: GameRecord, nodes = ANALYSIS_NODES): GameAnalysis {
  const own = ownPlies(g);
  const a: GameAnalysis = {
    url: g.url, engine: 'sf19-lite', nodes, plies: [], done: own.length === 0, nextPly: own[0] ?? 0,
    stats: { ownMoves: own.length, hangs: 0, pawnHangs: 0, freeMissed: 0, clockUsedPct: null },
  };
  if (a.done) a.stats = gameStats(a, g.pgn, g.myColor, 0);
  return a;
}

/** After a capture, the recapture on the same square is a trade: only the difference counts as hung. */
export function netHang(mv: { to: string; captured?: string }, h: { square: string; value: number } | null) {
  if (!h || h.square !== mv.to || !mv.captured) return h;
  const value = h.value - pieceValue(mv.captured as Parameters<typeof pieceValue>[0]);
  return value > 0 ? { square: h.square, value } : null;
}

const flip = (s: Score): Score => (s.mate !== undefined ? { mate: -s.mate } : { cp: -(s.cp ?? 0) });

/** Analyses one of the player's own moves and returns the updated record (nextPly advanced). */
export async function analyseNextPly(g: GameRecord, a: GameAnalysis, engine: EngineClient): Promise<GameAnalysis> {
  if (a.done) return a;
  const moves = movesOf(g);
  const mv = moves[a.nextPly];
  const played = moveToUci(mv);
  const [bestLine] = await engine.analyse(mv.before, { nodes: a.nodes });
  const own = ownPlies(g);
  const next = own.find((i) => i > a.nextPly);
  if (!bestLine) return { ...a, nextPly: next ?? a.nextPly + 1, done: next === undefined }; // engine had nothing to say; skip
  const bestScore = bestLine.score;
  const wcBest = winningChances(bestScore);
  let afterScore: Score;
  if (played === bestLine.uci) afterScore = bestScore;
  else {
    const c = new Chess(mv.after);
    if (c.isCheckmate()) afterScore = { mate: 1 };
    else if (c.isDraw() || c.isStalemate()) afterScore = { cp: 0 };
    else afterScore = flip((await engine.analyse(mv.after, { nodes: a.nodes }))[0]?.score ?? bestScore);
  }
  const wcAfter = winningChances(afterScore);
  const drop = wcBest - wcAfter;
  const verdict = judgeDrop(wcBest, wcAfter);
  const flag = verdict === 'blunder' || verdict === 'mistake' ? verdict : null;
  const sound = drop <= 0.1; // a sacrifice the engine agrees with is not a hang
  const h = netHang(mv, findHangs(mv.after));
  // A piece that was already hanging after the previous move isn't a new hang.
  const prev = a.plies[a.plies.length - 1];
  const repeat = !!h && !!prev?.hang && prev.hang.square === h.square && mv.from !== h.square;
  const free = bestCapture(mv.before);
  const p: PlyAnalysis = {
    ply: a.nextPly, fenBefore: mv.before, played, best: bestLine.uci,
    wcBefore: wcBest, wcAfter, wcBest, drop, flag, label: null,
    hang: h && h.value >= 3 && !sound && !repeat ? h : null,
    pawnHang: !!h && h.value >= 1 && h.value < 3 && !sound && !repeat,
    freeMissed: !!free && free.gain >= 3 && mv.to !== free.square && !sound,
    candidates: [],
  };
  if (flag) {
    p.label = labelMistake(p, bestScore, afterScore);
    const lines = await engine.analyse(mv.before, { nodes: a.nodes, multipv: 5 });
    p.candidates = lines.map((l) => ({ uci: l.uci, wc: winningChances(l.score) }));
    if (!p.candidates.some((c) => c.uci === played)) p.candidates.push({ uci: played, wc: wcAfter });
  }
  const out: GameAnalysis = { ...a, plies: [...a.plies, p], nextPly: next ?? a.nextPly + 1, done: next === undefined };
  out.stats = gameStats(out, g.pgn, g.myColor, own.length);
  return out;
}

export async function analyseGame(g: GameRecord, engine: EngineClient, nodes = ANALYSIS_NODES): Promise<GameAnalysis> {
  let a = newAnalysis(g, nodes);
  while (!a.done) a = await analyseNextPly(g, a, engine);
  return a;
}

export { explain, play };
