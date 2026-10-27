// A D1-shaped adapter over Node's built-in sqlite, for tests.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Db } from '../../worker/db';

export function memoryDb(): Db {
  const d = new DatabaseSync(':memory:');
  d.exec(readFileSync('worker/schema.sql', 'utf8'));
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) { args = a; return stmt; },
        async first<T>() { return (d.prepare(sql).get(...(args as never[])) as T) ?? null; },
        async all<T>() { return { results: d.prepare(sql).all(...(args as never[])) as T[] }; },
        async run() { d.prepare(sql).run(...(args as never[])); return { success: true }; },
      };
      return stmt;
    },
  };
}
