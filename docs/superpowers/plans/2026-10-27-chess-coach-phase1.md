# Chess Coach Phase 1 (personal trainer): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an offline-first PWA chess trainer for one player (chess.com `Oltii05`). It covers:
- daily sessions of themed puzzles and drills built from the player's own mistakes
- a human-like bot with a blunder alarm
- progress tracking built around pieces hung per rapid game

The trainer is deployed to Cloudflare Pages.

**Architecture:**
- **Single-page app:** Preact, TypeScript and Vite, with hash routes.
- **Main data copy:** IndexedDB.
- **Progress is an append-only attempt log.** Schedules, mastery and stats are always derived from that log, never stored as mutable state.
- **Off the UI thread:**
  - Stockfish 19 (lite, single-threaded WASM) runs in a Web Worker.
  - Maia-3 runs through onnxruntime-web.
- **Offline:** the service worker precaches everything (code, engine, model, puzzles), so the app is fully usable offline.
- **Network use:** only chess.com import touches the network.

**Tech stack** (pinned, verified on npm 2026-10-27):

| Area | Packages |
|---|---|
| Build | `vite@8.3.5`, `typescript@7.0.2`, `vite-plugin-pwa@2.0.0` |
| UI | `preact@11.1.0` |
| Storage | `idb@8.0.4` |
| Chess | `chess.js@1.4.0`, `@lichess-org/chessground@10.5.0`, `stockfish@19.0.1` (files `bin/stockfish-19-lite-single.{js,wasm}`) |
| Bot | `onnxruntime-web@1.31.1` |
| Testing | `vitest@5.0.5`, `fake-indexeddb@6.2.6`, `@playwright/test@1.64.1` (Chromium is already installed) |

**Spec:** `docs/superpowers/specs/2026-10-27-chess-coach-design.md`. Read it before starting. Phase 2 (Crew) gets its own plan after Phase 1 ships.

## Global constraints

- **Works fully offline after the first load.** Only chess.com import uses the network. Training never needs a connection.
- **iPhone Safari home-screen app, iOS 17+.** It must also work as a normal website on desktop.
- **The first-install download is about 25 MB or less.** Never ship the 99 MB full Stockfish build.
- **Engines never block the UI thread.** Stockfish runs in a Web Worker and restarts on `visibilitychange` when it becomes visible.
- **Winning chances:** `wc = 2/(1+exp(-0.00368208·cp)) - 1`, with cp clamped to ±1000.
  - A drop of ≥0.3 is a blunder, ≥0.2 a mistake, ≥0.1 an inaccuracy.
  - Mate-for scores count as cp = +1000 and mate-against as cp = −1000.
- **Analysis uses a fixed node count, `ANALYSIS_NODES = 200_000`, never a time limit.** That makes results deterministic, which Phase 2 relies on.
- **Every drill and puzzle makes the player try first.** The answer is never shown before an attempt.
- **When the classifier is unsure, use the plain label:** "This lost material. Best was X."
- **No streaks, no guilt copy, no XP, no speed scoring.**
- **Analyse and drill only rapid and daily games.** Blitz games are imported for counts and rating only.
- **Default chess.com username:** `Oltii05`.
- **Accounts, servers and secrets:**
  - No accounts and no server in Phase 1.
  - Never commit tokens. Deploy only `dist/`.
  - Keep the Cloudflare token outside the repo.
- **Licences:** GPL-3 (Stockfish, chessground) and AGPL-3 (Maia-3). The repo is public: https://github.com/oltiir/chess-coach.
- **Viewports every UI task checks:**
  - 390×844 (iPhone)
  - 375×667 (small iPhone)
  - 1440×900 (desktop)
  - light and dark mode for each
- **Touch targets** are at least 44×44 px.
- **Navigation:** at most one tap from anywhere to Today, Puzzles, Play or Progress.

## Review focus

1. **iOS suspends or kills the app mid-session or mid-analysis.**
   - Expected: no attempt is lost or double-counted, and analysis resumes at the next unanalysed position.
   - Covered by tests in Tasks 2, 7 and 11.
2. **chess.com is unavailable** (offline, unknown username, HTTP 429/5xx, or zero rapid games).
   - Expected: a clear one-line message, and the rest of the app works normally.
   - Covered by tests in Task 10.
3. **Special moves inside puzzle and drill solutions:** promotion, castling, en passant, and an alternative mate on the final move.
   - Expected: the right move is accepted, any mate-in-one is accepted on a mating move, and the promotion picker works.
   - Covered by tests in Tasks 4 and 6.
4. **Importing the same export twice, or an older export.**
   - Expected: no duplicates, and stats are unchanged by a repeat import.
   - Covered by tests in Task 2.
5. **Black-to-move positions on a 375×667 screen.**
   - Expected: the board is oriented for the player and the whole board plus controls fit without page scroll.
   - Covered by tests in Tasks 6 and 14.

---

## File structure

