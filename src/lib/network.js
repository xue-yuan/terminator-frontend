import { createSignal } from 'solid-js';

// navigator.onLine is only a hint; api.js also flips this on real request results.
const [online, setOnline] = createSignal(navigator.onLine);

window.addEventListener('online', () => setOnline(true));
window.addEventListener('offline', () => setOnline(false));

export { online, setOnline };
