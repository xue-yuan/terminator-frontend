import { createEffect, createMemo, createSignal, For, on, Show, untrack } from 'solid-js';
import { A, useNavigate, useParams } from '@solidjs/router';
import { ChartLine, ChevronRight, SearchX } from 'lucide-solid';
import { OfflineError } from '../lib/api';
import {
  catalogEntry,
  deleteExercise,
  exerciseById,
  exerciseByName,
  exerciseOnServer,
  exerciseOptions,
  exerciseSessions,
  fetchProgress,
  mergeExercise,
  muscleOf,
  saveExercise,
} from '../lib/data';
import { MUSCLE_GROUPS, muscleLabel } from '../lib/exercises';
import { formatClock, formatDay, formatLoad, formatNumber, formatWeight, plural } from '../lib/format';
import { online } from '../lib/network';
import { restSeconds, unit as defaultUnit, weightStep } from '../lib/prefs';
import { chartPoints, estimate1RM, METRICS, metricsFor, normalizeSessions, records } from '../lib/progress';
import { renameInDraft } from '../lib/session';
import { toast } from '../lib/toast';
import { UNITS } from '../lib/units';
import ExerciseNameInput from '../components/ExerciseNameInput';
import LineChart from '../components/LineChart';
import {
  ChipToggle,
  ConfirmSheet,
  EmptyState,
  PageHeader,
  Section,
  Segmented,
  Sheet,
  Spinner,
  StatRow,
} from '../components/ui';

const DAY = 86_400_000;
const RANGES = [
  ['3m', '3M', 91 * DAY],
  ['1y', '1Y', 365 * DAY],
  ['all', 'All', Infinity],
];

/** Weight for display: converted values get one decimal at most. */
const w1 = (v) => formatWeight(Math.round(v * 10) / 10);

