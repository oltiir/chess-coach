// Downloads the Maia-3 5M fp16 ONNX model (AGPL-3.0, https://huggingface.co/bqrio/maia3-onnx) into public/models/.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const out = 'public/models/maia3-5m.fp16.onnx';
if (existsSync(out)) process.exit(0);
mkdirSync('public/models', { recursive: true });
const res = await fetch('https://huggingface.co/bqrio/maia3-onnx/resolve/main/maia3-5m.fp16.onnx');
if (!res.ok) throw new Error(`model download failed: ${res.status}`);
writeFileSync(out, Buffer.from(await res.arrayBuffer()));
console.log(`saved ${out}`);
