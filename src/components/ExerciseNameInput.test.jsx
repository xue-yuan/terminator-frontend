// @vitest-environment happy-dom
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import ExerciseNameInput from './ExerciseNameInput';

const NAMES = Array.from({ length: 30 }, (_, i) => `Lift ${i + 1}`);
let dispose;
afterEach(() => {
  dispose?.();
  document.body.innerHTML = '';
});

function mount() {
  const [value, setValue] = createSignal('');
  const onCommit = vi.fn();
  const onPick = vi.fn();
  const root = document.createElement('div');
  const outside = document.createElement('button');
  document.body.append(root, outside);
  dispose = render(
    () => (
      <ExerciseNameInput value={value()} onInput={setValue} suggestions={NAMES} onCommit={onCommit} onPick={onPick} />
    ),
    root,
  );
  const input = root.querySelector('input');
  const options = () => [...root.querySelectorAll('[role=option] button')];
  return { input, options, value, onCommit, onPick, outside };
}

const pointerDown = (el) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));

describe('ExerciseNameInput', () => {
  it('lists more than a handful of options, and a finger landing on one (to scroll) picks nothing', () => {
    const v = mount();
    v.input.focus();
    v.input.dispatchEvent(new Event('focus'));
    expect(v.options().length).toBe(30);
    pointerDown(v.options()[3]); // touch starts a scroll
    expect(v.onPick).not.toHaveBeenCalled();
    v.options()[3].click(); // a tap
    expect(v.onPick).toHaveBeenCalledWith('Lift 4');
    expect(v.value()).toBe('Lift 4');
    expect(v.onCommit).toHaveBeenCalledTimes(1);
    expect(v.options()).toHaveLength(0);
  });

  it('stays open when the keyboard is put away, and ends on a tap outside', () => {
    const v = mount();
    v.input.dispatchEvent(new Event('focus'));
    v.input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null })); // keyboard hidden
    expect(v.options().length).toBeGreaterThan(0);
    expect(v.onCommit).not.toHaveBeenCalled();
    pointerDown(v.outside);
    expect(v.options()).toHaveLength(0);
    expect(v.onCommit).toHaveBeenCalledTimes(1);
  });

  it('commits on Enter', () => {
    const v = mount();
    v.input.dispatchEvent(new Event('focus'));
    v.input.value = 'Lift 2';
    v.input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    v.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(v.value()).toBe('Lift 2');
    expect(v.onCommit).toHaveBeenCalledTimes(1);
    expect(v.options()).toHaveLength(0);
  });
});

describe('ExerciseNameInput with quick picks of its own (listWhenEmpty={false})', () => {
  it('keeps the list closed on an empty field and opens it once something is typed', () => {
    const [value, setValue] = createSignal('');
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(
      () => <ExerciseNameInput value={value()} onInput={setValue} suggestions={NAMES} listWhenEmpty={false} />,
      root,
    );
    const input = root.querySelector('input');
    const options = () => root.querySelectorAll('[role=option]');
    input.dispatchEvent(new Event('focus'));
    expect(options()).toHaveLength(0);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    input.value = 'Lift 1';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(options().length).toBeGreaterThan(0); // Lift 10–19
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });
});
