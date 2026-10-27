import { useEffect, useState } from 'preact/hooks';
import { TabBar } from './ui/TabBar';
import { PuzzleScreen } from './puzzles/PuzzleScreen';
import { TodayScreen } from './today/TodayScreen';
import { SyncBanner } from './ui/SyncBanner';
import { PlayScreen } from './bot/PlayScreen';
import { ProgressScreen } from './progress/ProgressScreen';
import { SettingsScreen } from './settings/SettingsScreen';
import { CrewScreen } from './crew/CrewScreen';
import { CrewGame } from './crew/CrewGame';

export type Route = 'today' | 'puzzles' | 'play' | 'crew' | 'progress' | 'settings';
const routes: Route[] = ['today', 'puzzles', 'play', 'crew', 'progress', 'settings'];

const readRoute = (): { tab: Route; param?: string } => {
  const [r, param] = location.hash.replace(/^#\//, '').split('/');
  if (r === 'puzzle') return { tab: 'puzzles', param };
  if (r === 'drill') return { tab: 'today', param: decodeURIComponent(param ?? '') };
  if (r === 'crew' && param === 'game') { const [, , m, u] = location.hash.replace(/^#\//, '').split('/'); return { tab: 'crew', param: `${m}|${decodeURIComponent(u ?? '')}` }; }
  return { tab: routes.includes(r as Route) ? (r as Route) : 'today', param };
};

const titles: Record<Route, string> = {
  today: 'Today', puzzles: 'Puzzles', play: 'Play', crew: 'Crew', progress: 'Progress', settings: 'Settings',
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
        <SyncBanner />
        <h1>{titles[route]}</h1>
        {route === 'today' && <TodayScreen drillId={param} />}
        {route === 'puzzles' && <PuzzleScreen puzzleId={param} />}
        {route === 'crew' && (param ? <CrewGame memberId={param.split('|')[0]} url={param.slice(param.indexOf('|') + 1)} /> : <CrewScreen />)}
        {route === 'progress' && <ProgressScreen />}
        {route === 'settings' && <SettingsScreen />}
        {route === 'play' && <PlayScreen startFen={param ? decodeURIComponent(param) : undefined} />}
      </main>
    </div>
  );
}
