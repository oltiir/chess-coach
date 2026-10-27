import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Attempt, Drill, GameAnalysis, GameRecord, Puzzle } from './types';

interface Schema extends DBSchema {
  attempts: { key: string; value: Attempt; indexes: { itemId: string } };
  puzzles: { key: string; value: Puzzle; indexes: { rating: number; themes: string } };
  games: { key: string; value: GameRecord };
  analyses: { key: string; value: GameAnalysis };
  drills: { key: string; value: Drill };
  kv: { key: string; value: unknown };
}

export type DB = IDBPDatabase<Schema>;
let dbp: Promise<DB> | null = null;

export function openDb(): Promise<DB> {
  dbp ??= openDB<Schema>('chess-coach', 1, {
    upgrade(db) {
      db.createObjectStore('attempts', { keyPath: 'id' }).createIndex('itemId', 'itemId');
      const p = db.createObjectStore('puzzles', { keyPath: 'id' });
      p.createIndex('rating', 'rating');
      p.createIndex('themes', 'themes', { multiEntry: true });
      db.createObjectStore('games', { keyPath: 'url' });
      db.createObjectStore('analyses', { keyPath: 'url' });
      db.createObjectStore('drills', { keyPath: 'id' });
      db.createObjectStore('kv');
    },
  });
  return dbp;
}

export async function closeDb() {
  if (dbp) (await dbp).close();
  dbp = null;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await openDb()).get('kv', key) as Promise<T | undefined>;
}

export async function kvSet(key: string, value: unknown) {
  await (await openDb()).put('kv', value, key);
}
