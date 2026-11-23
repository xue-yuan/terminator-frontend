// Share cards: a finished workout or a week's/month's recap drawn as a
// 1080 × 1350 picture (4:5, what Instagram and chats show whole), for the
// share sheet. Drawn on a canvas with the system font, in the theme's accent
// colours on a dark card, so it looks like the app wherever it's posted.

import { formatClock, formatDistance, formatDuration, formatLoad, formatNumber, isTimedSet, plural } from './format';
import { convert } from './units';

const W = 1080;
const H = 1350;
const PAD = 84;
const SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, 'Segoe UI', Roboto, sans-serif";
const ROUNDED = `ui-rounded, 'SF Pro Rounded', ${SANS}`;
const MEDALS = { bronze: '#d08a4f', silver: '#c0c6cf', gold: '#f5c542', platinum: '#9be7ff', special: '#d6a8ff' };

/** The theme's accent colours (lib/theme.js sets them on the page). */
function palette() {
  const css = getComputedStyle(document.documentElement);
  const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    accent: get('--accent', '#ff6a1a'),
    accent2: get('--accent-2', '#ff9a3c'),
    onAccent: get('--on-accent', '#fff'),
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const font = (weight, size, family = SANS) => `${weight} ${size}px ${family}`;

/** Text cut to fit `max` px, with an ellipsis. */
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Words wrapped into at most `lines` lines of `max` px (the last one cut to fit). */
function wrap(ctx, text, max, lines) {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= max || !line) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  if (out.length > lines) out.splice(lines - 1, out.length, out.slice(lines - 1).join(' '));
  return out.map((l, i) => (i === out.length - 1 ? fit(ctx, l, max) : l));
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return [c, c.getContext('2d')];
}

/** Dark card, a glow of the accent colours, and the app's mark at the top with `right` text. */
function background(ctx, colors, right) {
  ctx.fillStyle = '#0c0c10';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.9, -80, 40, W * 0.9, -80, 1100);
  glow.addColorStop(0, `${colors.accent}cc`);
  glow.addColorStop(0.45, `${colors.accent2}33`);
  glow.addColorStop(1, '#0c0c1000');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // The mark: a visor slit with one eye (components/ui.jsx Logo).
  const s = 64;
  ctx.fillStyle = colors.accent;
  roundRect(ctx, PAD, PAD, s, s, 14);
  ctx.fill();
  ctx.fillStyle = '#111';
  roundRect(ctx, PAD + s * 0.156, PAD + s * 0.402, s * 0.688, s * 0.195, 3);
  ctx.fill();
  ctx.fillStyle = '#fff';
  roundRect(ctx, PAD + s * 0.441, PAD + s * 0.441, s * 0.117, s * 0.117, 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = font(800, 30);
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  ctx.fillText('TERMINATOR', PAD + s + 22, PAD + s / 2 + 1);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = font(600, 30);
  ctx.fillText(right, W - PAD, PAD + s / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** "Sarah Connor · ● Iron Devotee · Level 12" under the title. */
function byline(ctx, y, { name, title, level }) {
  ctx.font = font(600, 34);
  let x = PAD;
  const parts = [];
  if (name) parts.push({ text: name, color: 'rgba(255,255,255,0.85)' });
  if (title) parts.push({ text: title.title, color: MEDALS[title.medal] ?? '#fff', dot: true });
  if (level) parts.push({ text: `Level ${level}`, color: 'rgba(255,255,255,0.6)' });
  parts.forEach((p, i) => {
    if (i) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.textAlign = 'center';
      ctx.fillText('·', x + 22, y);
      ctx.textAlign = 'left';
      x += 44;
    }
    if (p.dot) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x + 10, y - 11, 10, 0, Math.PI * 2);
      ctx.fill();
      x += 30;
    }
    ctx.fillStyle = p.color;
    const text = fit(ctx, p.text, W - PAD - x);
    ctx.fillText(text, x, y);
    x += ctx.measureText(text).width;
  });
}

