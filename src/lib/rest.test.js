// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('./sound', () => ({ chime: vi.fn(() => true), primeSound: vi.fn() }));

let s;
let rest;
let sound;
beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {}); // "IndexedDB unavailable"
  s = await import('./session');
  rest = await import('./rest');
  sound = await import('./sound');
});

beforeEach(() => {
  vi.useFakeTimers();
  sound.chime.mockClear();
  s.startWorkout({});
});
afterEach(() => {
  s.stopRest();
  vi.useRealTimers();
});

describe('end of rest', () => {
  it('chimes once when the countdown reaches zero', () => {
    s.startRest(2);
    vi.advanceTimersByTime(1500);
    expect(rest.restRemaining()).toBe(1);
    expect(sound.chime).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(rest.restRemaining()).toBe(0);
    expect(sound.chime).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(sound.chime).toHaveBeenCalledTimes(1);
  });

  it('clears itself a few seconds after', () => {
    s.startRest(1);
    vi.advanceTimersByTime(7000);
    expect(rest.restRemaining()).toBeNull();
  });

  it('stays quiet when the app comes back long after rest ended (screen was locked)', () => {
    s.startRest(2);
    vi.advanceTimersByTime(500);
    // Timers don't run while iOS has the app suspended; the clock does.
    vi.setSystemTime(Date.now() + 60_000);
    vi.advanceTimersByTime(250);
    expect(sound.chime).not.toHaveBeenCalled();
    expect(rest.restRemaining()).toBeNull();
  });
});
