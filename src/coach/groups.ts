/** The coach's theme groups, built from Lichess puzzle themes. Shared with scripts/build-puzzles.mjs. */
export interface Group { key: string; label: string; themes: string[] }

export const GROUPS: Group[] = [
  { key: 'defence', label: 'Defence', themes: ['defensiveMove'] },
  { key: 'free', label: 'Free pieces', themes: ['hangingPiece'] },
  { key: 'pins', label: 'Pins & skewers', themes: ['pin', 'skewer'] },
  { key: 'forks', label: 'Forks', themes: ['fork'] },
  { key: 'discovered', label: 'Discovered attacks', themes: ['discoveredAttack', 'discoveredCheck'] },
  { key: 'mates', label: 'Mates', themes: ['mateIn1', 'mateIn2', 'backRankMate'] },
  { key: 'removal', label: 'Removing the defender', themes: ['deflection', 'attraction', 'capturingDefender'] },
  { key: 'trapped', label: 'Trapped pieces', themes: ['trappedPiece'] },
];

export const groupLabel = (k: string) => GROUPS.find((g) => g.key === k)?.label ?? k;
export const groupsOf = (themes: string[]) => GROUPS.filter((g) => g.themes.some((t) => themes.includes(t))).map((g) => g.key);