```
index.html
vite.config.ts               PWA plugin, precache, wasm/onnx asset handling
public/
  manifest icons, apple-touch-icon.png
  engine/stockfish-19-lite-single.{js,wasm}   (copied by scripts/copy-assets.mjs)
  models/maia3-5m.fp16.onnx                   (downloaded by scripts/fetch-model.mjs)
  data/puzzles.tsv                            (generated by scripts/build-puzzles.mjs, committed)
scripts/
  build-puzzles.mjs          Lichess CSV.zst -> filtered puzzles.tsv
  copy-assets.mjs            copy Stockfish lite + ort wasm into public/
  fetch-model.mjs            download Maia-3 5M fp16 (gitignored output)
  check-size.mjs             fail if the precache total is over 25 MB
src/
  main.tsx, app.tsx          shell, router, tab bar / side nav
  ui/                        theme tokens (theme.css), Button, Card, Sheet, TabBar, SafetyCheckCard
  chess/
    board.tsx                chessground wrapper (orientation, legal dests, promotion picker)
    rules.ts                 chess.js helpers: uciToMove, legalDests, sideToMove
    material.ts              pieceValue, staticExchange, findHangs
    wc.ts                    winningChances, judgeDrop
  store/
    db.ts                    idb schema + open
    types.ts                 shared types (below)
    attempts.ts              logAttempt, allAttempts
    exportImport.ts          exportAll, importMerge
  puzzles/
    load.ts                  first-run load of puzzles.tsv into IndexedDB
    ladder.ts                THEME_LADDER, themeStatus
    schedule.ts              dueItems (spaced repetition from attempts)
    select.ts                pickNewPuzzles (adaptive band)
    PuzzleScreen.tsx, PuzzleSolver.tsx
  today/
    session.ts               buildSession
    TodayScreen.tsx
  engine/
    stockfish.worker.ts      wraps the Stockfish script in a worker
    client.ts                EngineClient (UCI over postMessage)
  import/
    chesscom.ts              fetchArchives, fetchMonth, toGameRecord
    sync.ts                  syncGames
  analysis/
    analyseGame.ts           per-ply evaluation -> GameAnalysis
    classify.ts              labelMistake, explain
    stats.ts                 gameStats, clockUsedPct
    queue.ts                 resumable analysis job runner
  drills/
    makeDrills.ts, DrillSolver.tsx
  bot/
    maiaTokens.ts            board -> tokens, move vocab (port of CSSLab/maia3)
    maia.ts                  MaiaBot
    humanSf.ts               fallback bot
    PlayScreen.tsx, alarm.ts
  progress/
    metrics.ts               all derived series
    charts.tsx               small SVG line/bar components
    ProgressScreen.tsx
  settings/SettingsScreen.tsx
tests/        vitest unit tests mirroring src/
e2e/          Playwright specs (projects: iphone 390x844, small 375x667, desktop 1440x900)
```

## Shared types (`src/store/types.ts`, defined in Task 2, used everywhere)

```ts
export type ItemKind = 'puzzle' | 'drill';
export interface Attempt { id: string; kind: ItemKind; itemId: string; ts: number;
  firstTry: boolean; solved: boolean; ms: number; device: string; theme?: string; rating?: number }
export interface Puzzle { id: string; fen: string; moves: string[]; rating: number; themes: string[] }
export interface GameRecord { url: string; endTime: number; timeClass: 'rapid'|'daily'|'blitz'|'bullet';
  timeControl: string; myColor: 'w'|'b'; myRating: number; oppRating: number;
  result: 'win'|'loss'|'draw'; pgn: string }
export type MistakeLabel = 'hung-piece'|'missed-free-piece'|'missed-fork'|'missed-pin'|'missed-skewer'
  |'missed-mate'|'allowed-mate'|'other';
export interface PlyAnalysis { ply: number; fenBefore: string; played: string; best: string;
  wcBefore: number; wcAfter: number; wcBest: number; drop: number;
  flag: 'blunder'|'mistake'|null; label: MistakeLabel|null;
  hang: { square: string; value: number } | null; pawnHang: boolean; freeMissed: boolean;
  candidates: { uci: string; wc: number }[] }        // MultiPV 5 at fenBefore, for flagged plies only
export interface GameStats { ownMoves: number; hangs: number; pawnHangs: number; freeMissed: number;
  clockUsedPct: number | null; alarms?: number }
export interface GameAnalysis { url: string; engine: 'sf19-lite'; nodes: number;
  plies: PlyAnalysis[]; stats: GameStats; done: boolean; nextPly: number }
export interface Drill { id: string /* `${url}#${ply}` or `bot:${gameId}#${ply}` */; fen: string;
  best: string; played: string; candidates: { uci: string; wc: number }[];
  label: MistakeLabel; explanation: string; source: 'chesscom'|'bot'; createdAt: number }
```

---

### Task 1: App shell, navigation, theme, and the test setup

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/app.tsx`, `src/ui/theme.css`, `src/ui/TabBar.tsx`, `playwright.config.ts`, `e2e/shell.spec.ts`, `.gitignore`, `README.md`

**Interfaces:**
- Produces:
  - `route` signal values: `'today'|'puzzles'|'play'|'progress'|'settings'`, read from `location.hash`
  - CSS tokens in `theme.css`
  - Playwright projects `iphone`, `small`, `desktop`

- [ ] **Step 1: Scaffold the project with the pinned versions.**
  - `npm run dev`, `build`, `test` (vitest), and `e2e` (playwright).
  - `.gitignore`: `node_modules`, `dist`, `public/models/*.onnx`, `.wrangler`, `.env*`.
  - README: what the app is, how to run it, and the licences.
- [ ] **Step 2: Write `e2e/shell.spec.ts`.**
  - On each project, visit `/`. Expect the Today screen. The nav shows Today, Puzzles, Play and Progress, plus Settings reachable in one tap.
  - Clicking each tab changes the `#/` route and heading.
  - On `iphone` and `small`, the nav is a bottom tab bar. On `desktop` it is a left side nav.
  - `document.scrollingElement.scrollWidth <= innerWidth`.
- [ ] **Step 3: Run `npx playwright test e2e/shell.spec.ts`.** Expected: FAIL (no app).
- [ ] **Step 4: Implement the shell.**
  - Hash router, five placeholder screens, the TabBar, and the theme.
  - The theme has colour tokens on `:root`, a dark override under `@media (prefers-color-scheme: dark)`, and an explicit `body` background.
  - iOS safe-area insets (`env(safe-area-inset-bottom)`) apply to the tab bar.
