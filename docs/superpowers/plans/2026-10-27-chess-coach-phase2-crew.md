# Chess Coach Phase 2 (Crew): implementation plan

> For agentic workers: executed inline with superpowers:executing-plans. Steps follow TDD.

**Goal:** the optional crew layer from the spec, §7.
- Join a crew with an invite code.
- A FACEIT-style feed of friends' rapid games, with a marked replay and "try this position".
- A Safety Level 1–10 leaderboard.
- Coach notes on moves.
- Rivals, with clean-off scoring.
- A weekly quest.
- A Monday recap.

**Architecture:** one Cloudflare Worker serves the existing static app and a small JSON API under `/api/*`.
- Both are on the same origin, so CORS is not needed.
- `run_worker_first: ["/api/*"]` routes API calls to the Worker; everything else is static assets.
- Storage is D1, bound as `DB`. The API is written against a minimal `Db` interface (`prepare().bind().first/all/run`), so unit tests run it on Node's built-in `node:sqlite`.
- The trainer still works fully offline without an account.

**Spec:** `docs/superpowers/specs/2026-10-27-chess-coach-design.md`, §7 and Constraints → Crew server.

## Global constraints
- **The crew is optional.** Without an account, nothing changes. Crew data is cached in `kv` for offline viewing.
- **Uploads that fail while offline** are retried on the next launch or sync.
- **Accounts:**
  - display name + passcode + chess.com username; no email
  - PBKDF2-SHA256, 100k iterations, 16-byte salt (WebCrypto)
  - a one-time recovery code
  - login limited to 10 attempts per name per 15 minutes
  - tokens are random 32 bytes; only their SHA-256 hash is stored
- **The PGN is not uploaded.** The UCI move list is uploaded instead (public anyway, about 400 bytes); the replay needs it. *Ruling.*
- **Rapid, standard-rules, non-odds games only.** Each member uploads only their own analysed games, with their own stat line. *Ruling:* a game between two crew members is uploaded once per member, each from their own side. Each side's own plies are different, so both are needed.
- **Never shipped:**
  - raw-Elo or volume leaderboards
  - speed modes
  - streaks
  - XP
- **Safety Level, from hangs per game (hpg) over the last 10 analysed rapid games:**

  | hpg ≤ | 0.2 | 0.4 | 0.6 | 0.8 | 1.0 | 1.3 | 1.6 | 2.0 | 2.5 | else |
  |---|---|---|---|---|---|---|---|---|---|---|
  | Level | 10 | 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 |

  - **Hysteresis:** the level changes only when hpg is past the band edge by ≥ 0.05.
  - **Calibrating:** fewer than 5 analysed games means no level.
- **Leaderboard order:**
  1. level, highest first
  2. then hpg, lowest first
  3. calibrating members last
- **Quest:** "Play 3 rapid games using at least half your clock" each ISO week (starting Monday). One dot per member, filled when that member has ≥ 3 qualifying games.
- **Rivals:** a member picks a rival; the suggestion is the closest rating.
  - **Head-to-head** comes from uploaded games whose opponent is the rival's chess.com name.
  - **If the ratings differ by more than 150:** clean-off scoring applies. The player with fewer hangs in that game wins; equal hangs falls back to the result.
- **Recap:** previous ISO week. Shown on Mondays, and in Crew as "Last week" any day.
  - Each member's line: games, hpg.
  - **Most improved:** ≥ 3 games last week. Score = 4-week baseline hpg − last-week hpg, where last week is smoothed with 3 pseudo-games at the baseline.
  - **Cleanest game:** most own moves with 0 hangs. *Ruling:* used instead of "best tactic found", because found tactics aren't recorded.
  - **Milestones:** first zero-hang game; Safety Level up.
  - **Sharing** is a text summary via `navigator.share` or copy. *Ruling:* not an image.
- **Deferred:**
  - the laptop "help analyse crew backlog" button
  - username change clean-up

## Review focus
1. Offline or server down: the Crew tab shows cached data plus a one-line notice, and uploads queue. The trainer is unaffected.
2. Wrong passcode or rate limit: a plain message, and no account enumeration beyond "name or passcode is wrong".
3. A token from another crew must never read or write that crew's data. Every query is scoped by `crew_id` taken from the token.
4. Hidden games are not visible to others, but are still counted in the member's own level (it's their habit).
5. A display name or chess.com name with odd characters, or very long, must not break the layout (escape it; clamp to 24 characters).

## Tasks
1. **Worker plus D1 schema, wired to static assets.**
   - `wrangler.jsonc`: `main`, `assets.binding`, `run_worker_first`, `d1_databases`.
   - `worker/schema.sql`.
   - `worker/db.ts`: the `Db` interface.
   - Tests: a Node sqlite adapter.
2. **Auth.** Create/join/login/recover; PBKDF2, tokens, rate limit, crew scoping. Tests: create→join→login, wrong passcode, rate limit, cross-crew isolation.
3. **Games API.** Upload (upsert own), hide, feed (crew, not hidden, newest first, 30), and game detail with notes. Tests: isolation; hidden excluded from others but counted in the owner's level.
4. **Levels, leaderboard, quest, rivals and recap,** as pure functions in `worker/crew.ts` exposed by `GET /api/crew`. Tests use exact numbers from the rules above.
5. **Notes API.** Add a note to any crew member's game ply, author-stamped, max 140 characters. Tests.
6. **Client sync** (`src/crew/api.ts`, `src/crew/sync.ts`).
   - Token in `kv`; outbox of analysed-game uploads.
   - Upload on game analysed and on launch; cache crew/feed responses.
   - Unit tests with mocked fetch.
7. **Crew UI.**
   - The Crew tab is added to the navigation, 6 items.
   - Join/create forms; leaderboard; quest dots; rival card; recap; feed.
   - Game replay `#/crew/game/<member>/<url>`: stepper, marked hangs, notes, "Try this position" (saves a local drill), "Hide this game" on own games.
   - e2e against `wrangler dev` (local D1): two browser contexts create and join a crew, upload, see each other's games, leave a note.
8. **Design review (Fable)** of the crew screens, then apply fixes.
9. **Deploy.** The user runs `npx wrangler d1 create chess-coach`, the id goes into wrangler.jsonc, the user runs `npx wrangler d1 execute chess-coach --remote --file worker/schema.sql`, then `npx wrangler deploy`. Then verify the live site.
