// A finished workout gets a moment: confetti from both bottom corners, a short
// fanfare, and (WorkoutDetail) a "Workout Complete" card whose numbers count up,
// with the XP it earned and, once the server has it, the titles it unlocked.
// Only right after Finish & Save, never when an edit is saved or the page is
// opened again later.

import { createSignal } from 'solid-js';
import { celebrate as enabled } from './prefs';
import { reducedMotion } from './motion';
import { fanfare, primeSound } from './sound';

let pending = null;

// The workout whose card is on screen, and the titles that arrived for it.
const [showing, setShowing] = createSignal(null);
const [freshUnlocks, setFreshUnlocks] = createSignal([]);
export { freshUnlocks, showing as celebrating };

/** Call from the Finish tap (audio may only start from a tap). */
export function prepareCelebration() {
  if (enabled()) primeSound();
}

/**
 * The workout was just saved; its page opens next. `records`: how many PRs it
 * set; `xp`: { before, gained, levelUp } (null before achievements ever loaded).
 * `delay`: ms until the workout has slid out of the way.
 */
export function celebrateFinish(workoutId, { records = 0, xp = null, delay = 280 } = {}) {
  if (!enabled()) return;
  pending = { id: workoutId, xp };
  setFreshUnlocks([]);
  setTimeout(() => {
    fanfare();
    navigator.vibrate?.([12, 60, 18]); // Android; iPhones can't vibrate from a web page
    confetti({ volleys: records || xp?.levelUp ? 2 : 1 });
  }, delay);
}

/** This workout's celebration ({ xp }), once, if it was just finished; otherwise null. */
export function takeCelebration(workoutId) {
  if (pending?.id !== workoutId) return null;
  const taken = pending;
  pending = null;
  return taken;
}

/** The card is on screen (WorkoutDetail), or gone (null). */
export const showCelebration = (workoutId) => setShowing(workoutId);

/** Titles the server just confirmed for the workout on screen: onto its card, with a little more confetti. */
export function addFreshUnlocks(list) {
  setFreshUnlocks((current) => [...current, ...list]);
  confetti({ volleys: 1 });
}

// ---- confetti -----------------------------------------------------------------

const rand = (min, max) => min + Math.random() * (max - min);

/** The theme's own colours, plus a gold, so it looks like part of the app. */
function confettiColors() {
  const css = getComputedStyle(document.documentElement);
  const theme = ['--accent', '--accent-2', '--heat-1', '--heat-3']
    .map((name) => css.getPropertyValue(name).trim())
    .filter(Boolean);
  return [...theme, '#ffd60a', '#ffd60a'];
}

/**
 * Paper confetti shot up from both bottom corners, fluttering down as it
 * fades. Drawn on a canvas over everything that taps pass through; it removes
 * itself when done. Nothing with reduced motion (the card still fades in).
 */
export function confetti({ volleys = 1 } = {}) {
  if (reducedMotion() || typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:70;' +
    'margin:0;padding:0;border:0;background:none;max-width:none;max-height:none';
  document.body.append(canvas);
  // Over an open sheet (a modal dialog sits in the top layer, above any z-index):
  // join the top layer too, after it, so the confetti falls in front of it.
  if (document.querySelector('dialog[open]') && canvas.showPopover) {
    canvas.popover = 'manual';
    canvas.showPopover();
  }
  ctx.scale(dpr, dpr);

  const colors = confettiColors();
  const pieces = [];
  // Decay per 60 fps frame: the burst slows quickly, so its reach is about v / (1 - DECAY).
  const DECAY = 0.915;
  const reach = Math.min(H * 0.9, 760);
  const count = Math.round(Math.min(90, Math.max(55, W / 5)));
  const shoot = (fromLeft) => {
    const x = fromLeft ? -8 : W + 8;
    // Up and in, towards the middle of the screen.
    const base = fromLeft ? -Math.PI / 2 + 0.38 : -Math.PI / 2 - 0.38;
    for (let i = 0; i < count; i++) {
      const angle = base + rand(-0.3, 0.3);
      const speed = ((reach * (1 - DECAY)) / Math.abs(Math.sin(angle))) * rand(0.55, 1.08);
      const round = Math.random() < 0.22;
      pieces.push({
        x,
        y: H + 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: round ? rand(5, 7) : rand(6, 10),
        h: round ? 0 : rand(10, 15),
        color: colors[Math.floor(Math.random() * colors.length)],
        spin: rand(0, Math.PI * 2),
        spinSpeed: rand(-0.18, 0.18),
        flip: rand(0, Math.PI * 2),
        flipSpeed: rand(0.08, 0.2),
        sway: rand(0, Math.PI * 2),
        swaySpeed: rand(0.03, 0.07),
        fall: rand(2.2, 3.4), // px per frame once the burst has spent itself
        age: 0,
        life: rand(150, 210), // frames
      });
    }
  };
  const fire = () => {
    shoot(true);
    shoot(false);
  };
  fire();
  for (let v = 1; v < volleys; v++) setTimeout(fire, 420 * v);

  let last = performance.now();
  let started = false;
  const frame = (now) => {
    // Time-based, in 60 fps frames, so a 120 Hz screen doesn't run it double speed;
    // capped so a stall (the app in the background) doesn't teleport everything.
    const f = Math.min(3, (now - last) / (1000 / 60));
    last = now;
    ctx.clearRect(0, 0, W, H);
    const decay = DECAY ** f;
    let alive = 0;
    for (const p of pieces) {
      p.age += f;
      if (p.age >= p.life || p.y > H + 30) continue;
      alive++;
      p.vx *= decay;
      p.vy *= decay;
      p.sway += p.swaySpeed * f;
      p.x += (p.vx + Math.sin(p.sway) * 0.9) * f;
      p.y += (p.vy + p.fall) * f;
      p.spin += p.spinSpeed * f;
      p.flip += p.flipSpeed * f;
      const fade = Math.min(1, (p.life - p.age) / 40);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      if (p.h) {
        // A paper strip turning over: it narrows to its edge and back.
        ctx.scale(1, Math.cos(p.flip));
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else {
        ctx.scale(Math.max(0.25, Math.abs(Math.cos(p.flip))), 1);
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // Later volleys haven't been added yet: keep going until they've come and gone.
    if (alive || !started) {
      started ||= pieces.length >= count * 2 * volleys;
      requestAnimationFrame(frame);
    } else canvas.remove();
  };
  requestAnimationFrame(frame);
  setTimeout(() => canvas.remove(), 6000 + 420 * volleys); // never left behind
}

// ---- numbers counting up ------------------------------------------------------

/**
 * 0 → 1 over `duration` ms after `delay`, easing out like iOS; calls `onStep`
 * each frame. Reduced motion jumps straight to 1.
 */
export function countUp(onStep, { delay = 0, duration = 900 } = {}) {
  if (reducedMotion()) {
    onStep(1);
    return () => {};
  }
  onStep(0);
  let start = null;
  let stopped = false;
  const ease = (t) => 1 - (1 - t) ** 3;
  const frame = (now) => {
    if (stopped) return;
    start ??= now;
    const t = Math.min(1, (now - start) / duration);
    onStep(ease(t));
    if (t < 1) requestAnimationFrame(frame);
  };
  const timer = setTimeout(() => requestAnimationFrame(frame), delay);
  return () => {
    stopped = true;
    clearTimeout(timer);
    onStep(1);
  };
}
