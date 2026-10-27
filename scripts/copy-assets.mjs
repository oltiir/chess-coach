// Copies the Stockfish lite engine into public/ (onnxruntime's wasm is bundled by Vite itself)
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('public/engine', { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'])
  cpSync(`node_modules/stockfish/bin/${f}`, `public/engine/${f}`);

