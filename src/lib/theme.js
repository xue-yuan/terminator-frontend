import { createSignal } from 'solid-js';
import { loadPref, savePref } from './storage';

// 'system' | 'light' | 'dark'. index.html applies it before first paint too.
const initial = loadPref('theme', 'system');
const [theme, setThemeSignal] = createSignal(initial);
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function apply(value) {
  const root = document.documentElement;
  if (value === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = value;
  const dark = value === 'dark' || (value === 'system' && darkQuery.matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f2f2f7');
}

apply(initial);
darkQuery.addEventListener('change', () => apply(theme()));

export { theme };

export function setTheme(value) {
  setThemeSignal(value);
  savePref('theme', value);
  apply(value);
}
