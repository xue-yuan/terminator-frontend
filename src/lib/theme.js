import { createSignal } from 'solid-js';
import { loadPref, savePref } from './storage';

// Appearance: a theme (its colours, see index.css) and a mode, 'system' |
// 'light' | 'dark'. Both go on <html> as data-palette and data-theme (the
// mode resolved to light or dark); index.html does the same before first paint.

/** [id, name], in the order the picker shows them. */
export const THEMES = [
  ['ember', 'Ember'],
  ['ocean', 'Ocean'],
  ['forest', 'Forest'],
  ['grape', 'Grape'],
  ['rose', 'Rose'],
  ['graphite', 'Graphite'],
  ['sand', 'Sand'],
  ['milktea', 'Milk Tea'],
  ['midnight', 'Midnight'],
];
const known = (id) => THEMES.some(([key]) => key === id);

// Plain copies for apply() (it runs outside any reactive scope); the signals are for the UI.
let mode = loadPref('theme', 'system');
let current = known(loadPref('palette')) ? loadPref('palette') : 'ember';
const [theme, setThemeSignal] = createSignal(mode);
const [palette, setPaletteSignal] = createSignal(current);
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function apply() {
  const root = document.documentElement;
  const dark = mode === 'dark' || (mode === 'system' && darkQuery.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.palette = current;
  // Safari's bars take the page's background.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || (dark ? '#000000' : '#f2f2f7');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

apply();
darkQuery.addEventListener('change', apply);

/** Light or dark: 'system' (follows the device), 'light' or 'dark'. */
export { theme, palette };

export function setTheme(value) {
  mode = value;
  setThemeSignal(value);
  savePref('theme', value);
  apply();
}

export function setPalette(id) {
  if (!known(id)) return;
  current = id;
  setPaletteSignal(id);
  savePref('palette', id);
  apply();
}
