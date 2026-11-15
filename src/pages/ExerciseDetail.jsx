import { createEffect, createMemo, createSignal, For, on, Show, untrack } from 'solid-js';
import { A, useNavigate, useParams } from '@solidjs/router';
import { CloudUpload, Pencil, Trash2 } from 'lucide-solid';
import { OfflineError } from '../lib/api';
import {
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
import { catalogEntry, MUSCLE_GROUPS, muscleLabel } from '../lib/exercises';
import { formatClock, formatDay, formatNumber, formatWeight, plural } from '../lib/format';
import { online } from '../lib/network';
import { restSeconds, unit as defaultUnit, weightStep } from '../lib/prefs';
import { chartPoints, estimate1RM, METRICS, metricsFor, normalizeSessions, records } from '../lib/progress';
import { renameInDraft } from '../lib/session';
import { toast } from '../lib/toast';
import { UNITS } from '../lib/units';
import ExerciseNameInput from '../components/ExerciseNameInput';
import LineChart from '../components/LineChart';
import { ChipToggle, ConfirmSheet, EmptyState, PageHeader, Segmented, Sheet, Spinner, StatRow } from '../components/ui';

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
        return `× ${reps} reps · ${day}`;
      }
      case 'e1rm': {
        const from = sets.find((s) => estimate1RM(s.weight, s.reps) === p.y);
        return from ? `from ${w1(from.weight)} × ${from.reps} · ${day}` : day;
      }
      case 'volume':
      case 'totalReps':
        return `${sets.length} sets · ${day}`;
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
            <button class="btn btn-icon -mr-3" aria-label="Edit exercise" onClick={() => setEditing(true)}>
              <Pencil size={20} />
            </button>
          </Show>
        }
      />

      <Show when={exercise()}>
        <Settings exercise={exercise()} onEdit={() => setEditing(true)} />
      </Show>

      <Show
        when={sessions().length}
        fallback={
          <Show when={!loading()} fallback={<Spinner class="mx-auto block" />}>
            <Show
              when={exercise()}
              fallback={<EmptyState title="Not found" body="It may have been merged or deleted." />}
            >
              <EmptyState title="Nothing logged yet" body="Log this exercise and its progress shows up here." />
            </Show>
          </Show>
        }
      >
        <StatRow stats={stats()} />

        <div class="mt-6 grid gap-2">
          <Show when={available().length > 1}>
            <Segmented
              label="Chart"
              value={activeMetric()}
              options={available().map((m) => [m, METRICS[m].label])}
              onChange={setMetric}
            />
          </Show>
          <div class="flex items-center justify-between gap-2">
            <ChipToggle
              label="Time range"
              value={range()}
              options={RANGES.map(([k, l]) => [k, l])}
              onChange={setRange}
            />
            <Show when={weighted()}>
              <ChipToggle label="Unit" value={viewUnit()} options={UNITS.map((u) => [u, u])} onChange={setViewUnit} />
            </Show>
          </div>
        </div>

        <section
          class="mt-3 border-2 border-ink bg-raised px-3 pt-3 pb-1"
          aria-label={`${METRICS[activeMetric()].label} chart`}
        >
          <Show
            when={points().length}
            fallback={<p class="py-16 text-center text-muted">Nothing logged in this period.</p>}
          >
            <div class="px-1" aria-live="polite">
              <p class="eyebrow">{METRICS[activeMetric()].label}</p>
              <p class="display text-[2.5rem] leading-none">
                {readoutValue()}
                <span class="ml-1 text-lg text-muted">{readoutUnit()}</span>
              </p>
              <p class="mt-1 text-sm text-muted">{detail()}</p>
            </div>
            <LineChart
              points={points()}
              selected={selIndex()}
              onSelect={setSelected}
              label={`${METRICS[activeMetric()].label} of ${displayName()} per session, ${points().length} sessions. Use the arrow keys to read each one.`}
            />
          </Show>
        </section>
        <Show when={points().length === 1}>
          <p class="mt-2 text-sm text-muted">Log it again to see a trend.</p>
        </Show>

        <h2 class="display mt-8 border-b-2 border-ink pb-1.5 text-xl">History</h2>
        <ol>
          <For each={[...sessions()].reverse()}>
            {(s) => (
              <li>
                <A
                  href={`/workouts/${s.workout_id}`}
                  class="rule flex items-baseline gap-3 border-b py-3 active:bg-sunk"
                >
                  <span class="w-28 shrink-0 text-sm text-muted">{formatDay(s.performed_at)}</span>
                  <span class="min-w-0 flex-1 font-medium">
                    {s.sets.map((set) => `${formatWeight(set.original.weight)}×${set.reps}`).join(', ')}
                    <Show when={s.sets.some((set) => set.original.weight > 0)}>
                      <span class="ml-1 text-sm text-muted">{s.sets[0].original.unit}</span>
                    </Show>
                    <Show when={s.warmups}>
                      <span class="ml-1 text-sm text-muted">+ {s.warmups} warm-up</span>
                    </Show>
                  </span>
                  <Show when={s.pending}>
                    <CloudUpload size={14} class="shrink-0 text-warn" aria-label="Waiting to sync" />
                  </Show>
                </A>
              </li>
            )}
          </For>
        </ol>
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

