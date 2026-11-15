import { createEffect, createMemo, createSignal, For, on, Show, untrack } from 'solid-js';
import { CloudUpload, Plus, Trash2 } from 'lucide-solid';
import { bodyWeightList, deleteBodyWeight, logBodyWeight } from '../lib/data';
import { addDays } from '../lib/dates';
import { formatDay, formatTime, formatWeight, toLocalInput } from '../lib/format';
import { unit as defaultUnit } from '../lib/prefs';
import { toast } from '../lib/toast';
import { convert, UNITS } from '../lib/units';
import LineChart from '../components/LineChart';
import { ChipToggle, ConfirmSheet, EmptyState, PageHeader, Sheet, StatRow } from '../components/ui';

const DAY = 86_400_000;
const RANGES = [
  ['3m', '3M', 91 * DAY],
  ['1y', '1Y', 365 * DAY],
  ['all', 'All', Infinity],
];

/** One decimal at most: converted weights aren't exact anyway. */
const w1 = (v) => formatWeight(Math.round(v * 10) / 10);

export default function Body() {
  const latest = () => bodyWeightList()[0] ?? null;
  const [viewUnit, setViewUnit] = createSignal(untrack(() => latest()?.unit) ?? defaultUnit());
  const [range, setRange] = createSignal('3m');
  const [selected, setSelected] = createSignal(null);
  const [logging, setLogging] = createSignal(false);
  const [removing, setRemoving] = createSignal(null);

  const inView = (e) => convert(e.weight, e.unit, viewUnit());

  /** Change since the weigh-in closest to 30 days before the latest one. */
  const change = createMemo(() => {
    const list = bodyWeightList();
    if (list.length < 2) return null;
    const target = addDays(list[0].measured_at, -30).getTime();
    const before = list
      .slice(1)
      .reduce((best, e) =>
        Math.abs(Date.parse(e.measured_at) - target) < Math.abs(Date.parse(best.measured_at) - target) ? e : best,
      );
    return inView(list[0]) - inView(before);
  });

  const points = createMemo(() => {
    const span = RANGES.find(([key]) => key === range())[2];
    const cutoff = Date.now() - span;
    return bodyWeightList()
      .filter((e) => Date.parse(e.measured_at) >= cutoff)
      .map((e) => ({ x: Date.parse(e.measured_at), y: inView(e), entry: e }))
      .reverse();
  });
  createEffect(on([range, viewUnit], () => setSelected(null), { defer: true }));
  const selIndex = () => {
    const n = points().length;
    const i = selected();
    return i == null || i >= n ? n - 1 : i;
  };
  const point = () => points()[selIndex()];

  return (
    <>
      <PageHeader back="/profile" eyebrow="Body" title="Body weight" />

      <button class="btn btn-lg btn-signal btn-block" onClick={() => setLogging(true)}>
        <Plus size={20} /> Log weight
      </button>

      <Show
        when={bodyWeightList().length}
        fallback={
          <div class="mt-6">
            <EmptyState title="No weigh-ins yet" body="Log your weight now and then to see the trend here." />
          </div>
        }
      >
        <div class="mt-6">
          <StatRow
            stats={[
              { label: 'Latest', value: w1(inView(latest())), unit: viewUnit() },
              {
                label: '30-day change',
                value:
                  change() == null ? null : `${change() > 0 ? '+' : change() < 0 ? '−' : '±'}${w1(Math.abs(change()))}`,
                unit: change() == null ? null : viewUnit(),
              },
              { label: 'Weigh-ins', value: bodyWeightList().length },
            ]}
          />
        </div>

        <div class="mt-6 flex items-center justify-between gap-2">
          <ChipToggle label="Time range" value={range()} options={RANGES.map(([k, l]) => [k, l])} onChange={setRange} />
          <ChipToggle label="Unit" value={viewUnit()} options={UNITS.map((u) => [u, u])} onChange={setViewUnit} />
        </div>
        <section class="mt-3 border-2 border-ink bg-raised px-3 pt-3 pb-1" aria-label="Body weight chart">
          <Show
            when={points().length}
            fallback={<p class="py-16 text-center text-muted">Nothing logged in this period.</p>}
          >
            <div class="px-1" aria-live="polite">
              <p class="display text-[2.5rem] leading-none">
                {w1(point().y)}
                <span class="ml-1 text-lg text-muted">{viewUnit()}</span>
              </p>
              <p class="mt-1 text-sm text-muted">
                {formatDay(point().entry.measured_at)} · {formatTime(point().entry.measured_at)}
              </p>
            </div>
            <LineChart
              points={points()}
              selected={selIndex()}
              onSelect={setSelected}
              label={`Body weight, ${points().length} weigh-ins. Use the arrow keys to read each one.`}
            />
          </Show>
        </section>
        <Show when={points().length === 1}>
          <p class="mt-2 text-sm text-muted">Log it again to see a trend.</p>
        </Show>

        <h2 class="display mt-8 border-b-2 border-ink pb-1.5 text-xl">History</h2>
        <ol>
          <For each={bodyWeightList()}>
            {(e) => (
              <li class="rule flex items-center gap-3 border-b py-2">
                <span class="w-36 shrink-0 text-sm text-muted">
                  {formatDay(e.measured_at)} · {formatTime(e.measured_at)}
                </span>
                <span class="display flex-1 text-xl">
                  {formatWeight(e.weight)}
                  <span class="ml-1 text-sm text-muted">{e.unit}</span>
                </span>
                <Show when={e.pending}>
                  <CloudUpload size={14} class="shrink-0 text-warn" aria-label="Waiting to sync" />
                </Show>
                <button
                  class="btn btn-icon -mr-3 text-muted"
                  aria-label={`Delete weigh-in of ${formatDay(e.measured_at)}`}
                  onClick={() => setRemoving(e)}
                >
                  <Trash2 size={18} />
                </button>
              </li>
            )}
          </For>
        </ol>
      </Show>

      <LogSheet open={logging()} latest={latest()} onClose={() => setLogging(false)} />
      <ConfirmSheet
        open={!!removing()}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          deleteBodyWeight(removing().id);
          toast('Weigh-in deleted', 'success');
        }}
        title="Delete weigh-in?"
        confirmLabel="Delete"
        danger
      >
        <Show when={removing()}>
          {formatWeight(removing().weight)} {removing().unit} on {formatDay(removing().measured_at)}.
        </Show>
      </ConfirmSheet>
    </>
  );
}

