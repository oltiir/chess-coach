import { render } from 'preact';
import { App } from './app';
import { onGameAnalysed, startBackground } from './background';
import { makeDrills, saveDrills } from './drills/makeDrills';
import { openDb } from './store/db';
import './ui/theme.css';

render(<App />, document.getElementById('app')!);
onGameAnalysed(async (a) => {
  const g = await (await openDb()).get('games', a.url);
  if (g) await saveDrills(makeDrills(a, g));
});
startBackground();