/** The exercise's settings at a glance; empty ones are left out. */
function Settings(props) {
  const e = () => props.exercise;
  const tags = () =>
    [
      e().rep_min || e().rep_max ? `${[e().rep_min, e().rep_max].filter(Boolean).join('–')} reps` : null,
      e().increment ? `+${formatWeight(e().increment)} ${e().last_unit ?? defaultUnit()} steps` : null,
      e().rest_seconds != null ? (e().rest_seconds ? `Rest ${formatClock(e().rest_seconds)}` : 'No rest timer') : null,
    ].filter(Boolean);
  return (
    <Show when={tags().length || e().notes}>
      <button class="-mt-2 mb-5 block w-full text-left" onClick={() => props.onEdit()} aria-label="Edit settings">
        <Show when={tags().length}>
          <span class="flex flex-wrap gap-1.5">
            <For each={tags()}>{(t) => <span class="tag text-muted">{t}</span>}</For>
          </span>
        </Show>
        <Show when={e().notes}>
          <span class="mt-2 block border-l-4 border-signal pl-2 text-sm whitespace-pre-wrap">{e().notes}</span>
        </Show>
      </button>
    </Show>
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
    `h-10 border-2 px-3 font-display text-[0.95rem] font-bold tracking-wide uppercase ${selected ? 'border-ink bg-ink text-paper' : 'rule text-muted'}`;

  return (
    <Sheet open={props.open} onClose={() => props.onClose()} title="Edit exercise">
      <form onSubmit={submit} class="grid gap-4">
        <label class="grid gap-1">
          <span class="eyebrow">Name</span>
          <ExerciseNameInput
            value={field('name')}
            onInput={(v) => set('name', v)}
            suggestions={exerciseOptions()}
            label="Name"
          />
          <Show when={mergeTarget()}>
            <span class="text-sm text-muted">
              “{mergeTarget().name}” already exists: saving merges this exercise’s history into it.
            </span>
          </Show>
        </label>

        <Show when={!mergeTarget()}>
          <div class="grid gap-1">
            <span class="eyebrow">Muscle group</span>
            <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Muscle group">
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
          </div>

          <label class="grid gap-1">
            <span class="eyebrow">Notes</span>
            <textarea
              class="field"
              rows="2"
              placeholder="Seat height, grip, cues… (shown while logging)"
              value={field('notes')}
              onInput={(e) => set('notes', e.currentTarget.value)}
            />
          </label>

          <div class="grid grid-cols-2 gap-3">
            <div class="grid gap-1">
              <span class="eyebrow">Target reps</span>
              <div class="flex items-center gap-2">
                <input
                  class="field w-full text-center"
                  inputmode="numeric"
                  placeholder="8"
                  aria-label="Minimum reps"
                  value={field('rep_min')}
                  onInput={(e) => set('rep_min', e.currentTarget.value.replace(/\D/g, ''))}
                />
                <span class="text-muted">–</span>
                <input
                  class="field w-full text-center"
                  inputmode="numeric"
                  placeholder="12"
                  aria-label="Maximum reps"
                  value={field('rep_max')}
                  onInput={(e) => set('rep_max', e.currentTarget.value.replace(/\D/g, ''))}
                />
              </div>
            </div>
            <label class="grid gap-1">
              <span class="eyebrow">Weight step · {unit()}</span>
              <input
                class="field text-center"
                inputmode="decimal"
                placeholder={formatWeight(weightStep(unit()))}
                aria-label="Weight step"
                value={field('increment')}
                onInput={(e) => set('increment', e.currentTarget.value)}
              />
            </label>
          </div>
          <p class="-mt-2 text-sm text-muted">
            When you reach the top of the rep range on every set, you’ll be offered the next weight up.
          </p>

          <div class="grid gap-1">
            <span class="eyebrow">Rest timer · default {restLabel(restSeconds())}</span>
            <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Rest timer">
              <For each={REST_CHOICES}>
                {(value) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form().rest_seconds === value}
                    class={chip(form().rest_seconds === value)}
                    onClick={() => set('rest_seconds', value)}
                  >
                    {restLabel(value)}
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show when={mergeTarget() && !online()}>
          <p class="text-sm text-warn">Merging needs a connection.</p>
        </Show>
        <button
          type="submit"
          class="btn btn-lg btn-signal btn-block"
          aria-busy={busy()}
          disabled={mergeTarget() && !online()}
        >
          {mergeTarget() ? `Merge into ${mergeTarget().name}` : 'Save'}
        </button>
        <Show when={!mergeTarget() && props.exercise.times_performed === 0}>
          <button
            type="button"
            class="btn btn-danger btn-block"
            disabled={!online()}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={18} /> Delete exercise
          </button>
        </Show>
      </form>
      <ConfirmSheet
        open={confirmDelete()}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete exercise?"
        confirmLabel="Delete"
        danger
      >
        It hasn't been logged yet. An exercise that a plan uses can't be deleted; remove it from the plan first.
      </ConfirmSheet>
    </Sheet>
  );
}
