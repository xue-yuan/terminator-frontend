import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';

// Single-series line over time, sized to its container. The selected point
// (crosshair) is controlled by the parent, which shows its value in a readout
// above the chart: on a phone there is no hover, so the reader drags across
// the plot (or uses the arrow keys) to move it.

const HEIGHT = 196;
const PAD = { top: 12, right: 14, bottom: 26, left: 46 };

function niceStep(range, count) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

/** Round y-axis ticks covering the data (never below zero). */
function yScale(values) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    min -= pad;
    max += pad;
  }
  const step = niceStep(max - min, 3);
  const lo = Math.max(0, Math.floor(min / step) * step);
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi: Math.max(hi, lo + step), ticks };
}

const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' });

export default function LineChart(props) {
  let wrap;
  const [width, setWidth] = createSignal(320);
  onMount(() => {
    setWidth(wrap.clientWidth || 320);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(wrap);
    onCleanup(() => ro.disconnect());
  });

  const geo = createMemo(() => {
    const pts = props.points;
    const w = width();
    const innerW = Math.max(1, w - PAD.left - PAD.right);
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const y = yScale(pts.map((p) => p.y));
    const x0 = pts[0].x;
    const span = pts[pts.length - 1].x - x0;
    const px = (x) => PAD.left + (span ? ((x - x0) / span) * innerW : innerW / 2);
    const py = (v) => PAD.top + innerH - ((v - y.lo) / (y.hi - y.lo)) * innerH;
    const coords = pts.map((p) => [px(p.x), py(p.y)]);
    const fmtY = y.hi >= 10000 ? (v) => compact.format(v) : (v) => full.format(v);
    const fmtX = span > 300 * 86_400_000 ? (t) => monthYear.format(t) : (t) => dayMonth.format(t);
    // Up to three date labels (first, middle, last), skipping ones that would collide.
    const xTicks = [];
    const minGap = 64;
    for (const i of new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1])) {
      const at = coords[i][0];
      if (xTicks.every((t) => Math.abs(t.at - at) >= minGap)) xTicks.push({ at, label: fmtX(pts[i].x) });
    }
    return { w, coords, py, y, fmtY, xTicks, path: coords.map(([a, b], i) => `${i ? 'L' : 'M'}${a},${b}`).join('') };
  });

  const nearest = (clientX) => {
    const rect = wrap.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = 0;
    geo().coords.forEach(([cx], i) => {
      if (Math.abs(cx - x) < Math.abs(geo().coords[best][0] - x)) best = i;
    });
    return best;
  };
  const pick = (e) => props.onSelect(nearest(e.clientX));
  const onKey = (e) => {
    const last = props.points.length - 1;
    const map = { ArrowLeft: props.selected - 1, ArrowRight: props.selected + 1, Home: 0, End: last };
    if (!(e.key in map)) return;
    e.preventDefault();
    props.onSelect(Math.min(last, Math.max(0, map[e.key])));
  };

  const showDots = () => props.points.length <= 40;
  const sel = () => geo().coords[props.selected];

  return (
    <div ref={wrap} class="relative select-none" style={{ height: `${HEIGHT}px` }}>
      <svg
        width={geo().w}
        height={HEIGHT}
        class="block touch-pan-y outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        role="img"
        aria-label={props.label}
        tabindex="0"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => (e.buttons || e.pointerType === 'mouse') && pick(e)}
        onKeyDown={onKey}
      >
        <For each={geo().y.ticks}>
          {(t) => (
            <g>
              <line
                x1={PAD.left}
                x2={geo().w - PAD.right}
                y1={geo().py(t)}
                y2={geo().py(t)}
                stroke="var(--sunk)"
                stroke-width="1"
                shape-rendering="crispEdges"
              />
              <text x={PAD.left - 8} y={geo().py(t)} dy="0.32em" text-anchor="end" fill="var(--muted)" font-size="11">
                {geo().fmtY(t)}
              </text>
            </g>
          )}
        </For>
        <For each={geo().xTicks}>
          {(t, i) => (
            <text
              x={t.at}
              y={HEIGHT - 6}
              text-anchor={
                geo().xTicks.length > 1 && i() === 0
                  ? 'start'
                  : i() === geo().xTicks.length - 1 && i() > 0
                    ? 'end'
                    : 'middle'
              }
              fill="var(--muted)"
              font-size="11"
            >
              {t.label}
            </text>
          )}
        </For>

        <Show when={sel()}>
          <line
            x1={sel()[0]}
            x2={sel()[0]}
            y1={PAD.top}
            y2={HEIGHT - PAD.bottom}
            stroke="var(--muted)"
            stroke-width="1"
            shape-rendering="crispEdges"
          />
        </Show>

        <path
          d={geo().path}
          fill="none"
          stroke="var(--chart-line)"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        <Show
          when={showDots()}
          fallback={
            <circle
              cx={geo().coords.at(-1)[0]}
              cy={geo().coords.at(-1)[1]}
              r="4"
              fill="var(--chart-line)"
              stroke="var(--raised)"
              stroke-width="2"
            />
          }
        >
          <For each={geo().coords}>
            {([cx, cy]) => (
              <circle cx={cx} cy={cy} r="4" fill="var(--chart-line)" stroke="var(--raised)" stroke-width="2" />
            )}
          </For>
        </Show>
        <Show when={sel()}>
          <circle cx={sel()[0]} cy={sel()[1]} r="6.5" fill="var(--chart-line)" stroke="var(--ink)" stroke-width="2" />
        </Show>
      </svg>
    </div>
  );
}