export default function ExerciseDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const id = () => params.id;
  const exercise = () => exerciseById(id());
  const displayName = () => exercise()?.name ?? 'Exercise';

  const [viewUnit, setViewUnit] = createSignal(exercise()?.last_unit ?? defaultUnit());
  const [metric, setMetric] = createSignal(null);
  const [range, setRange] = createSignal('all');
  const [selected, setSelected] = createSignal(null);
  const [loading, setLoading] = createSignal(false);
  const [editing, setEditing] = createSignal(false);

  // Always ask the server for the full history; the cached copy shows meanwhile.
  // (An exercise created on this device has nothing on the server yet.)
  createEffect(
    on(id, async (exerciseId) => {
      setViewUnit(untrack(() => exercise()?.last_unit) ?? defaultUnit());
      if (!untrack(() => exerciseOnServer(exerciseId))) return;
      setLoading(true);
      try {
        await fetchProgress(exerciseId);
      } catch (err) {
        if (!(err instanceof OfflineError) && err.status !== 404) toast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    }),
  );

  const raw = createMemo(() => exerciseSessions(id()));
  const sessions = createMemo(() => normalizeSessions(raw(), viewUnit()));
  const available = createMemo(() => metricsFor(raw()));
  const activeMetric = () => (available().includes(metric()) ? metric() : available()[0]);
  const weighted = () => METRICS[activeMetric()].weighted;

  const inRange = createMemo(() => {
    const span = RANGES.find(([key]) => key === range())[2];
    const cutoff = Date.now() - span;
    return sessions().filter((s) => Date.parse(s.performed_at) >= cutoff);
  });
  const points = createMemo(() => chartPoints(inRange(), activeMetric()));
  createEffect(on([activeMetric, range], () => setSelected(null), { defer: true }));
  const selIndex = () => {
    const n = points().length;
    const i = selected();
    return i == null || i >= n ? n - 1 : i;
  };
  const point = () => points()[selIndex()];
  const rec = createMemo(() => records(sessions()));

  /** Second line of the readout: what the selected number is made of. */
  const detail = () => {
    const p = point();
    if (!p) return '';
    const sets = p.session.sets;
    const day = formatDay(p.session.performed_at);
    switch (activeMetric()) {
      case 'top': {
        const reps = Math.max(...sets.filter((s) => s.weight === p.y).map((s) => s.reps));
        return `× ${plural(reps, 'rep')} · ${day}`;
      }
      case 'e1rm': {
        const from = sets.find((s) => estimate1RM(s.weight, s.reps) === p.y);
        return from ? `from ${w1(from.weight)} × ${from.reps} · ${day}` : day;
      }
      case 'volume':
      case 'totalReps':
        return `${plural(sets.length, 'set')} · ${day}`;
      default:
        return day;
    }
  };

  const readoutValue = () => {
    const p = point();
    if (!p) return '–';
    return activeMetric() === 'volume' ? formatNumber(p.y) : weighted() ? w1(p.y) : String(p.y);
  };
  const readoutUnit = () => (weighted() ? viewUnit() : 'reps');

  const stats = () => {
    const r = rec();
    const count = { label: 'Sessions', value: sessions().length || null };
    if (available()[0] === 'reps') {
      return [count, { label: 'Best set', value: r.bestReps?.reps ?? null, unit: 'reps' }];
    }
    return [
      count,
      {
        label: 'Heaviest',
        value: r.topSet ? w1(r.topSet.weight) : null,
        unit: r.topSet ? `${viewUnit()} × ${r.topSet.reps}` : null,
      },
      { label: 'Best est. 1RM', value: r.best1RM ? w1(r.best1RM.value) : null, unit: viewUnit() },
    ];
  };

  return (
    <>
      <PageHeader
        back="/exercises"
        eyebrow={
          [catalogEntry(displayName())?.zh, muscleLabel(muscleOf(exercise()))].filter(Boolean).join(' · ') || 'Exercise'
        }
        title={displayName()}
        actions={
          <Show when={exercise()}>
            <button type="button" class="btn btn-plain h-11 px-2" onClick={() => setEditing(true)}>
              Edit
            </button>
          </Show>
        }
      />

      <Show
        when={sessions().length}
        fallback={
          <Show when={!loading()} fallback={<Spinner class="mx-auto mt-10 block text-label-2" />}>
            <div class="card mt-3">
              <Show
                when={exercise()}
                fallback={<EmptyState icon={SearchX} title="Not found" body="It may have been merged or deleted." />}
              >
                <EmptyState
                  icon={ChartLine}
                  title="Nothing logged yet"
                  body="Log this exercise and its progress shows up here."
                />
              </Show>
            </div>
          </Show>
        }
      >
        <div class="mt-3">
          <StatRow stats={stats()} />
        </div>

        <section class="card mt-6 px-4 pt-3 pb-1" aria-label={`${METRICS[activeMetric()].label} chart`}>
          <Show when={available().length > 1}>
            <Segmented
              label="Chart"
              value={activeMetric()}
              options={available().map((m) => [m, METRICS[m].label])}
              onChange={setMetric}
            />
          </Show>
          <Show
            when={points().length}
            fallback={<p class="t-sub py-16 text-center text-label-2">Nothing logged in this period.</p>}
          >
            <div class="mt-3" aria-live="polite">
              <p class="t-foot font-medium text-label-2 uppercase">{METRICS[activeMetric()].label}</p>
              <p class="num text-[34px] leading-10 font-semibold">
                {readoutValue()}
                <span class="ml-1 text-[17px] font-medium text-label-2">{readoutUnit()}</span>
              </p>
              <p class="t-foot text-label-2">{detail()}</p>
            </div>
            <LineChart
              points={points()}
              selected={selIndex()}
              onSelect={setSelected}
              label={`${METRICS[activeMetric()].label} of ${displayName()} per session, ${plural(points().length, 'session')}. Use the arrow keys to read each one.`}
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
            <Show when={weighted()}>
              <ChipToggle label="Unit" value={viewUnit()} options={UNITS.map((u) => [u, u])} onChange={setViewUnit} />
            </Show>
          </div>
        </section>
        <Show when={points().length === 1}>
          <p class="group-footer">Log it again to see a trend.</p>
        </Show>
      </Show>

      <Show when={exercise()}>
        <Settings exercise={exercise()} onEdit={() => setEditing(true)} />
      </Show>

      <Show when={sessions().length}>
        <Section title="History">
          <For each={[...sessions()].reverse()}>
            {(s) => (
              <A href={`/workouts/${s.workout_id}`} class="row row-tap">
                <span class="min-w-0 flex-1">
                  <span class="t-foot block text-label-2">{formatDay(s.performed_at)}</span>
                  <span class="num block truncate font-medium">
                    {s.sets.map((set) => `${formatLoad(set.original.weight)}×${set.reps}`).join(', ')}
                    <Show when={s.sets.some((set) => set.original.weight > 0)}>
                      <span class="ml-1 text-[14px] font-normal text-label-2">{s.sets[0].original.unit}</span>
                    </Show>
                    <Show when={s.warmups}>
                      <span class="ml-1 text-[14px] font-normal text-label-2">+ {plural(s.warmups, 'warm-up')}</span>
                    </Show>
                  </span>
                </span>
                <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
              </A>
            )}
          </For>
        </Section>
      </Show>

      <Show when={exercise()}>
        <EditSheet
          open={editing()}
          exercise={exercise()}
          onClose={() => setEditing(false)}
          onGone={(to) => navigate(to ? `/exercises/${to}` : '/exercises', { replace: true })}
        />
      </Show>
    </>
  );
}

