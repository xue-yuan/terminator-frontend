import { render } from 'solid-js/web';
import './index.css';
import './lib/theme';
import App from './App';
import { isSignedIn } from './lib/auth';
import { refreshAll } from './lib/data';
import './lib/sync';

render(() => <App />, document.getElementById('root'));

// iOS Safari only shows :active (press) styles once the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });
// Safari ignores user-scalable=no; its pinch gesture can still be cancelled (iOS only fires these).
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault());

// Show cached data instantly, then fetch whatever changed on the server, quietly.
if (isSignedIn()) refreshAll();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isSignedIn()) refreshAll();
});