- [ ] **Step 5: Run the e2e again.** Expected: PASS on all 3 projects.
- [ ] **Step 6: Commit:** `feat: app shell with responsive navigation`.

### Task 2: Storage, attempt log, and export/import merge

**Files:**
- Create: `src/store/{types,db,attempts,exportImport}.ts`, `tests/store/*.test.ts`

**Interfaces:**
- Produces:
  - `openDb(): Promise<IDBPDatabase<Schema>>`. Object stores:
    - `attempts` (key `id`, index `itemId`)
    - `puzzles` (key `id`, indexes `rating`, `themes` multiEntry)
    - `games` (key `url`)
    - `analyses` (key `url`)
    - `drills` (key `id`)
    - `kv` (key string)
  - `logAttempt(a: Omit<Attempt,'id'|'device'>): Promise<Attempt>`. Generates a uuid with `crypto.randomUUID()` and stamps the device id, which is a uuid stored in `kv`.
  - `allAttempts(): Promise<Attempt[]>`
  - `exportAll(): Promise<ExportFile>`, where `ExportFile` is `{ version: 1, exportedAt, attempts, games, analyses, drills, settings }`
  - `importMerge(f: ExportFile): Promise<{ added: number }>`

- [ ] **Step 1: Write the failing tests** using `fake-indexeddb/auto`.
  - `logAttempt` persists and returns an id.
  - `importMerge` of the file's own export returns `{added: 0}`. **Review focus 4.**
  - Merging an export from another device adds only unseen ids. Analyses merge per url, keeping the one with `done: true`, or else the larger `nextPly`.
  - Importing an older export never deletes newer records.
  - A file with an unknown `version` is rejected with the error `Unsupported backup version`.
- [ ] **Step 2: Run `npx vitest run tests/store`.** Expected: FAIL.
- [ ] **Step 3: Implement the files listed above.** Settings live in `kv` under `settings`. On import they merge field by field, and existing values win.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: IndexedDB store with append-only attempts and merge import`.

### Task 3: Puzzle data, the build script, and the first-run load

**Files:**
- Create: `scripts/build-puzzles.mjs`, `src/puzzles/load.ts`, `public/data/puzzles.tsv` (generated, committed), `tests/puzzles/build.test.ts`, `tests/puzzles/load.test.ts`

**Interfaces:**
- Produces:
  - `filterRow(cols: string[]): Puzzle | null`, exported from the script for tests
  - `ensurePuzzlesLoaded(onProgress?: (n:number)=>void): Promise<number>`, which is idempotent and keyed by `kv['puzzles-version']`
- TSV columns: `id fen moves rating themes`. Moves and themes are space-separated.

- [ ] **Step 1: Write tests for `filterRow`.**
  - It keeps a row only when all of these hold:
    - rating 400–1400
    - RatingDeviation ≤ 90
    - Popularity ≥ 80
    - NbPlays ≥ 100
    - themes include at least one of `hangingPiece mateIn1 fork pin skewer backRankMate mateIn2 discoveredAttack`
  - It rejects everything else. Use 4 handcrafted CSV rows.
- [ ] **Step 2: Write tests for `ensurePuzzlesLoaded`.**
  - It loads a 3-row fixture TSV and returns 3.
  - A second call returns 3 without rewriting.
- [ ] **Step 3: Run the tests.** Expected: FAIL.
- [ ] **Step 4: Implement `build-puzzles.mjs`.**
  - Stream `https://database.lichess.org/lichess_db_puzzle.csv.zst` through `zlib.createZstdDecompress()` and split it into lines.
  - Filter with `filterRow`.
  - Sample stratified by ladder theme up to 30,000 rows: equal quota per theme, overflow redistributed.
  - Order is deterministic: sort candidates by `PuzzleId` and take every k-th.
  - Write the TSV.
  - Implement `load.ts`: fetch `/data/puzzles.tsv` and bulk-put it in one transaction.
- [ ] **Step 5: Run the script.** Expected: 30,000 rows, and `puzzles.tsv` about 2–3 MB raw. Then run the tests. Expected: PASS.
- [ ] **Step 6: Commit** (including the TSV): `feat: filtered Lichess puzzle set and first-run loader`.

### Task 4: Chess core (rules helpers, material and hang detection, winning chances, board component)

**Files:**
- Create: `src/chess/{rules,material,wc}.ts`, `src/chess/board.tsx`, `tests/chess/*.test.ts`

**Interfaces:**
- Produces:
  - `winningChances(score: {cp?: number; mate?: number}): number`
  - `judgeDrop(before: number, after: number): 'blunder'|'mistake'|'inaccuracy'|null`. Both values are from the mover's point of view.
  - `pieceValue(p: 'p'|'n'|'b'|'r'|'q'|'k'): number`, with values 1/3/3/5/9 and the king = 0 for SEE purposes.
  - `staticExchange(fen: string, captureUci: string): number`. Net material gain for the capturer in pawns, from a standard swap-off on that square.
  - `bestCapture(fen: string): { uci: string; gain: number; square: string } | null`. The capture with the highest SEE for the side to move.
  - `findHangs(fenAfterMyMove: string): { square: string; value: number } | null`, built on `bestCapture`.
  - `legalDests(fen): Map<Key, Key[]>`
  - `uciToSan(fen, uci): string`
  - `<Board fen orientation movable onMove(uci) lastMove arrows? shapes? />`. Wraps chessground. It opens a promotion picker on promotion and reports a UCI string with the promotion piece.