/** The exercise's settings at a glance (tap to edit). */
function Settings(props) {
  const e = () => props.exercise;
  const reps = () => {
    const range = [e().rep_min, e().rep_max].filter(Boolean);
    if (!range.length) return 'Not set';
    return range.length === 2 ? `${range.join('–')} reps` : plural(range[0], 'rep');
  };
  const step = () =>
    e().increment
      ? `${formatWeight(e().increment)} ${e().last_unit ?? defaultUnit()}`
      : `Default (${formatWeight(weightStep(e().last_unit ?? defaultUnit()))})`;
  const rest = () =>
    e().rest_seconds == null
      ? `Default (${restLabel(restSeconds())})`
      : e().rest_seconds
        ? formatClock(e().rest_seconds)
        : 'Off';
  const row = (label, value) => (
    <button type="button" class="row row-tap" onClick={() => props.onEdit()}>
      <span class="flex-1">{label}</span>
      <span class="row-value num">{value}</span>
      <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
    </button>
  );
  return (
    <Section
      title="Settings"
      footer="You're offered the next weight up once every set reaches the top of the rep range."
    >
      {row('Target reps', reps())}
      {row('Weight step', step())}
      {row('Rest timer', rest())}
      <Show when={e().notes}>
        <button type="button" class="row row-tap items-start" onClick={() => props.onEdit()}>
          <span class="t-sub flex-1 whitespace-pre-wrap text-label-2">{e().notes}</span>
        </button>
      </Show>
    </Section>
  );
}

const REST_CHOICES = [null, 0, 60, 90, 120, 180, 240];
const restLabel = (s) => (s == null ? 'Default' : s === 0 ? 'Off' : formatClock(s));
const toInt = (v) => (String(v).trim() === '' ? null : Number.parseInt(v, 10));
const toNumber = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));

