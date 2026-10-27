import { useEffect, useState } from 'preact/hooks';
import { TabBar } from './ui/TabBar';
import { PuzzleScreen } from './puzzles/PuzzleScreen';

export type Route = 'today' | 'puzzles' | 'play' | 'progress' | 'settings';
const routes: Route[] = ['today', 'puzzles', 'play', 'progress', 'settings'];

const readRoute = (): { tab: Route; param?: string } => {
  const [r, param] = location.hash.replace(/^#\//, '').split('/');
  if (r === 'puzzle') return { tab: 'puzzles', param };
  return { tab: routes.includes(r as Route) ? (r as Route) : 'today', param };
};

const titles: Record<Route, string> = {
  today: 'Today', puzzles: 'Puzzles', play: 'Play', progress: 'Progress', settings: 'Settings',
};

export function App() {
  const [{ tab: route, param }, setRoute] = useState(readRoute);
  useEffect(() => {
    const on = () => { setRoute(readRoute()); scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return (
    <div class="layout">
      <TabBar route={route} />
      <main class="main">
        <h1>{titles[route]}</h1>
        {route === 'puzzles' && <PuzzleScreen puzzleId={param} />}
      </main>
    </div>
  );
}