- [ ] **Step 1: Write the failing tests.**
  - `winningChances({cp:0})===0`, `winningChances({mate:3})≈winningChances({cp:1000})`, and `winningChances({cp:5000})===winningChances({cp:1000})`.
  - `judgeDrop(0.5,0.15)==='blunder'` and `judgeDrop(0.5,0.29)==='mistake'`.
  - **SEE cases:**

    | Position | Expected |
    |---|---|
    | Undefended knight attacked by a pawn | +3 |
    | Defended knight attacked by a pawn | `staticExchange` = +2 (N for P) |
    | Rook defended by a pawn, attacked by a queen | negative |

  - `findHangs` returns the knight square for `rnbqkb1r/pppppppp/8/8/4n3/8/PPPPQPPP/RNB1KBNR w KQkq - 0 1`. **The implementer verifies this FEN with chess.js and adjusts it to a legal position with an undefended knight attacked by the queen.**
  - `uciToSan` covers promotion, castling and en passant. **Review focus 3.**
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - SEE: generate attackers with chess.js on a cloned board. Repeatedly capture with the least valuable attacker, then take the standard negamax over the gain list.
  - Board: chessground CSS (`chessground.base.css`, `chessground.brown.css`, `chessground.cburnett.css`), restyled to the theme tokens later in Task 8.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: chess core helpers and board component`.

### Task 5: Puzzle logic (ladder, adaptive band, spaced repetition)

**Files:**
- Create: `src/puzzles/{ladder,schedule,select}.ts`, `tests/puzzles/logic.test.ts`

**Interfaces:**
- Produces:
  - `THEME_LADDER = ['hangingPiece','mateIn1','fork',['pin','skewer'],'backRankMate','mateIn2','discoveredAttack']`
  - `themeStatus(attempts: Attempt[]): { unlocked: string[]; mastered: string[]; current: string; accuracy: Record<string, number> }`
  - `bandFor(theme: string, attempts: Attempt[], seed: number): { min: number; max: number }`
  - `dueItems(attempts: Attempt[], now: number): { kind: ItemKind; itemId: string }[]`
  - `pickNewPuzzles(db, n: number, attempts: Attempt[], seed: number): Promise<Puzzle[]>`

- [ ] **Step 1: Write the failing tests with these exact rules.**
  - **Mastery:**
    - A theme is mastered when it has ≥30 first-try attempts and ≥85% first-try success over the last 30.
    - Mastering one unlocks the next ladder step.
    - `hangingPiece` is always unlocked.
  - **Band:**
    - It starts centred on `seed` (default 700; Settings can change it), with width ±150.
    - After each 10 attempts in a theme: first-try >90% → centre +50; <80% → centre −50.
    - The centre is clamped to 400–1400.
  - **Repetition:**
    - An item with a failed or not-first-try attempt is due 1, 3, 7 and then 21 days after the latest attempt, depending on the stage. The stage advances on each first-try solve and resets to 1 on a miss.
    - The item retires after two consecutive first-try solves following a miss.
  - **New puzzles:** 70% come from the current theme and 30% from mastered themes. Never pick a puzzle already attempted.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement as pure functions over `Attempt[]`.** The only exception is the DB query in `pickNewPuzzles`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: theme ladder, adaptive band and repeat schedule`.

### Task 6: Puzzle solver and Puzzles screen

**Files:**
- Create: `src/puzzles/PuzzleSolver.tsx`, `src/puzzles/PuzzleScreen.tsx`, `src/puzzles/reason.ts`, `e2e/puzzles.spec.ts`, `tests/puzzles/reason.test.ts`

**Interfaces:**
- Consumes: `Board`, `logAttempt`, `pickNewPuzzles`, `themeStatus`
- Produces:
  - `<PuzzleSolver puzzle onDone(result: {solved, firstTry, ms}) />`
  - `reasonFor(puzzle, fenAtMove, uci): string`, a one-line explanation from the theme plus `findHangs` and the attacked pieces, e.g. "Fork: your knight attacks the king and the rook."

- [ ] **Step 1: Write `e2e/puzzles.spec.ts`.**
  - Seed the DB with one known puzzle where Black is to move after the setup move.
  - Expect the board oriented for Black. **Review focus 5.**
  - The setup move animates.
  - Play a wrong move: it is rejected, a "Try again" state shows, and nothing is revealed.
  - A second wrong move reveals the move with the reason line.
  - "Replay" restarts it.
  - Solving a puzzle logs `firstTry: true`.
  - A mate-in-1 puzzle accepts any mating move. **Review focus 3.**
  - On `small`, the board and controls fit with no vertical page scroll.
- [ ] **Step 2: Write the unit tests for `reasonFor`,** covering a fork, a hanging piece, and mate-in-1 ("Checkmate: …").
- [ ] **Step 3: Run both.** Expected: FAIL.
- [ ] **Step 4: Implement the solver.**
  - Apply `moves[0]`, then the player must play each odd-index move. The opponent replies are auto-played after 300 ms.
  - Promotion goes through the Board picker.
  - The Puzzles screen shows the ladder progress, the current theme, a "Start 10 puzzles" button and free practice per unlocked theme.
- [ ] **Step 5: Run both.** Expected: PASS.
- [ ] **Step 6: Commit:** `feat: puzzle solver and puzzles screen`.

### Task 7: The Today session

**Files:**
- Create: `src/today/session.ts`, `src/today/TodayScreen.tsx`, `src/ui/SafetyCheckCard.tsx`, `tests/today/session.test.ts`, `e2e/today.spec.ts`