/** Edit name and settings. A name another exercise already has merges the two. */
function EditSheet(props) {
  const [form, setForm] = createSignal({});
  const [busy, setBusy] = createSignal(false);
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  // Fill the form only when the sheet opens: later refreshes of the exercise
  // (which saving itself triggers) must not overwrite what is being typed.
  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return;
        const e = untrack(() => props.exercise);
        setForm({
          name: e.name,
          muscle_group: muscleOf(e),
          notes: e.notes ?? '',
          rep_min: e.rep_min ?? '',
          rep_max: e.rep_max ?? '',
          increment: e.increment ?? '',
          rest_seconds: e.rest_seconds,
        });
      },
    ),
  );
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const field = (key) => form()[key] ?? '';
  const unit = () => props.exercise.last_unit ?? defaultUnit();
  /** Another exercise with the typed name: saving merges into it. */
  const mergeTarget = () => {
    const other = exerciseByName(field('name'));
    return other && other.id !== props.exercise.id ? other : null;
  };

  function problem() {
    const { rep_min, rep_max, increment } = form();
    const lo = toInt(rep_min);
    const hi = toInt(rep_max);
    if (!field('name').trim()) return 'Give it a name';
    if ([lo, hi].some((n) => n != null && !(n >= 1 && n <= 100))) return 'Reps must be 1–100';
    if (lo != null && hi != null && lo > hi) return 'Minimum reps is above maximum';
    const step = toNumber(increment);
    if (step != null && !(step > 0 && step <= 50)) return 'Weight step must be above 0';
    return null;
  }

  async function merge() {
    // Read both once: the merge removes this exercise from the list mid-way.
    const from = props.exercise;
    const target = mergeTarget();
    setBusy(true);
    try {
      const res = await mergeExercise(from.id, target.id);
      renameInDraft(from.name, target.name);
      toast(`Merged into ${target.name} (${plural(res.workouts, 'workout')})`, 'success');
      props.onClose();
      props.onGone(target.id);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (mergeTarget()) return merge();
    const error = problem();
    if (error) return toast(error, 'error');
    const f = form();
    const before = props.exercise.name;
    saveExercise(props.exercise.id, {
      name: f.name,
      muscle_group: f.muscle_group ?? null,
      notes: f.notes.trim() || null,
      rep_min: toInt(f.rep_min),
      rep_max: toInt(f.rep_max),
      increment: toNumber(f.increment),
      rest_seconds: f.rest_seconds ?? null,
    });
    if (f.name.trim() !== before) renameInDraft(before, f.name.trim());
    toast('Saved', 'success');
    props.onClose();
  }

  async function remove() {
    try {
      await deleteExercise(props.exercise.id);
      toast('Exercise deleted', 'success');
      props.onClose();
      props.onGone(null);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const chip = (selected) =>
    `h-8 rounded-full px-3.5 text-[14px] font-medium transition-colors ${selected ? 'bg-accent text-on-accent' : 'bg-fill text-label'}`;

  return (
    <Sheet open={props.open} onClose={() => props.onClose()} title="Edit Exercise">
      <form onSubmit={submit}>
        <div class="group overflow-visible">
          <div class="row rounded-xl">
            <ExerciseNameInput
              class="field-inline w-full"
              value={field('name')}
              onInput={(v) => set('name', v)}
              suggestions={exerciseOptions()}
              label="Name"
              placeholder="Name"
            />
          </div>
        </div>
        <Show when={mergeTarget()}>
          <p class="group-footer">
            “{mergeTarget().name}” already exists: saving merges this exercise’s history into it.
          </p>
        </Show>

        <Show when={!mergeTarget()}>
          <p class="group-header">Muscle group</p>
          <div class="flex flex-wrap gap-1.5 px-1" role="radiogroup" aria-label="Muscle group">
            <For each={MUSCLE_GROUPS}>
              {([key, label]) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={form().muscle_group === key}
                  class={chip(form().muscle_group === key)}
                  onClick={() => set('muscle_group', form().muscle_group === key ? null : key)}
                >
                  {label}
                </button>
              )}
            </For>
          </div>

          <p class="group-header">Progression</p>
          <div class="group">
            <div class="row">
              <span class="flex-1">Target reps</span>
              <input
                class="field-inline num w-12 flex-none text-right"
                inputmode="numeric"
                placeholder="8"
                aria-label="Minimum reps"
                value={field('rep_min')}
                onInput={(e) => set('rep_min', e.currentTarget.value.replace(/\D/g, ''))}
              />
              <span class="text-label-3">–</span>
              <input
                class="field-inline num w-12 flex-none"
                inputmode="numeric"
                placeholder="12"
                aria-label="Maximum reps"
                value={field('rep_max')}
                onInput={(e) => set('rep_max', e.currentTarget.value.replace(/\D/g, ''))}
              />
            </div>
            <label class="row">
              <span class="flex-1">Weight step</span>
              <input
                class="field-inline num w-20 flex-none text-right"
                inputmode="decimal"
                placeholder={formatWeight(weightStep(unit()))}
                aria-label="Weight step"
                value={field('increment')}
                onInput={(e) => set('increment', e.currentTarget.value)}
              />
              <span class="text-label-2">{unit()}</span>
            </label>
          </div>
          <p class="group-footer">Reach the top of the range on every set and you're offered the next weight up.</p>

          <p class="group-header">Rest timer</p>
          <div class="flex flex-wrap gap-1.5 px-1" role="radiogroup" aria-label="Rest timer">
            <For each={REST_CHOICES}>
              {(value) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={form().rest_seconds === value}
                  class={chip(form().rest_seconds === value)}
                  onClick={() => set('rest_seconds', value)}
                >
                  {value == null ? `Default (${restLabel(restSeconds())})` : restLabel(value)}
                </button>
              )}
            </For>
          </div>

          <p class="group-header">Notes</p>
          <div class="group">
            <textarea
              class="field-inline block min-h-20 w-full px-4 py-3"
              rows="2"
              placeholder="Seat height, grip, cues… (shown while logging)"
              value={field('notes')}
              onInput={(e) => set('notes', e.currentTarget.value)}
            />
          </div>
        </Show>

        <Show when={mergeTarget() && !online()}>
          <p class="group-footer text-warn">Merging needs a connection.</p>
        </Show>
        <button
          type="submit"
          class="btn btn-lg btn-primary btn-block mt-6"
          aria-busy={busy()}
          disabled={mergeTarget() && !online()}
        >
          {mergeTarget() ? `Merge into ${mergeTarget().name}` : 'Save'}
        </button>
        <Show when={!mergeTarget() && props.exercise.times_performed === 0}>
          <button
            type="button"
            class="btn btn-lg btn-block mt-2 bg-card text-bad"
            disabled={!online()}
            onClick={() => setConfirmDelete(true)}
          >
            Delete Exercise
          </button>
        </Show>
      </form>
      <ConfirmSheet
        open={confirmDelete()}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete Exercise?"
        confirmLabel="Delete Exercise"
        danger
      >
        It hasn't been logged yet. An exercise that a plan uses can't be deleted; remove it from the plan first.
      </ConfirmSheet>
    </Sheet>
  );
}
