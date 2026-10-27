import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
