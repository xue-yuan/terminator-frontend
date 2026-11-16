import { createSignal, For, onCleanup } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { reducedMotion } from '../lib/motion';

const ACTION_WIDTH = 76;
const TONES = { bad: 'bg-bad', accent: 'bg-accent', gray: 'bg-label-3', warn: 'bg-warn' };

// Only one row is open at a time: opening or touching another closes it.
let closeOpen = null;

/**
 * A list row you can swipe left, like iOS: a short swipe reveals the actions,
 * a long one runs the last action (the outermost one, e.g. Delete) right away.
 * Vertical scrolling still works (touch-action: pan-y), and the tap that ends a
 * swipe never reaches the row.
 *
 * actions: [{ label, icon?, tone?: 'bad' | 'accent' | 'gray' | 'warn', onAction }]
 * Put it straight inside a `.group` so the separators line up.
 */
export function SwipeRow(props) {
  const [x, setX] = createSignal(0);
  const [settling, setSettling] = createSignal(false);
  let el;
  let gesture = null;
  let suppressClick = false;

  const actionsWidth = () => props.actions.length * ACTION_WIDTH;
  const move = (to, animate = true) => {
    setSettling(animate && !reducedMotion());
    setX(to);
  };
  const close = () => {
    move(0);
    if (closeOpen === close) closeOpen = null;
  };
  const open = () => {
    if (closeOpen && closeOpen !== close) closeOpen();
    closeOpen = close;
    move(-actionsWidth());
  };
  onCleanup(() => closeOpen === close && (closeOpen = null));

  const run = (action) => {
    close();
    action.onAction();
  };
  // Long swipe: the row slides away, then the action runs.
  const commit = (action) => {
    if (closeOpen === close) closeOpen = null;
    move(-el.offsetWidth);
    setTimeout(
      () => {
        action.onAction();
        move(0, false); // if the row stays (e.g. the action was undone right away)
      },
      reducedMotion() ? 0 : 200,
    );
  };

  const onPointerDown = (e) => {
    if (props.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // A swipe ends without a click, so whatever the last gesture set is stale by now.
    suppressClick = false;
    if (closeOpen && closeOpen !== close) {
      closeOpen();
      suppressClick = true; // this tap only closes the other row
    }
    gesture = { x0: e.clientX, y0: e.clientY, base: x(), lock: null, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  };
  const onPointerMove = (e) => {
    if (!gesture) return;
    const dx = e.clientX - gesture.x0;
    const dy = e.clientY - gesture.y0;
    if (!gesture.lock) {
      if (Math.hypot(dx, dy) < 8) return;
      gesture.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (gesture.lock === 'x') e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (gesture.lock !== 'x') return;
    const width = el.offsetWidth;
    let next = gesture.base + dx;
    if (next > 0) next /= 4; // nothing on the left: resist
    if (next < -width) next = -width - (-width - next) / 4;
    gesture.v = (e.clientX - gesture.lastX) / Math.max(1, e.timeStamp - gesture.lastT);
    gesture.lastX = e.clientX;
    gesture.lastT = e.timeStamp;
    move(next, false);
  };
  const onPointerUp = () => {
    const g = gesture;
    gesture = null;
    if (!g || g.lock !== 'x') return;
    suppressClick = true;
    const shown = -x();
    if (props.fullSwipe !== false && shown > el.offsetWidth * 0.6) return commit(props.actions.at(-1));
    if (g.v < -0.4 || (g.v <= 0.4 && shown > actionsWidth() / 2)) open();
    else close();
  };
  const onClickCapture = (e) => {
    if (suppressClick || x() !== 0) {
      e.stopPropagation();
      e.preventDefault();
      if (!suppressClick) close(); // a tap on an open row closes it
    }
    suppressClick = false;
  };

  // When the row is pulled further than its actions, the last one stretches to fill (iOS).
  const stretch = () => Math.max(0, -x() - actionsWidth());

  return (
    <div
      ref={el}
      class={`relative ${props.class ?? ''}`}
      // At rest it neither clips nor stacks, so a dropdown inside (e.g. a name field) can spill over the next rows.
      style={{ ...props.style, overflow: x() ? 'hidden' : undefined }}
    >
      <div
        class="absolute inset-y-0 right-0 flex overflow-hidden"
        classList={{ invisible: x() === 0 }}
        style={{ width: `${Math.max(-x(), 0)}px` }}
        aria-hidden={x() === 0}
      >
        <For each={props.actions}>
          {(action, i) => {
            const last = () => i() === props.actions.length - 1;
            return (
              <button
                type="button"
                class={`flex h-full flex-col items-center justify-center gap-0.5 overflow-hidden text-[13px] font-medium text-white ${TONES[action.tone ?? 'bad']}`}
                style={{
                  width: last() ? `${ACTION_WIDTH + stretch()}px` : `${ACTION_WIDTH}px`,
                  'flex-shrink': last() ? 0 : 1,
                }}
                tabindex={x() === 0 ? -1 : 0}
                onClick={() => run(action)}
              >
                {action.icon && <Dynamic component={action.icon} size={20} />}
                {action.label}
              </button>
            );
          }}
        </For>
      </div>
      <div
        class="relative touch-pan-y bg-card"
        style={{
          'z-index': x() ? 1 : undefined,
          transform: x() ? `translateX(${x()}px)` : undefined,
          transition: settling() ? 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          gesture = null;
          if (x() !== 0 && x() !== -actionsWidth()) close();
        }}
        oncapture:click={onClickCapture}
        // Keyboard / VoiceOver: the actions are reachable with the context menu key.
        onContextMenu={(e) => {
          if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
          e.preventDefault();
          if (x()) close();
          else open();
        }}
      >
        {props.children}
      </div>
    </div>
  );
}
