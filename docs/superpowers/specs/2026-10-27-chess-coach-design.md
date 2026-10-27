# Chess Coach — design

Date: 2026-10-27
Owner: Oltii05 (chess.com)

## Intent and why

A personal chess trainer for one player. It runs fully offline on an iPhone as a home-screen web app and as a normal website on a laptop. Its purpose is to stop the player hanging pieces and missing tactics, which decides most games at their level, and to show progress as it happens.

**The player today (chess.com, fetched 2026-10-27):**
- Rapid 568. Best was 953, in Feb 2023.
- Blitz 207.
- 53 games this month. Most were 5-minute blitz, and many were lost on time or to checkmate.
- Their own diagnosis: "I usually hang pieces and miss tactics."

**When they train:** short sessions on the phone during a uni or work break, or in bed.

**The player's original idea was mock games against a bot plus a coach's review afterwards.** They asked for research and said they would follow whatever it recommends. The research (summarised below) says that passive review is the weakest part of that idea. This design keeps their idea in a stronger form:
- the bot plays like a human,
- the coach steps in *before* a blunder,
- every mistake becomes something they must re-solve themselves.

**What the research found** (sources: Heisman's "hope chess" vs "real chess"; Charness et al. 2005 on serious solo study; Lichess "Learn from your mistakes"; Woodpecker repetition data; r/chessbeginners consensus). None of it comes from a controlled trial at this rating. It is consistent expert consensus.
1. **A safety check before every move, practised in slow games, has the biggest effect.** The check asks three questions:
   - What did their last move attack?
   - After my move, what checks, captures or threats do they have?
   - Is anything of theirs hanging?
2. **High volume of *easy* themed tactics, at an 80–90% solve rate, with failed puzzles repeated.**
3. **Re-solving your own blunder positions.** Reading an explanation does much less.
4. **Bots are optional practice only.** Weak bots that drop pieces at random teach carelessness.

**What the player agreed to:** stop blitz and play 10- or 15-minute rapid on chess.com. Real games stay on chess.com. This app supports them and does not replace them.

## Goals

1. **Fewer pieces hung per game** in real chess.com games. This is the main number. Target: under 1 per game.
2. **A rising rapid rating**, judged over 4–6 weeks or about 50 games, not day to day.
3. **A daily session that fits in 10–15 minutes**, can be left mid-way, and works with no signal.
4. **Progress the player can see** before their rating moves.

## Features

### 1. Today (daily session)
This is the home screen. One tap starts the session, which has three parts:
- **Up to 3 "your mistakes" drills** from analysed chess.com games (feature 3). Shown first when available.
- **Repeat puzzles that are due** (feature 2).
- **New themed puzzles** to fill the session: about 10 items, 10–15 minutes in total.

Other rules for the session:
- Progress saves after every item. Closing the app mid-session loses nothing.
- It ends with a short summary: solved, missed, and what comes back tomorrow.
- A **safety-check card** (the three questions above) is shown at the start of the session, and is available as "before you play on chess.com" next to a link to chess.com.

### 2. Themed puzzles
- **Source:** the Lichess puzzle database (CC0). Ship a filtered subset of about 30k puzzles:
  - rating 400–1400
  - rating deviation ≤ 90
  - popularity ≥ 80
  - fields: FEN, Moves, Rating, Themes, PuzzleId
  - roughly 1 MB brotli
- **How a puzzle works:** the FEN is the position *before* the opponent's move. Play the first move, then the player must find the rest.
- **Theme ladder, in order:**
  1. hangingPiece
  2. mateIn1
  3. fork
  4. pin and skewer
  5. backRankMate
  6. mateIn2
  7. discoveredAttack

  A theme counts as mastered at about 85% first-try success over its last 30 attempts. Mastering a theme unlocks the next, and mastered themes keep appearing in the mix.
- **Difficulty is adaptive per theme.** The rating band moves so that first-try success stays at 80–90%, which is deliberately easier than rated puzzle mode.
- **Repetition:** a missed puzzle comes back after 1, 3, 7 and 21 days until it is solved first try twice in a row. Track solve time on repeats, because getting faster shows the pattern is sticking.
- **Wrong move:** show the right move with a one-line reason built from the theme and the position, e.g. "Fork: your knight attacks king and rook". Then let them replay it.

### 3. Your mistakes (from real chess.com games)
- **Import** games for the username (default `Oltii05`) from the chess.com public API whenever online:
  - `/pub/player/{u}/games/archives`, then each monthly archive, fetched one at a time
  - CORS is open
  - send `If-None-Match` on refetch
- **Analyse** each of the player's moves with Stockfish on the device:
  - newest games first, a few at a time
  - only while the app is open
  - resumable, so nothing is lost if iOS suspends the app
  - **Scope (my call):**
    - **Analyse rapid and daily games only,** newest first, all of them. That is about 40 rapid games today, so the backlog is small.
    - **Blitz games are imported for counts and rating only.** They are not analysed and don't produce drills. Rushed 5-minute games aren't where the safety habit is built.
- **Flag mistakes** with Lichess's winning-chances model:
  - `wc = 2/(1+exp(-0.00368208·cp)) - 1`, with cp clamped to ±1000
  - a drop of ≥0.3 is a blunder, ≥0.2 a mistake
  - plus Lichess's separate rules for mate found or missed
- **Classify** each flagged move, using chess.js and the engine line:
  - **Hung piece:** the opponent's best reply wins a piece left undefended or under-defended.
  - **Missed free piece:** the opponent had left something hanging and you didn't take it.
  - **Missed fork, pin or skewer.**
  - **Missed mate / allowed mate.**
  - **Other:** "this lost material/position; best was X".
- **Drill:** show the position *before* the player's mistake and ask them to find a better move. Accept any move within the mistake threshold of the engine's best. After the attempt, show what happened in the real game and the one-line explanation.
- **Drills repeat** on the same schedule as puzzles.

### 4. Practice game vs a human-like bot
- **The bot is Maia-3**, the 5M fp16 ONNX model, run through `onnxruntime-web` (wasm).
  - Its strength is set by Elo. The default is the player's current rapid rating, rounded, and it is adjustable.
  - Maia-3's range starts at 600. For lower settings, use 600.
- **The bot plays without time pressure.** The player's clock is optional, off by default, with a 15|10 preset.
- **Blunder alarm, on by default:**
  - Before the player's move is committed, the engine checks it.
  - If the move would hang material or drop winning chances by ≥0.3, the coach stops it: "Look again: what can they capture after this?"
  - It does not reveal the answer. The player can rethink or play the move anyway.
  - Alarms per game are recorded.
- **Test mode:** alarm off, to see whether the habit holds without help.
- **After the game:** a short review of the key mistakes. Each becomes a "your mistakes" drill.

### 5. Progress
- **Pieces hung per game** in real chess.com rapid games. Show a rolling average and a weekly trend. This is the headline number.
  - **Definition (my call): a material check, separate from the evaluation flags.**
    - A player's move counts as a hang when, afterwards, the opponent has a capture that wins at least a minor piece's worth of material (≥ 3 pawns) by static exchange.
    - It counts whether or not the opponent actually took it, and however won or lost the position already was. This measures the habit, not the result.
    - Excluded: deliberate sacrifices, where the engine's eval after the move is no worse than 0.1 winning chances below the best move.
    - Pawn hangs are tracked separately and are not in the headline.
  - The explanation classifier (feature 3) stays cautious. The count does not depend on it, so cautious labels never flatter the number.
- **Free pieces missed per game**, i.e. the opponent's hangs the player didn't take.
- **Rapid rating over time**, built from the per-game ratings in the monthly archives.
- **Puzzle accuracy per theme**, and progress on the theme ladder.
- **Repeat-puzzle solve time** trend.
- **Average clock time used per rapid game**, from `%clk` in the PGN. Using little time suggests the safety check is being skipped.
- **Blitz games played**, shown as a gentle note when the count is above zero, since the player agreed to stop.
- **Training consistency as days per week.** No streak that resets: broken streaks demotivate.

### 6. Settings and data
- chess.com username.
- Bot Elo default.
- Alarm on/off.
- **Export/import of all progress as one JSON file.** This is the backup, and the way to move data between phone and laptop.
  - **Import merges, it never replaces (my call).** Progress is stored as an append-only log of attempts with stable IDs. Repeat schedules, mastery and stats are derived from that log, so merging two devices' exports loses nothing.
  - **Analysis results travel in the export,** so games analysed on the faster laptop aren't redone on the phone.

## Non-goals (for now)
- Openings training. At this level one simple setup is enough.
- Accounts, a backend, or automatic sync between phone and laptop. Export/import covers it.
- An AI/LLM chat coach. Explanations come from rules so the app works offline and costs nothing.
- A native App Store app.
- Blitz or bullet support.
- Multiplayer, or playing real people inside the app.

## Anti-goals (would make it a failure even if it works)
- **A coach that is confidently wrong.** A mislabelled explanation is worse than a plain one. When the classifier is unsure, fall back to "this lost material; best was X".
- **Showing answers before the player tries.** Every drill makes them find the move first.
- **A bot that gives away pieces at random.** That is why the bot is Maia, not dumbed-down Stockfish.
- **Guilt mechanics:** streak resets, nagging.
- **Needing a connection to train.** Only the chess.com import uses the network.
- **Janky on the phone:** slow first paint, laggy drag, the engine blocking the UI.
- **Losing progress:** wiped storage with no backup path.

## Constraints
- **iPhone, Safari home-screen web app (PWA), iOS 17+.** It must work fully offline after the first load: all code, engine, model and puzzles are precached.
- **Static hosting on Cloudflare Pages.**
  - Deploy only the build output folder (`dist/`).
  - Keep Cloudflare tokens outside the project folder.
  - Wrangler can upload the working directory as public assets.
- **Storage:**
  - IndexedDB is the main copy. Call `navigator.storage.persist()` on launch.
  - Safari-tab storage and home-screen storage are separate. The home-screen app is the "real" one.
- **The engine runs in a Web Worker** and never blocks the UI. Restart it on `visibilitychange`, because iOS suspends workers in the background.
- **Download budget:** first install about 25 MB or less, covering the Maia model (about 11 MB), onnxruntime wasm, Stockfish lite (about 2 MB) and puzzles (about 1 MB).
- **Licences:** Stockfish (GPL-3), Maia-3 (AGPL-3) and chessground (GPL-3).
  - The site is public, and the source is a public GitHub repo, which satisfies these licences.
  - No login gate, because it would break the iOS home-screen install and offline launch.
  - Never commit tokens or secrets. The only personal data is the chess.com username, which is already public.

## Decided

**By the player:**
- iPhone plus website.
- chess.com username `Oltii05`.
- Switch to 10/15-minute rapid.
- Follow the research-based plan above instead of the bot-plus-review idea alone.

**My calls** (the player said they'd go with my recommendation):
- PWA instead of a native app.
- Cloudflare Pages hosting.
- Rules-based coach, no LLM.
- Maia-3 for the bot.
- The specific stack:
  - `stockfish@19.0.1` lite single-threaded build, no threads and so no COOP/COEP headers
  - `chess.js@1.4.0`
  - `@lichess-org/chessground` for the board, because Lichess's own mobile apps use it
  - Vite plus a Workbox service worker
  - TypeScript
- The puzzle filter and size.
- The theme ladder order and mastery threshold.
- The repeat schedule.
- Alarm on by default.

## Look and feel, and design review (asked for by the player)
- The app must be **easy to use and navigate, good looking, and easy on the eyes.** It will often be used in bed at night, so dark mode matters. A calm palette, high-contrast pieces, and big touch targets.
- **Navigation:** at most one tap from home to any of Today, Puzzles, Play, Progress, which suggests a bottom tab bar on phone and a side or top nav on desktop. Anything can be left without losing progress.
- **A senior frontend designer review is a required stage.** After each major screen exists:
  1. A design agent reviews it.
  2. The agent screenshots it at **iPhone width (390×844, plus 375×667 for small phones)** and at **desktop (1440×900)**, light and dark.
  3. Fixes are applied before moving on.
- **A final design pass happens before the first release.**
- **Playwright with Chromium is available** on the dev machine for the screenshots and for click-through tests of the main flows on both viewports.

## Publishing
- Public GitHub repo `oltiir/chess-coach`. The player asked for GitHub. A public repo also satisfies the GPL/AGPL licences of the engine and bot.
- Deployed to Cloudflare Pages from `dist/` only.

## Left to the builder
- **UI framework**, or none; visual design; screen layout.
- **Code structure, and the IndexedDB schema.**
- **Engine search settings:** depth or time per move, for analysis and for the alarm. The alarm must respond in about 1 s or less.
- **The exact puzzle-selection algorithm** within the rules above.
- **The fallback if Maia-3 in the browser fails:** a "humanised" Stockfish that picks from MultiPV with a temperature and occasionally plays a human-style miss, but never drops a piece at random.
- **Order of building.** Suggested: puzzles and Today first (most value, least risk), then importing and analysing chess.com games, then the bot, then the progress charts.
