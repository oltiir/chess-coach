// Picks test puzzles from the shipped puzzle file by their properties, so tests survive a rebuilt puzzle set.
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const rows = readFileSync('public/data/puzzles.tsv', 'utf8').trim().split('\n').map((l) => {
  const [id, fen, moves, rating, themes] = l.split('\t');
  return { id, fen, moves: moves.split(' '), rating: +rating, themes: themes.split(' ') };
}).sort((a, b) => (a.id < b.id ? -1 : 1));

const after = (fen: string, uci: string) => { const c = new Chess(fen); c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); return c; };

/** Black to move after the setup move, mate in one, two plies. */
export const MATE = (() => {
  const p = rows.find((r) => r.fen.split(' ')[1] === 'w' && r.moves.length === 2 && r.themes.includes('mateIn1'))!;
  const pos = after(p.fen, p.moves[0]);
  const wrong = pos.moves({ verbose: true })
    .filter((m) => m.from + m.to + (m.promotion ?? '') !== p.moves[1] && !m.san.includes('#'))
    .map((m) => m.from + m.to + (m.promotion ?? ''));
  return { id: p.id, solution: p.moves[1], wrong: wrong.slice(0, 2), san: after(pos.fen(), p.moves[1]).history().at(-1)! };
})();

/** A puzzle whose first player move is a promotion. */
export const PROMO = rows.find((r) => r.moves[1]?.length === 5)!;

export const solutionOf = (id: string) => rows.find((r) => r.id === id)?.moves;