/** Big numbers in a row of tiles: [{ label, value, unit }]. */
function stats(ctx, y, list, colors, { h = 210 } = {}) {
  const gap = 20;
  const w = (W - 2 * PAD - gap * (list.length - 1)) / list.length;
  const top = h === 210 ? 58 : 50;
  const base = h === 210 ? 160 : 132;
  list.forEach((s, i) => {
    const x = PAD + i * (w + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(ctx, x, y, w, h, 32);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = font(700, 26);
    ctx.letterSpacing = '2px';
    ctx.fillText(s.label.toUpperCase(), x + 32, y + top);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = '#fff';
    let size = h === 210 ? 84 : 72;
    ctx.font = font(600, 34);
    const uw = s.unit ? ctx.measureText(` ${s.unit}`).width : 0;
    ctx.font = font(700, size, ROUNDED);
    while (size > 40 && ctx.measureText(String(s.value)).width + uw > w - 64) {
      size -= 4;
      ctx.font = font(700, size, ROUNDED);
    }
    ctx.fillText(String(s.value), x + 32, y + base);
    if (s.unit) {
      const vw = ctx.measureText(String(s.value)).width;
      ctx.font = font(600, 34);
      ctx.fillStyle = colors.accent2;
      ctx.fillText(` ${s.unit}`, x + 32 + vw, y + base);
    }
  });
  return y + h;
}

/** A section label: "EXERCISES". */
function label(ctx, y, text) {
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = font(700, 26);
  ctx.letterSpacing = '3px';
  ctx.fillText(text.toUpperCase(), PAD, y);
  ctx.letterSpacing = '0px';
}

/** Rows of name (left) and value (right), with an optional PR pill. Returns the y after them. */
function rows(ctx, y, list, colors, { max = 6, height = 74, more = true } = {}) {
  const shown = list.slice(0, max);
  shown.forEach((r, i) => {
    const top = y + i * height;
    if (i) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(PAD, top, W - 2 * PAD, 2);
    }
    const base = top + height / 2 + 13;
    ctx.font = font(600, 36, ROUNDED);
    const valueWidth = ctx.measureText(r.value).width;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'right';
    ctx.fillText(r.value, W - PAD, base);
    ctx.textAlign = 'left';
    let nameMax = W - 2 * PAD - valueWidth - 40;
    if (r.pr) {
      ctx.font = font(800, 22);
      const pw = ctx.measureText('PR').width + 28;
      ctx.fillStyle = colors.accent;
      roundRect(ctx, W - PAD - valueWidth - pw - 18, base - 30, pw, 38, 19);
      ctx.fill();
      ctx.fillStyle = colors.onAccent;
      ctx.fillText('PR', W - PAD - valueWidth - pw - 4, base - 3);
      nameMax -= pw + 18;
    }
    ctx.fillStyle = '#fff';
    ctx.font = font(600, 38);
    ctx.fillText(fit(ctx, r.name, nameMax), PAD, base);
  });
  let end = y + shown.length * height;
  if (more && list.length > max) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = font(600, 30);
    ctx.fillText(`+ ${plural(list.length - max, 'more exercise', 'more exercises')}`, PAD, end + 44);
    end += 60;
  }
  return end;
}

/** A banner in the accent colour at the bottom: "3 new PRs". */
function banner(ctx, text, colors) {
  const h = 104;
  const y = H - PAD - h;
  const grad = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
  grad.addColorStop(0, colors.accent);
  grad.addColorStop(1, colors.accent2);
  ctx.fillStyle = grad;
  roundRect(ctx, PAD, y, W - 2 * PAD, h, 30);
  ctx.fill();
  ctx.fillStyle = colors.onAccent;
  ctx.font = font(800, 40, ROUNDED);
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, y + h / 2 + 14);
  ctx.textAlign = 'left';
}

const toBlob = (c) =>
  new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the picture"))), 'image/png'),
  );

