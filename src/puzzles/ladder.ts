import type { Attempt } from '../store/types';

export interface Step { key: string; label: string; themes: string[] }

export const LADDER: Step[] = [
  { key: 'hangingPiece', label: 'Hanging pieces', themes: ['hangingPiece'] },
  { key: 'mateIn1', label: 'Mate in 1', themes: ['mateIn1'] },
  { key: 'fork', label: 'Forks', themes: ['fork'] },
  { key: 'pin', label: 'Pins & skewers', themes: ['pin', 'skewer'] },
  { key: 'backRankMate', label: 'Back-rank mates', themes: ['backRankMate'] },
  { key: 'mateIn2', label: 'Mate in 2', themes: ['mateIn2'] },
  { key: 'discoveredAttack', label: 'Discovered attacks', themes: ['discoveredAttack'] },
];

export const stepFor = (key: string) => LADDER.find((s) => s.key === key)!;
const WINDOW = 30;
const MASTERY = 0.85;

export function themeStatus(attempts: Attempt[]) {
  const byStep = new Map<string, Attempt[]>();
  for (const a of [...attempts].sort((x, y) => x.ts - y.ts))
    if (a.kind === 'puzzle' && a.theme) byStep.set(a.theme, [...(byStep.get(a.theme) ?? []), a]);
  const accuracy: Record<string, number> = {};
  const isMastered = (k: string) => {
    const last = (byStep.get(k) ?? []).slice(-WINDOW);
    return last.length >= WINDOW && last.filter((a) => a.firstTry).length / last.length >= MASTERY;
  };
  for (const [k, list] of byStep) accuracy[k] = list.filter((a) => a.firstTry).length / list.length;
  const unlocked: string[] = [];
  const mastered: string[] = [];
  for (const s of LADDER) {
    unlocked.push(s.key);
    if (!isMastered(s.key)) break;
    mastered.push(s.key);
  }
  const current = unlocked.find((k) => !mastered.includes(k)) ?? LADDER[LADDER.length - 1].key;
  return { unlocked, mastered, current, accuracy };
}
