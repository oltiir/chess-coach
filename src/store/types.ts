export type ItemKind = 'puzzle' | 'drill';

export interface Attempt {
  id: string; kind: ItemKind; itemId: string; ts: number;
  firstTry: boolean; solved: boolean; ms: number; device: string;
  theme?: string; rating?: number;
}

export interface Puzzle { id: string; fen: string; moves: string[]; rating: number; themes: string[] }

export interface GameRecord {
  url: string; endTime: number; timeClass: 'rapid' | 'daily' | 'blitz' | 'bullet';
  timeControl: string; myColor: 'w' | 'b'; myRating: number; oppRating: number;
  oppName: string; result: 'win' | 'loss' | 'draw'; pgn: string;
}

export type MistakeLabel =
  | 'hung-piece' | 'missed-free-piece' | 'missed-fork' | 'missed-pin' | 'missed-skewer'
  | 'missed-mate' | 'allowed-mate' | 'other';

export interface Candidate { uci: string; wc: number }

export interface PlyAnalysis {
  ply: number; fenBefore: string; played: string; best: string;
  wcBefore: number; wcAfter: number; wcBest: number; drop: number;
  flag: 'blunder' | 'mistake' | null; label: MistakeLabel | null;
  hang: { square: string; value: number } | null; pawnHang: boolean; freeMissed: boolean;
  candidates: Candidate[];
}

export interface GameStats {
  ownMoves: number; hangs: number; pawnHangs: number; freeMissed: number;
  clockUsedPct: number | null; alarms?: number;
}

export interface GameAnalysis {
  url: string; engine: 'sf19-lite'; nodes: number;
  plies: PlyAnalysis[]; stats: GameStats; done: boolean; nextPly: number;
}

export interface Drill {
  id: string; fen: string; best: string; played: string; candidates: Candidate[];
  label: MistakeLabel; explanation: string; source: 'chesscom' | 'bot'; createdAt: number;
  context: string;
}

export interface Settings { username: string; botElo: number | null; alarm: boolean; puzzleSeed: number }
export const DEFAULT_SETTINGS: Settings = { username: 'Oltii05', botElo: null, alarm: true, puzzleSeed: 700 };
