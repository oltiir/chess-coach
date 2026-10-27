/** The slice of Cloudflare D1 the API uses (tests back it with node:sqlite). */
export interface Stmt {
  bind(...args: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Db { prepare(sql: string): Stmt }
export interface Env { DB: Db; ASSETS?: { fetch(req: Request): Promise<Response> } }
