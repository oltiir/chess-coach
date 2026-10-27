// Serves the static app and the crew API (/api/*) from one origin.
import { handle } from './api';
import type { Env } from './db';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handle(req, env); } catch (e) {
        console.error(e);
        return new Response(JSON.stringify({ error: 'Something went wrong on the server.' }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    }
    return env.ASSETS!.fetch(req);
  },
};
