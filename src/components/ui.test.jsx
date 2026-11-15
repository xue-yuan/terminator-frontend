// @vitest-environment happy-dom
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ChipToggle, ConfirmSheet } from './ui';

let dispose;
afterEach(() => {
  dispose?.();
  document.body.innerHTML = '';
});
const mount = (ui) => {
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(ui, root);
  return root;
};
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

describe('ConfirmSheet', () => {
  it('confirms before closing, so the handler still sees what it was opened for', () => {
    const [target, setTarget] = createSignal({ id: 'w1' });
    const confirmed = vi.fn();
    const root = mount(() => (
      <ConfirmSheet
        open={!!target()}
        onClose={() => setTarget(null)}
        onConfirm={() => confirmed(target()?.id)}
        title="Delete?"
        confirmLabel="Delete"
      />
    ));
    button(root, 'Delete').click();
    expect(confirmed).toHaveBeenCalledWith('w1');
    expect(target()).toBeNull();
  });
});

describe('ChipToggle', () => {
  it("doesn't submit the form it sits in", () => {
    const submitted = vi.fn((e) => e.preventDefault());
    const changed = vi.fn();
    const root = mount(() => (
      <form onSubmit={submitted}>
        <ChipToggle
          label="Unit"
          value="kg"
          options={[
            ['kg', 'kg'],
            ['lb', 'lb'],
          ]}
          onChange={changed}
        />
      </form>
    ));
    button(root, 'lb').click();
    expect(changed).toHaveBeenCalledWith('lb');
    expect(submitted).not.toHaveBeenCalled();
  });
});