**Interfaces:**
- Consumes: `dueItems`, `pickNewPuzzles`, drills from the `drills` store (empty until Task 12)
- Produces:
  - `buildSession(now, attempts, drills, db): Promise<SessionItem[]>`, where `SessionItem = {kind:'drill', drill: Drill} | {kind:'puzzle', puzzle: Puzzle}`
  - Session progress persisted in `kv['session-YYYY-MM-DD']` as `{ itemIds: string[]; doneIds: string[] }`

- [ ] **Step 1: Write the unit tests.**
  - At most 3 drills come first: due drills first, then new drills, newest first.
  - Then all due puzzle repeats, then new puzzles until 10 items in total. If there are more than 10 due repeats, the session is 10 due items.
  - Calling it twice on the same day returns the same item ids from `kv`.
  - Completed items are skipped on resume. **Review focus 1.**
- [ ] **Step 2: Write `e2e/today.spec.ts`.**
  - Start the session and solve 2 items.
  - Reload the page mid-session: "Continue (2/10)" shows, and resuming starts at item 3.
  - Finishing shows a summary of solved / missed / "back tomorrow: N".
  - The safety-check card shows at the start, with exactly these three questions:
    1. "What did their last move attack?"
    2. "After my move: what checks, captures or threats do they have?"
    3. "Is anything of theirs hanging?"
  - The card is also reachable from a "Before you play on chess.com" link, which opens `https://www.chess.com/play/online` in a new tab.
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement.** Today also shows "days trained this week (x/7)", **not a streak**.
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit:** `feat: daily session with resume and safety check`.

### Task 8: Design review 1 (Today, Puzzles, shell)

**Files:**
- Create: `e2e/screens.spec.ts` (screenshot capture), `docs/design-review/` (screenshots plus notes, gitignored except `notes-*.md`)
- Modify: whatever the review requires

- [ ] **Step 1: Write `e2e/screens.spec.ts`.** It captures Today (start, mid-session, summary), Puzzles (ladder, solving, wrong-move reveal) and Settings placeholder screenshots on all 3 projects, in both `colorScheme: 'light'` and `'dark'`.
- [ ] **Step 2: Dispatch the senior frontend designer review.**
  - Use a fresh general-purpose subagent with `model: "fable"`. Tell it to load the `impeccable` skill and to read the spec's "Look and feel" section.
  - Inputs it receives:
    - the screenshots
    - the running dev server URL
    - this brief: "easy to use and navigate, good looking, easy on the eyes; used in bed at night; big touch targets; calm palette; high-contrast pieces"
  - It returns an ordered list of material fixes with exact CSS or component changes. It must not redesign beyond the brief.
- [ ] **Step 3: Apply the fixes.** Re-run `e2e/screens.spec.ts` and the earlier e2e specs. Expected: PASS. Then send the after-screenshots back to the same reviewer for one confirmation round.
- [ ] **Step 4: Commit:** `style: design review 1 fixes`. Include `docs/design-review/notes-1.md`.

### Task 9: Stockfish worker and EngineClient

**Files:**
- Create: `scripts/copy-assets.mjs`, `src/engine/stockfish.worker.ts`, `src/engine/client.ts`, `tests/engine/client.test.ts`, `e2e/engine.spec.ts`

**Interfaces:**
- Produces: `class EngineClient`, with:
  - `analyse(fen: string, opts: { nodes: number; multipv?: number }): Promise<EngineLine[]>`, where `EngineLine = { uci: string; pv: string[]; score: {cp?: number; mate?: number} }`. The score is from the point of view of the side to move. Lines are sorted best first.
  - `stop(): void`
  - `restart(): Promise<void>`
  - A singleton `getEngine()`.
  - Calls are queued and served one at a time.

- [ ] **Step 1: Write unit tests with a fake transport.**
  - The UCI parser handles `info depth .. multipv 2 score cp -35 .. pv e7e5 ..` and `score mate -2`.
  - Queued calls resolve in order.
  - `restart()` rejects in-flight calls with `EngineRestarted`.
- [ ] **Step 2: Write `e2e/engine.spec.ts`,** which loads the real worker in the browser.
  - Back-rank mate-in-1 FEN with `nodes: 50_000`: the best move is the mate, and the score is `mate: 1`.
- [ ] **Step 3: Run both.** Expected: FAIL.
- [ ] **Step 4: Implement.**
  - The worker `importScripts('/engine/stockfish-19-lite-single.js')` and relays messages.
  - Send `setoption name MultiPV value N`, then `position fen …`, then `go nodes N`.
  - `copy-assets.mjs` copies from `node_modules/stockfish/bin/`.
  - Restart the engine on `visibilitychange` → visible if it has not answered `isready` within 1 s.
- [ ] **Step 5: Run both.** Expected: PASS.
- [ ] **Step 6: Commit:** `feat: stockfish lite worker and engine client`.

### Task 10: chess.com import

**Files:**
- Create: `src/import/{chesscom,sync}.ts`, `tests/import/*.test.ts`, `tests/fixtures/chesscom-2026-10.json` (trim the real `Oltii05` October archive to 6 games: rapid, blitz and daily, wins and losses, white and black)

**Interfaces:**
- Produces:
  - `toGameRecord(raw, username): GameRecord`. Matching the username is case-insensitive. Result mapping: `win`→win; `agreed|repetition|stalemate|insufficient|50move|timevsinsufficient`→draw; otherwise loss.
  - `syncGames(username): Promise<{ added: number; error?: 'offline'|'not-found'|'rate-limited'|'server' }>`
    - Fetch archives serially, sending `If-None-Match` with the ETags stored in `kv`.
    - Only re-fetch the newest 2 months and any months never fetched.
    - Store everything, including blitz games.

