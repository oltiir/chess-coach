import type { GameRecord } from '../store/types';

interface RawSide { username: string; rating: number; result: string }
interface RawGame { url: string; end_time: number; time_class: string; time_control: string; pgn?: string; rules?: string; white: RawSide; black: RawSide }

/** Odds/handicap games start from a custom position; they don't say anything about the player's normal play. */
export const isStandard = (g: GameRecord) => (g.rules ?? 'chess') === 'chess' && !/\[SetUp "1"\]/.test(g.pgn);

const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

export function toGameRecord(raw: RawGame, username: string): GameRecord {
  const white = raw.white.username.toLowerCase() === username.toLowerCase();
  const me = white ? raw.white : raw.black;
  const opp = white ? raw.black : raw.white;
  return {
    url: raw.url,
    endTime: raw.end_time * 1000,
    timeClass: raw.time_class as GameRecord['timeClass'],
    timeControl: raw.time_control,
    myColor: white ? 'w' : 'b',
    myRating: me.rating,
    oppRating: opp.rating,
    oppName: opp.username,
    result: me.result === 'win' ? 'win' : DRAWS.has(me.result) ? 'draw' : 'loss',
    pgn: raw.pgn ?? '',
    rules: raw.rules ?? 'chess',
  };
}