function LogSheet(props) {
  const [weight, setWeight] = createSignal('');
  const [unit, setUnit] = createSignal(defaultUnit());
  const [when, setWhen] = createSignal('');
  // Start from the last weigh-in each time the sheet opens.
  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return;
        const last = untrack(() => props.latest);
        setWeight(last ? String(last.weight) : '');
        setUnit(last?.unit ?? defaultUnit());
        setWhen(toLocalInput(new Date().toISOString()));
      },
    ),
  );

  function submit(event) {
    event.preventDefault();
    const value = Number(weight().replace(',', '.'));
    if (!(value > 0 && value <= 1000)) return toast('Enter your weight', 'error');
    const at = when() ? new Date(when()) : new Date();
    if (Number.isNaN(at.getTime())) return toast('Pick a date and time', 'error');
    logBodyWeight({ weight: value, unit: unit(), measured_at: at.toISOString() });
    toast('Weight logged', 'success');
    props.onClose();
  }

  return (
    <Sheet open={props.open} onClose={() => props.onClose()} title="Log weight">
      <form onSubmit={submit} class="grid gap-4">
        <div class="flex items-end gap-2">
          <label class="grid flex-1 gap-1">
            <span class="eyebrow">Weight</span>
            <input
              class="field display h-16 text-center !text-4xl"
              inputmode="decimal"
              aria-label="Weight"
              value={weight()}
              onInput={(e) => setWeight(e.currentTarget.value)}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <ChipToggle label="Unit" value={unit()} options={UNITS.map((u) => [u, u])} onChange={setUnit} />
        </div>
        <label class="grid gap-1">
          <span class="eyebrow">When</span>
          <input
            type="datetime-local"
            class="field"
            aria-label="When"
            value={when()}
            onChange={(e) => setWhen(e.currentTarget.value)}
          />
        </label>
        <button type="submit" class="btn btn-lg btn-signal btn-block">
          Save
        </button>
      </form>
    </Sheet>
  );
}
