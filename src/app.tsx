import { useEffect, useState } from 'preact/hooks';
import { TabBar } from './ui/TabBar';

export type Route = 'today' | 'puzzles' | 'play' | 'progress' | 'settings';
const routes: Route[] = ['today', 'puzzles', 'play', 'progress', 'settings'];

const readRoute = (): Route => {
  const r = location.hash.replace(/^#\//, '') as Route;
  return routes.includes(r) ? r : 'today';
};

const titles: Record<Route, string> = {
  today: 'Today', puzzles: 'Puzzles', play: 'Play', progress: 'Progress', settings: 'Settings',
};

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
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
      </main>
    </div>
  );
}
