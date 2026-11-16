import { createEffect, createMemo, createSignal, For, on, Show, untrack } from 'solid-js';
import { Plus, Scale, Trash2 } from 'lucide-solid';
import { bodyWeightList, deleteBodyWeight, logBodyWeight } from '../lib/data';
import { addDays } from '../lib/dates';
import { formatDay, formatTime, formatWeight, plural, toLocalInput } from '../lib/format';
import { unit as defaultUnit } from '../lib/prefs';
import { toast, undoable } from '../lib/toast';
import { convert, UNITS } from '../lib/units';
import LineChart from '../components/LineChart';
import { SwipeRow } from '../components/SwipeRow';
import { ChipToggle, EmptyState, PageHeader, Section, Sheet, StatRow } from '../components/ui';

const DAY = 86_400_000;
const RANGES = [
  ['3m', '3M', 91 * DAY],
  ['1y', '1Y', 365 * DAY],
  ['all', 'All', Infinity],
];

/** One decimal at most: converted weights aren't exact anyway. */
const w1 = (v) => formatWeight(Math.round(v * 10) / 10);

/** Delete a weigh-in, with Undo (it's logged again under the same id). */
function deleteWithUndo(entry) {
  const { id, weight, unit, measured_at } = entry;
  deleteBodyWeight(id);
  undoable('Weigh-in deleted', () => logBodyWeight({ id, weight, unit, measured_at }));
}

export default function Body() {
  const latest = () => bodyWeightList()[0] ?? null;
  const [viewUnit, setViewUnit] = createSignal(untrack(() => latest()?.unit) ?? defaultUnit());
  const [range, setRange] = createSignal('3m');
  const [selected, setSelected] = createSignal(null);
  const [logging, setLogging] = createSignal(false);

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
      <PageHeader
        back="/profile"
        backLabel="You"
        title="Body Weight"
        actions={
          <button
            type="button"
            class="btn btn-icon text-accent"
            aria-label="Log weight"
            onClick={() => setLogging(true)}
          >
            <Plus size={26} strokeWidth={2.25} />
          </button>
        }
      />

      <Show
        when={bodyWeightList().length}
        fallback={
          <div class="card mt-3">
            <EmptyState
              icon={Scale}
              title="No weigh-ins yet"
              body="Log your weight now and then to see the trend here."
            >
              <button type="button" class="btn btn-primary" onClick={() => setLogging(true)}>
                Log Weight
              </button>
            </EmptyState>
          </div>
        }
      >
        <div class="mt-3">
          <StatRow
            stats={[
              { label: 'Latest', value: w1(inView(latest())), unit: viewUnit() },
              {
                label: '30 days',
                value:
                  change() == null ? null : `${change() > 0 ? '+' : change() < 0 ? '−' : '±'}${w1(Math.abs(change()))}`,
                unit: change() == null ? null : viewUnit(),
              },
              { label: 'Weigh-ins', value: bodyWeightList().length },
            ]}
          />
        </div>

        <section class="card mt-6 px-4 pt-3 pb-1" aria-label="Body weight chart">
          <Show
            when={points().length}
            fallback={<p class="t-sub py-16 text-center text-label-2">Nothing logged in this period.</p>}
          >
            <div aria-live="polite">
              <p class="num text-[34px] leading-10 font-semibold">
                {w1(point().y)}
                <span class="ml-1 text-[17px] font-medium text-label-2">{viewUnit()}</span>
              </p>
              <p class="t-foot text-label-2">
                {formatDay(point().entry.measured_at)} · {formatTime(point().entry.measured_at)}
              </p>
            </div>
            <LineChart
              points={points()}
              selected={selIndex()}
              onSelect={setSelected}
              label={`Body weight, ${plural(points().length, 'weigh-in')}. Use the arrow keys to read each one.`}
            />
          </Show>
          <div class="flex items-center justify-between gap-2 pt-1 pb-3">
            <ChipToggle
              label="Time range"
              value={range()}
              options={RANGES.map(([k, l]) => [k, l])}
              onChange={setRange}
              class="w-36"
            />
            <ChipToggle label="Unit" value={viewUnit()} options={UNITS.map((u) => [u, u])} onChange={setViewUnit} />
          </div>
        </section>
        <Show when={points().length === 1}>
          <p class="group-footer">Log it again to see a trend.</p>
        </Show>

        <Section title="History" footer="Swipe a weigh-in left to delete it.">
          <For each={bodyWeightList()}>
            {(e) => (
              <SwipeRow actions={[{ label: 'Delete', icon: Trash2, tone: 'bad', onAction: () => deleteWithUndo(e) }]}>
                <div class="row">
                  <span class="t-sub flex-1 text-label-2">
                    {formatDay(e.measured_at)} · {formatTime(e.measured_at)}
                  </span>
                  <span class="num text-[17px] font-semibold">
                    {formatWeight(e.weight)}
                    <span class="ml-1 text-[14px] font-medium text-label-2">{e.unit}</span>
                  </span>
                </div>
              </SwipeRow>
            )}
          </For>
        </Section>
      </Show>

      <LogSheet open={logging()} latest={latest()} onClose={() => setLogging(false)} />
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
    <Sheet open={props.open} onClose={() => props.onClose()} title="Log Weight">
      <form onSubmit={submit}>
        <div class="group">
          <div class="row">
            <input
              class="field-inline num h-12 text-[34px] font-semibold"
              inputmode="decimal"
              aria-label="Weight"
              placeholder="0"
              value={weight()}
              onInput={(e) => setWeight(e.currentTarget.value)}
              onFocus={(e) => e.currentTarget.select()}
            />
            <ChipToggle label="Unit" value={unit()} options={UNITS.map((u) => [u, u])} onChange={setUnit} />
          </div>
          <label class="row">
            <span class="flex-1">Date</span>
            <input
              type="datetime-local"
              class="field-inline flex-none text-right text-label-2"
              aria-label="When"
              value={when()}
              onChange={(e) => setWhen(e.currentTarget.value)}
            />
          </label>
        </div>
        <button type="submit" class="btn btn-lg btn-primary btn-block mt-6">
          Save
        </button>
      </form>
    </Sheet>
  );
}
