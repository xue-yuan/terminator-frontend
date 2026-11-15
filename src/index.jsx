import { render } from 'solid-js/web';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import './index.css';
import './lib/theme';
import App from './App';
import { isSignedIn } from './lib/auth';
import { refreshAll } from './lib/data';
import './lib/sync';

render(() => <App />, document.getElementById('root'));

// iOS Safari only shows :active (press) styles once the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

// Show cached data instantly, then refresh in the background.
if (isSignedIn()) refreshAll({ force: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isSignedIn()) refreshAll();
});
