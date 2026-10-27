import { ensurePuzzlesLoaded } from './puzzles/load';

/** Resolves once the bundled puzzles are in IndexedDB. */
export const puzzlesReady: Promise<number> = ensurePuzzlesLoaded();
