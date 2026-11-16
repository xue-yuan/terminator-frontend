import { defineConfig, lazyPlugins } from 'vite-plus';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const PAPER = '#f2f2f7';
const apiProxy = { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } };

export default defineConfig({
  // Formatting (Oxfmt) and linting (Oxlint) for `vp check` / `vp fmt` / `vp lint`.
  fmt: { singleQuote: true, printWidth: 120, ignorePatterns: ['dist/**', 'dev-dist/**'] },
  lint: {
    ignorePatterns: ['dist/**', 'dev-dist/**'],
    jsPlugins: [
      { name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' },
      // Solid-specific checks, mostly lost reactivity (destructured props, reads outside tracking).
      { name: 'solid', specifier: 'eslint-plugin-solid' },
    ],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      // `const { id, ...rest } = x` is how a field is dropped from a copy.
      'no-unused-vars': ['warn', { ignoreRestSiblings: true }],
      'solid/components-return-once': 'warn',
      'solid/event-handlers': 'warn',
      'solid/jsx-no-duplicate-props': 'error',
      'solid/jsx-no-undef': 'error',
      'solid/no-destructure': 'error',
      'solid/no-innerhtml': 'error',
      'solid/no-react-deps': 'warn',
      'solid/no-react-specific-props': 'warn',
      'solid/prefer-for': 'warn',
      'solid/reactivity': 'warn',
      'solid/self-closing-comp': 'warn',
    },
    overrides: [
      {
        // Solid compiles `ref={el}` into an assignment the linter can't see.
        files: ['**/*.jsx'],
        rules: { 'no-unassigned-vars': 'off' },
      },
      {
        // Tests read signals outside tracking scopes on purpose, to check values.
        files: ['**/*.test.{js,jsx}'],
        rules: { 'solid/reactivity': 'off' },
      },
    ],
  },
  // Unit tests of the app's logic; no DOM needed (vite-plugin-solid would default to jsdom).
  test: { include: ['src/**/*.test.{js,jsx}'], environment: 'node' },
  plugins: lazyPlugins(() => [
    solid(),
    tailwindcss(),
    VitePWA({
      // Ask before reloading: never yank the page away mid-set.
      registerType: 'prompt',
      injectRegister: false,
      // theme-color is set in index.html (light/dark aware)
      pwaAssets: { config: true, overrideManifestIcons: true, injectThemeColor: false },
      manifest: {
        name: 'Terminator',
        short_name: 'Terminator',
        description: 'Log every set. Even offline.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: PAPER,
        background_color: PAPER,
        categories: ['health', 'fitness', 'sports'],
        shortcuts: [{ name: 'Start workout', short_name: 'Start', url: '/session' }],
      },
      workbox: {
        // The plugin precaches manifest.webmanifest itself; globbing it too makes
        // Workbox reject the whole precache list (conflicting revisions).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/health/],
        cleanupOutdatedCaches: true,
        // Control the page on first install so the app works offline right away.
        // Updates still wait for the user to tap "Reload".
        clientsClaim: true,
      },
    }),
  ]),
  // 127.0.0.1 rather than localhost: Spotify doesn't accept "localhost" in
  // redirect URIs (http://localhost:5173 still works in the browser).
  server: { host: '127.0.0.1', proxy: apiProxy },
  preview: { host: '127.0.0.1', proxy: apiProxy },
});