- [ ] **Step 1: Write the failing tests** with a mocked `fetch`. Cover:
  - fixture → 6 records with the correct colour, ratings and result
  - a 304 adds nothing
  - a 404 on archives → `not-found`
  - a 429 → `rate-limited` with no retry storm (at most 1 retry, after 2 s)
  - `TypeError: Failed to fetch` → `offline`
  - in every error case, previously stored games remain. **Review focus 2.**
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Sync runs on launch when online and when "Sync now" is pressed in Settings. Errors show a single-line, non-blocking banner.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: chess.com game import`.

### Task 11: Game analysis, classification and stats

**Files:**
- Create: `src/analysis/{analyseGame,classify,stats,queue}.ts`, `tests/analysis/*.test.ts`, `tests/fixtures/pgn/*.pgn` (handmade short games: one clean, one with a hung knight, one with a missed free queen, one with a missed mate-in-1, and one deliberate winning sacrifice)

**Interfaces:**
- Consumes: `EngineClient` (injected; tests use a scripted fake engine that returns predetermined lines per FEN), `findHangs`, `bestCapture`, `winningChances`
- Produces:
  - `analyseNextPly(game: GameRecord, a: GameAnalysis, engine): Promise<GameAnalysis>`. Analyses one of the player's own plies and returns an updated record with `nextPly` advanced.
  - `runQueue(signal: AbortSignal): Promise<void>`. Picks games with `timeClass ∈ {rapid, daily}`, newest first. It persists after **every ply** and stops on abort or hidden.
  - `labelMistake(p: PlyAnalysis, fenBefore): MistakeLabel`
  - `explain(p: PlyAnalysis): string`
  - `gameStats(a: GameAnalysis, pgn): GameStats`

- [ ] **Step 1: Write the failing tests.** Exact rules:
  - **Per own ply:** evaluate `fenBefore` (MultiPV 1, `ANALYSIS_NODES`) and the position after the played move. wc is from the player's point of view, and `drop = wcBest - wcAfter`.
  - **flag:** `judgeDrop` gives blunder or mistake, and an inaccuracy counts as `null`.
  - **Flagged plies only:** re-run `fenBefore` with MultiPV 5 and store `candidates`.
  - **hang (spec definition):**
    - After the player's move, `findHangs` finds a capture with SEE ≥ 3.
    - It counts whether or not the opponent took it.
    - It does **not** count when `wcBest - wcAfter ≤ 0.1`: the move is a sound sacrifice.
  - **pawnHang:** SEE in [1, 3).
  - **freeMissed:** in `fenBefore`, `bestCapture` for the player has gain ≥ 3, and the played move is not a capture on that square.
  - **Label order:**
    1. `allowed-mate`: the opponent has mate after the move but did not before.
    2. `missed-mate`: the best line was mate for the player, and after the move it isn't.
    3. `hung-piece`
    4. `missed-free-piece`
    5. `missed-fork`: the best move's destination piece attacks ≥2 enemy pieces whose value is greater than the attacker's, or the king plus a piece.
    6. `missed-pin` / `missed-skewer`: the best move creates a line attack through two enemy pieces.
    7. `other`

    The rules for 5 and 6 are checked with chess.js attack maps.
  - **Explanation template for `hung-piece`:** "Your {piece} on {sq} was left undefended — {opponentSan} wins it." For `other`: "This lost material. Best was {bestSan}."
  - **clockUsedPct:** `(base + inc·ownMoves − lastOwnClock) / (base + inc·ownMoves)`, using `%clk` and `TimeControl` from the PGN. It is null for daily games.
  - **Resume:** after an aborted run the record persists with `nextPly` > 0. A new run continues from `nextPly` and never re-analyses earlier plies. **Review focus 1.**
  - **Fixture expectations:**

    | Fixture | Expected |
    |---|---|
    | Clean game | 0 hangs |
    | Hung knight | 1 hang, label `hung-piece` |
    | Free queen | `freeMissed` 1 |
    | Missed mate | `missed-mate` |
    | Sacrifice | 0 hangs |
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The queue starts 3 s after launch when the app is visible. It shows a small "Analysing your games 4/40" indicator on Progress.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: on-device game analysis, mistake labels and stats`.

### Task 12: Mistake drills

**Files:**
- Create: `src/drills/makeDrills.ts`, `src/drills/DrillSolver.tsx`, `tests/drills/*.test.ts`, `e2e/drills.spec.ts`

**Interfaces:**
- Consumes: `GameAnalysis`, `EngineClient`, `Board`, `logAttempt`
- Produces:
  - `makeDrills(a: GameAnalysis, source): Drill[]`. Every flagged ply with `label !== null` becomes one drill.
  - `acceptMove(d: Drill, uci, engine): Promise<boolean>`.
    - Accept when `uci` is among `candidates` with `wcBest − wc < 0.2`.
    - Otherwise evaluate it live (`ANALYSIS_NODES`) and apply the same rule.
  - `<DrillSolver drill onDone />`. It shows "From your game vs {opp}, {date}: find a better move", with no hints.
    - After the attempt it reveals what was played, the best move as an arrow, and the explanation.

- [ ] **Step 1: Write the tests.**
  - `makeDrills` on the hung-knight fixture analysis → 1 drill with id `${url}#${ply}`.
  - `acceptMove` accepts a candidate within the threshold and rejects the played blunder.
  - Building drills twice for the same analysis creates no duplicates.
  - e2e: a seeded drill shows the position with no answer visible. A wrong move results in "not quite", and the reveal shows only after the second try or "Show me".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Drills are created when an analysis completes. Today (Task 7) now picks them up.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: drills from your own mistakes`.

### Task 13: Maia-3 bot and fallback

**Files:**
- Create: `scripts/fetch-model.mjs`, `src/bot/{maiaTokens,maia,humanSf}.ts`, `tests/bot/*.test.ts`, `e2e/maia.spec.ts`

**Interfaces:**
- Produces:
  - `boardToTokens(fen): Float32Array` (64×12)
  - `MOVE_VOCAB: string[]` (length 4352)
  - `moveIndex(uci, blackToMove): number`
  - `interface Bot { chooseMove(fen: string, botElo: number, playerElo: number): Promise<string> }`
  - `MaiaBot implements Bot`, with `MaiaBot.load(): Promise<MaiaBot>`. Session options `{ graphOptimizationLevel: 'basic', executionProviders: ['wasm'] }`.
  - `HumanSfBot implements Bot`
  - `getBot(): Promise<Bot>` returns Maia, or HumanSf when Maia fails to load, and records which bot it used in `kv`.

- [ ] **Step 1: Port the tokenizer and move vocabulary** from https://github.com/CSSLab/maia3 (the board mirrored when Black is to move; the 4352-move vocabulary with 256 promotion entries). The file header cites the source and the AGPL-3 licence. Write unit tests:
  - `MOVE_VOCAB.length === 4352` with no duplicates.
  - The tokens for the start position have exactly 32 ones.
  - Mirroring: the tokens for the start position after `e2e4` (Black to move) equal the tokens for the start position after the mirrored move with White to move.
  - Every legal move in 5 random positions maps to a valid index.
- [ ] **Step 2: Write `e2e/maia.spec.ts`.**
  - Load the real model. Over 20 samples, Maia's top-3 moves at Elo 1100 in the start position include `e2e4` or `d2d4`.
  - `chooseMove` always returns a legal move over 50 random positions.
  - On a 390×844 Chromium page, one move takes under 1.5 s.
- [ ] **Step 3: Run both.** Expected: FAIL.
- [ ] **Step 4: Implement `MaiaBot.chooseMove`.**
  - Mask the logits to legal moves, take the softmax at temperature 1.0 and sample.
  - `botElo` is clamped to [600, 2600].
- [ ] **Step 5: Implement `HumanSfBot`.**
  - MultiPV 6 at `nodes: 20_000`. Sample with a softmax over cp/100 at temperature 1.5.
  - Never choose a move where `findHangs` reports a value ≥ 3 unless every candidate does.
  - Unit tests with the fake engine.
- [ ] **Step 6: Run all.** Expected: PASS.
- [ ] **Step 7: Commit:** `feat: maia-3 human-like bot with stockfish fallback`.

### Task 14: Play screen, blunder alarm and post-game review

**Files:**
- Create: `src/bot/PlayScreen.tsx`, `src/bot/alarm.ts`, `tests/bot/alarm.test.ts`, `e2e/play.spec.ts`

**Interfaces:**
- Consumes: `getBot`, `EngineClient`, `findHangs`, `makeDrills`
- Produces:
  - `checkMove(fenBefore, uci, engine): Promise<{ alarm: boolean; reason: 'hang'|'drop'|null }>`.
    - Alarm when `findHangs(after)` has value ≥ 3, or when the wc drop ≥ 0.3.
    - Uses `nodes: 150_000`. It must return within about 1 s.
  - Bot games are stored as `GameRecord`s with `url = bot:<uuid>`, plus a `GameAnalysis` with `stats.alarms`.

- [ ] **Step 1: Write the tests.**
  - `checkMove` flags a hung knight and passes a quiet safe move. Use the fake engine.
  - e2e with the bot and engine stubbed through `window.__testHooks`:
    - Start a game: colour (random, white or black), bot Elo (default = latest rapid rating rounded to 50, else 600), "Blunder alarm" on, clock off (with an optional 15|10 preset).
    - Making a hanging move shows a sheet with **"Look again: what can they capture after this?"** and the buttons "Rethink" and "Play it anyway". The board does not reveal the answer.
    - "Rethink" restores the position. "Play it anyway" commits.
    - With the alarm off ("Test mode"), no sheet appears.
    - Resigning or finishing the game shows a review list of flagged moves. Each has "Practise this", which creates a drill with `source:'bot'`.
    - Black-to-move orientation and the 375×667 fit. **Review focus 5.**
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The game state is persisted in `kv['bot-game']` after every move, so a killed app resumes the game.
  - Draw by repetition, stalemate, insufficient material and the 50-move rule are all detected with chess.js.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: play vs human-like bot with blunder alarm`.

### Task 15: Progress screen

**Files:**
- Create: `src/progress/{metrics,charts}.ts(x)`, `src/progress/ProgressScreen.tsx`, `tests/progress/metrics.test.ts`, `e2e/progress.spec.ts`

**Interfaces:**
- Consumes: games, analyses, attempts
- Produces: `metrics(games, analyses, attempts, now): ProgressData`, containing:
  - `hangsPerGame`: rolling average over the last 10 analysed rapid games, plus weekly points `{week, avg, n}`
  - `freeMissedPerGame`: same shape
  - `pawnHangsPerGame`
  - `rapidRating: {t, rating}[]`, from all rapid `GameRecord`s
  - `themeAccuracy: Record<theme, {firstTryPct, n}>`
  - `ladder`
  - `repeatSolveMs`: weekly median of repeat-attempt `ms`
  - `clockUsedPct`: weekly mean
  - `blitzThisWeek: number`
  - `daysTrainedThisWeek: number`

- [ ] **Step 1: Load the `dataviz` skill before writing chart code.** Write metric tests with exact numbers from small synthetic fixtures:
  - Rolling and weekly averages, with ISO weeks starting Monday.
  - Weeks with no games are absent, not 0.
  - `blitzThisWeek` counts only blitz games.
  - `daysTrainedThisWeek` counts distinct local days with any attempt.
- [ ] **Step 2: Write `e2e/progress.spec.ts`** with a seeded DB.
  - The headline tile reads "Pieces hung per game" with the value and trend arrow. Lower is better, and the trend colour follows that.
  - Rating and theme sections render.
  - The blitz note appears only when `blitzThisWeek > 0`, with the copy: "You played {n} blitz games this week — rapid 15|10 builds the safety habit."
  - With 0 analysed games: "Analysing your games… (x/y)", or, when no rapid games exist, "Play a few 15|10 rapid games on chess.com and they'll show up here."
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement.** Use hand-rolled SVG charts with no chart library.
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit:** `feat: progress screen`.

### Task 16: Settings, persistence and backup

**Files:**
- Create: `src/settings/SettingsScreen.tsx`, `e2e/settings.spec.ts`
- Modify: `src/main.tsx` (call `navigator.storage.persist()` on launch and store the result in `kv`)

**Interfaces:**
- Consumes: `exportAll`, `importMerge`, `syncGames`
- Produces: settings `{ username: string; botElo: number|null; alarm: boolean; puzzleSeed: number }`. Defaults: `Oltii05`, null (meaning auto), true, 700.

- [ ] **Step 1: Write `e2e/settings.spec.ts`.**
  - Changing the username triggers a sync.
  - "Export backup" downloads `chess-coach-backup-YYYY-MM-DD.json`.
  - Importing that file reports "0 new items".
  - Importing a file from a second seeded profile reports "N new items" and the stats update.
  - Storage status shows "Protected" or "Not protected — export a backup regularly".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: settings and backup`.

### Task 17: Offline PWA and download budget

**Files:**
- Modify: `vite.config.ts`, `index.html` (`apple-mobile-web-app-capable`, status bar style, `apple-touch-icon`)
- Create: `public/icons/*`, `scripts/check-size.mjs`, `e2e/offline.spec.ts`, `public/_headers`

**Interfaces:**
- Produces: a service worker that precaches every asset under `dist`, including `.wasm`, `.onnx` and `data/puzzles.tsv`, with `maximumFileSizeToCacheInBytes: 16 * 1024 * 1024`. It uses `registerType: 'prompt'`, and an "Update available" toast reloads on tap.

- [ ] **Step 1: Write `e2e/offline.spec.ts`.**
  - Against `vite preview`: load and wait for SW activation.
  - Set `context.setOffline(true)` and reload. Today renders, a puzzle can be solved, a bot game can start, and the engine answers.
  - `check-size.mjs` fails above 25 MB of precache.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Manifest: `display: standalone`, theme colours from the tokens, and 192/512 maskable icons.
  - `_headers`: long cache for hashed assets, and `no-cache` for `sw.js` and `index.html`.
- [ ] **Step 4: Run.** Run `npm run build && node scripts/check-size.mjs && npx playwright test e2e/offline.spec.ts`. Expected: PASS, with the size printed.
- [ ] **Step 5: Commit:** `feat: offline PWA with precached engine, model and puzzles`.

### Task 18: Final design review and full e2e

- [ ] **Step 1: Extend `e2e/screens.spec.ts`** to every screen and state: Play (setup, mid-game, alarm sheet, review), Progress (empty, seeded), Settings, drills, the offline banner and the update toast. Cover all 3 projects in light and dark.
- [ ] **Step 2: Dispatch the senior frontend designer review** as in Task 8, with `model: "fable"`. Add this check to the brief: "consistency across all screens, navigation clarity, empty states, night-time comfort in dark mode."
- [ ] **Step 3: Apply the fixes.** Run `npm test && npx playwright test`. Expected: all PASS.
- [ ] **Step 4: Commit:** `style: final design review fixes`. Include `docs/design-review/notes-2.md`.

### Task 19: Deploy to Cloudflare Pages

- [ ] **Step 1: Check the Cloudflare login.** Run `npx wrangler whoami` from **outside** the repo. If it isn't logged in, ask the player to run `! npx wrangler login`. Never put a token in the repo.
- [ ] **Step 2: Build and deploy.** Run `npm run build && npx wrangler pages deploy dist --project-name chess-coach --branch main`. Ask the player to confirm before the first public deploy.
- [ ] **Step 3: Verify the live site.**
  - Fetch `https://chess-coach.pages.dev/` and check that `/sw.js` and `/data/puzzles.tsv` return 200.
  - Run `e2e/shell.spec.ts` and `e2e/offline.spec.ts` against the live URL (`BASE_URL` env).
- [ ] **Step 4: Update the README** with the live URL and "Add to Home Screen" steps for iPhone. Commit and push.
- [ ] **Step 5: Hand off to the player.** They install the app on the iPhone, then complete a puzzle offline in airplane mode. Report the result.

---

## Phase 2 (Crew): outline only. Its own plan follows after Phase 1 ships.
1. A Worker + D1 in `worker/`: crew create/join, PBKDF2 passcodes, recovery code, login rate limit, token auth.
2. Upload of per-game analysis records keyed by game URL. A shared game is analysed once. The laptop "help analyse backlog" button.
3. Crew feed with stat lines, marked replay, "try this position", and hide.
4. Profile, Safety Level 1–10 with a margin, and the crew leaderboard sorted by Safety Level. Calibrating state for the first 5 games.
5. Coach notes on moves.
6. Rivals (±150, 2-week series, clean-off scoring), the crew quest (one dot per member), and the Monday recap card with badges.
7. Design review on all crew screens (Fable), then deploy the Worker.
