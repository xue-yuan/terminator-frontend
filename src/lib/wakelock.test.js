// @vitest-environment happy-dom
import { createRoot, createSignal } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useWakeLock } from './wakelock';

const tick = () => new Promise((r) => setTimeout(r, 0));
let sentinels;

beforeEach(() => {
  sentinels = [];
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: vi.fn(async () => {
        const sentinel = new EventTarget();
        sentinel.release = vi.fn(async () => sentinel.dispatchEvent(new Event('release')));
        sentinels.push(sentinel);
        return sentinel;
      }),
    },
  });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

function mount(initial = true) {
  return createRoot((dispose) => {
    const [active, setActive] = createSignal(initial);
    useWakeLock(active);
    return { setActive, dispose };
  });
}

describe('useWakeLock', () => {
  it('holds the lock while active and gives it back when turned off or unmounted', async () => {
    const view = mount();
    await tick();
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
    view.setActive(false);
    expect(sentinels[0].release).toHaveBeenCalled();
    view.setActive(true);
    await tick();
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(2);
    view.dispose();
    expect(sentinels[1].release).toHaveBeenCalled();
  });

  it('takes it again when the page comes back (the browser drops it when hidden)', async () => {
    const view = mount();
    await tick();
    sentinels[0].dispatchEvent(new Event('release')); // page was hidden
    document.dispatchEvent(new Event('visibilitychange'));
    await tick();
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(2);
    view.dispose();
  });

  it('gives back a lock granted after it was turned off', async () => {
    const view = mount();
    view.dispose(); // before the request resolved
    await tick();
    expect(sentinels[0].release).toHaveBeenCalled();
  });
});
