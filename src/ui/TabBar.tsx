import type { Route } from '../app';

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const items: [Route, string, string][] = [
  ['today', 'Today', 'M4 12l8-8 8 8M6 10v10h12V10'],
  ['puzzles', 'Puzzles', 'M9 4h6v3a2 2 0 104 0V4h1v16H4V4h5zM9 4a2 2 0 11-4 0'],
  ['play', 'Play', 'M8 21h8M9 21l1-6h4l1 6M10 15c-2-1-3-3-2-5l4-6 4 6c1 2 0 4-2 5'],
  ['progress', 'Progress', 'M4 20V10M10 20V4M16 20v-7M22 20H2'],
  ['settings', 'Settings', 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-2-4-2 1-2-2V4h-4v2L9 7 7 6 5 10l2 1v2l-2 1 2 4 2-1 2 2v2h4v-2l2-2 2 1 2-4-2-1z'],
];

export function TabBar({ route }: { route: Route }) {
  return (
    <nav class="nav" aria-label="Main">
      <span class="brand">Chess Coach</span>
      {items.map(([r, label, d]) => (
        <a href={`#/${r}`} aria-current={route === r ? 'page' : undefined} key={r}>
          {icon(d)}
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