const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** The best set of a logged exercise, in words: "100 kg × 5", "5 km · 25:00", "1:30". */
function bestSet(item, distanceUnit) {
  const working = item.sets.filter((s) => s.kind !== 'warmup');
  const sets = working.length ? working : item.sets;
  if (sets.some(isTimedSet)) {
    const far = Math.max(0, ...sets.map((s) => s.distance_m ?? 0));
    const long = Math.max(0, ...sets.map((s) => s.duration_seconds ?? 0));
    if (far > 0) {
      const time = sets.reduce((t, s) => t + (s.duration_seconds ?? 0), 0);
      const total = sets.reduce((m, s) => m + (s.distance_m ?? 0), 0);
      return [formatDistance(total, distanceUnit), time ? formatClock(time) : null].filter(Boolean).join(' · ');
    }
    return sets.length > 1 ? `${formatClock(long)} · ${sets.length} sets` : formatClock(long);
  }
  const top = sets.reduce(
    (best, s) => (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best),
    null,
  );
  if (!top) return '';
  const load = top.weight > 0 ? `${formatLoad(top.weight)} ${item.weight_unit ?? 'kg'}` : 'BW';
  return sets.length > 1 ? `${load} × ${top.reps} · ${sets.length} sets` : `${load} × ${top.reps}`;
}

/**
 * A finished workout as a picture (PNG blob).
 * who: { name, title: { title, medal } | null, level }; unit / distanceUnit: for the totals.
 */
export async function workoutCard(workout, { who = {}, unit = 'kg', distanceUnit = 'km' } = {}) {
  const [c, ctx] = canvas();
  const colors = palette();
  background(ctx, colors, dateFmt.format(new Date(workout.performed_at)));

  ctx.fillStyle = '#fff';
  ctx.font = font(800, 92);
  const title = wrap(ctx, workout.name || 'Workout', W - 2 * PAD, 2);
  title.forEach((line, i) => ctx.fillText(line, PAD, 290 + i * 100));
  let y = 290 + (title.length - 1) * 100 + 70;
  byline(ctx, y, who);

  const working = workout.items.flatMap((i) => i.sets.filter((s) => s.kind !== 'warmup').map((s) => ({ s, i })));
  const volume = working.reduce((t, { s, i }) => t + convert(s.weight * s.reps, i.weight_unit ?? 'kg', unit), 0);
  const distance = working.reduce((m, { s }) => m + (s.distance_m ?? 0), 0);
  y = stats(
    ctx,
    y + 60,
    [
      { label: 'Time', value: formatDuration(workout.duration_seconds) ?? '–' },
      { label: 'Sets', value: working.length },
      volume > 0 || !distance
        ? { label: 'Volume', value: formatNumber(volume), unit }
        : { label: 'Distance', value: formatDistance(distance, distanceUnit) },
    ],
    colors,
  );

  const prs = working.filter(({ s }) => s.pr?.length).length;
  label(ctx, y + 92, 'Exercises');
  rows(
    ctx,
    y + 112,
    workout.items.map((item) => ({
      name: item.exercise_name,
      value: bestSet(item, distanceUnit),
      pr: item.sets.some((s) => s.pr?.length),
    })),
    colors,
    { max: prs ? 5 : 6 },
  );
  if (prs) banner(ctx, prs === 1 ? 'New personal record' : `${prs} new personal records`, colors);
  else footer(ctx);
  return toBlob(c);
}

function footer(ctx) {
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = font(600, 28);
  ctx.textAlign = 'center';
  ctx.fillText('Logged with Terminator', W / 2, H - PAD + 6);
  ctx.textAlign = 'left';
}

