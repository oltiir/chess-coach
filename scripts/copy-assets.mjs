// Copies the Stockfish lite engine and the onnxruntime wasm files into public/
import { cpSync, mkdirSync, readdirSync } from 'node:fs';

mkdirSync('public/engine', { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'])
  cpSync(`node_modules/stockfish/bin/${f}`, `public/engine/${f}`);

mkdirSync('public/ort', { recursive: true });
for (const f of readdirSync('node_modules/onnxruntime-web/dist'))
  if (/^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(f)) cpSync(`node_modules/onnxruntime-web/dist/${f}`, `public/ort/${f}`);
