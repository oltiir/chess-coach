import { render } from 'preact';
import { App } from './app';
import { startBackground } from './background';
import './ui/theme.css';

render(<App />, document.getElementById('app')!);
startBackground();
