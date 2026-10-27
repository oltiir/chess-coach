# Chess Coach

A personal chess trainer that works offline on an iPhone (add it to the home screen from Safari) and on desktop.

- **Today**: a 10–15 minute daily session of drills from your own chess.com mistakes and easy themed puzzles. The ones you miss come back later.
- **Play**: a human-like bot (Maia-3) with a blunder alarm that stops you before you hang a piece.
- **Progress**: pieces hung per game in your real rapid games, rating, puzzle accuracy per theme.

Design: `docs/superpowers/specs/2026-10-27-chess-coach-design.md`.

## Run

```
npm install
node scripts/fetch-model.mjs   # downloads the Maia-3 model (~11 MB)
npm run dev
npm test        # unit tests
npm run e2e     # browser tests (iPhone, small iPhone, desktop)
```

## Licences

GPL-3.0-or-later. Uses Stockfish (GPL-3), chessground (GPL-3), Maia-3 (AGPL-3), chess.js (BSD-2), onnxruntime-web (MIT) and puzzles from the Lichess puzzle database (CC0).