/** Days of a week (M T W T F S S) or a month (a little calendar), trained ones filled. */
function days(ctx, y, recap, colors) {
  const trained = new Set(recap.days);
  const start = new Date(`${recap.start}T00:00:00`);
  const end = new Date(`${recap.end}T00:00:00`);
  const key = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (recap.period === 'week') {
    const size = 96;
    const gap = (W - 2 * PAD - 7 * size) / 6;
    'MTWTFSS'.split('').forEach((letter, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const x = PAD + i * (size + gap);
      const on = trained.has(key(d));
      ctx.fillStyle = on ? colors.accent : 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = on ? colors.onAccent : 'rgba(255,255,255,0.5)';
      ctx.font = font(700, 36, ROUNDED);
      ctx.textAlign = 'center';
      ctx.fillText(letter, x + size / 2, y + size / 2 + 13);
      ctx.textAlign = 'left';
    });
    return y + size;
  }
  // A month: a row per week, Monday first, each day a pill.
  const lead = (start.getDay() + 6) % 7;
  const count = Math.round((end - start) / 86_400_000);
  const gap = 12;
  const w = (W - 2 * PAD - 6 * gap) / 7;
  const h = 34;
  const rowsNeeded = Math.ceil((lead + count) / 7);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = font(700, 24);
  ctx.textAlign = 'center';
  'MTWTFSS'.split('').forEach((letter, i) => ctx.fillText(letter, PAD + i * (w + gap) + w / 2, y + 20));
  ctx.textAlign = 'left';
  y += 40;
  for (let n = 0; n < count; n++) {
    const d = new Date(start);
    d.setDate(d.getDate() + n);
    const cell = lead + n;
    const x = PAD + (cell % 7) * (w + gap);
    const top = y + Math.floor(cell / 7) * (h + 10);
    ctx.fillStyle = trained.has(key(d)) ? colors.accent : 'rgba(255,255,255,0.08)';
    roundRect(ctx, x, top, w, h, 12);
    ctx.fill();
  }
  return y + rowsNeeded * (h + 10) - 10;
}

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** "Week of 16 Nov" / "November 2026" */
export function recapTitle(recap) {
  const start = new Date(`${recap.start}T00:00:00`);
  return recap.period === 'week' ? `Week of ${dayFmt.format(start)}` : monthFmt.format(start);
}

/** A week's or month's recap (GET /recap) as a picture (PNG blob). */
export async function recapCard(recap, { who = {}, unit = 'kg', distanceUnit = 'km' } = {}) {
  const [c, ctx] = canvas();
  const colors = palette();
  background(ctx, colors, recap.period === 'week' ? 'Weekly Recap' : 'Monthly Recap');

  ctx.fillStyle = '#fff';
  ctx.font = font(800, 92);
  ctx.fillText(fit(ctx, recapTitle(recap), W - 2 * PAD), PAD, 290);
  byline(ctx, 360, who);

  // Everything above the banner (y 1162): two rows of numbers, the days, and
  // for a week (whose days take one row) the most trained exercises.
  const t = recap.totals;
  const volume = convert(t.volume_kg, 'kg', unit);
  let y = stats(
    ctx,
    420,
    [
      { label: 'Workouts', value: t.workouts },
      { label: 'Time', value: t.duration_seconds ? formatDuration(t.duration_seconds) : '–' },
    ],
    colors,
    { h: 170 },
  );
  y = stats(
    ctx,
    y + 16,
    [
      { label: 'Sets', value: t.working_sets },
      volume > 0 || !t.distance_m
        ? { label: 'Volume', value: formatNumber(volume), unit }
        : { label: 'Distance', value: formatDistance(t.distance_m, distanceUnit) },
    ],
    colors,
    { h: 170 },
  );
  y = days(ctx, y + 56, recap, colors);

  if (recap.period === 'week') {
    label(ctx, y + 70, 'Most trained');
    rows(
      ctx,
      y + 82,
      recap.exercises.map((e) => ({
        name: e.exercise_name,
        value: plural(e.sets, 'set'),
        pr: recap.records.some((r) => r.exercise_id === e.exercise_id),
      })),
      colors,
      { max: 2, height: 62, more: false },
    );
  }

  const prs = recap.records.length;
  const titles = recap.unlocks.length;
  const parts = [
    prs ? plural(prs, 'PR', 'PRs') : null,
    recap.xp ? `+${formatNumber(recap.xp)} XP` : null,
    titles ? plural(titles, 'new title') : null,
  ].filter(Boolean);
  if (parts.length) banner(ctx, parts.join('  ·  '), colors);
  else footer(ctx);
  return toBlob(c);
}
