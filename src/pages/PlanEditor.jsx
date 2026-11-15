import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { useNavigate, useParams } from '@solidjs/router';
import { ArrowDown, ArrowRight, ArrowUp, CloudOff, Ellipsis, Link2, Plus, Trash2, X } from 'lucide-solid';
import { api } from '../lib/api';
import { exerciseOptions, plans, savePlan } from '../lib/data';
import { supersetLabels } from '../lib/format';
import { online } from '../lib/network';
import { PLAN_TEMPLATES } from '../lib/templates';
import { toast } from '../lib/toast';
import { uuid } from '../lib/uuid';
import { ConfirmSheet, Sheet, Spinner } from '../components/ui';
import ExerciseNameInput from '../components/ExerciseNameInput';

const str = (v) => (v == null ? '' : String(v));
const num = (v) => (v === '' ? null : Number(v));

const toForm = (plan) => ({
  name: plan?.name ?? '',
  description: plan?.description ?? '',
  days: (plan?.days ?? []).map((d) => ({
    key: uuid(),
    name: d.name,
    exercises: d.exercises.map((e, k, list) => ({
      key: uuid(),
      exercise_name: e.exercise_name,
      target_sets: str(e.target_sets),
      target_reps_min: str(e.target_reps_min),
      target_reps_max: str(e.target_reps_max),
      // "superset with the next exercise"; chains of these form a superset
      linkNext: e.superset != null && list[k + 1]?.superset === e.superset,
    })),
  })),
});

const newExercise = () => ({
  key: uuid(),
  exercise_name: '',
  target_sets: '3',
  target_reps_min: '8',
  target_reps_max: '12',
  linkNext: false,
});

/** Superset number per exercise (null if on its own) from the linkNext chains. */
function supersetNumbers(exercises) {
  const out = exercises.map(() => null);
  let n = 0;
  for (let i = 0; i < exercises.length;) {
    let j = i;
    while (j < exercises.length - 1 && exercises[j].linkNext) j++;
    if (j > i) {
      n += 1;
      for (let k = i; k <= j; k++) out[k] = n;
    }
    i = j + 1;
  }
  return out;
}

function move(list, i, delta) {
  const j = i + delta;
  if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
}

export default function PlanEditor() {
  const params = useParams();
  const navigate = useNavigate();
  const editingId = () => (params.id ? Number(params.id) : null);
  const [form, setForm] = createStore(toForm(null));
  const [loaded, setLoaded] = createSignal(!params.id);
  const [picking, setPicking] = createSignal(!params.id);
  const [saving, setSaving] = createSignal(false);
  const [confirmLeave, setConfirmLeave] = createSignal(false);
  const [menu, setMenu] = createSignal(null); // { d, e }: the exercise whose menu is open
  let pristine = '';

  onMount(async () => {
    if (editingId()) {
      const plan =
        plans.data()?.find((p) => p.id === editingId()) ?? (await api(`/plans/${editingId()}`).catch(() => null));
      if (!plan) {
        toast('Plan not found', 'error');
        return navigate('/plans', { replace: true });
      }
      setForm(toForm(plan));
      setLoaded(true);
    }
    pristine = JSON.stringify(form);
  });

  const suggestions = createMemo(() => {
    const fromPlans = (plans.data() ?? []).flatMap((p) =>
      p.days.flatMap((d) => d.exercises.map((e) => e.exercise_name)),
    );
    return [...exerciseOptions(), ...fromPlans];
  });

  const backTo = () => (editingId() ? `/plans/${editingId()}` : '/plans');
  const leave = () => (JSON.stringify(form) === pristine ? navigate(backTo()) : setConfirmLeave(true));

  function validate() {
    if (!form.name.trim()) return 'Give the plan a name';
    for (const [i, day] of form.days.entries()) {
      if (!day.name.trim()) return `Day ${i + 1} needs a name`;
      for (const ex of day.exercises) {
        if (!ex.exercise_name.trim()) return `${day.name}: every exercise needs a name`;
        const lo = num(ex.target_reps_min);
        const hi = num(ex.target_reps_max);
        if (lo != null && hi != null && lo > hi) return `${ex.exercise_name}: min reps is above max`;
      }
    }
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) return toast(problem, 'error');
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      days: form.days.map((d) => {
        const supersets = supersetNumbers(d.exercises);
        return {
          name: d.name.trim(),
          exercises: d.exercises.map((e, k) => ({
            exercise_name: e.exercise_name.trim(),
            target_sets: num(e.target_sets),
            target_reps_min: num(e.target_reps_min),
            target_reps_max: num(e.target_reps_max),
            superset: supersets[k],
          })),
        };
      }),
    };
    setSaving(true);
    try {
      const plan = await savePlan(editingId(), body);
      toast('Plan saved', 'success');
      navigate(`/plans/${plan.id}`, { replace: true });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const numberInput = (d, e, field, label) => (
    <input
      class="field h-11 px-1 text-center font-display text-xl font-bold"
      inputmode="numeric"
      aria-label={label}
      value={form.days[d].exercises[e][field]}
      onInput={(ev) => setForm('days', d, 'exercises', e, field, ev.currentTarget.value.replace(/\D/g, ''))}
      onFocus={(ev) => ev.currentTarget.select()}
    />
  );

  const header = (
    <div
      class="sticky top-0 z-30 -mx-5 mb-4 flex items-center gap-2 border-b-2 border-ink bg-paper px-5 pb-2"
      style={{ 'padding-top': 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      <button class="btn btn-icon -ml-3" aria-label="Cancel" onClick={leave}>
        <X size={24} />
      </button>
      <p class="display flex-1 truncate text-2xl">{editingId() ? 'Edit plan' : 'New plan'}</p>
      <Show when={!picking()}>
        <button class="btn btn-sm btn-signal" onClick={save} disabled={saving() || !online()}>
          <Show when={saving()} fallback="Save">
            <Spinner class="h-4 w-4" />
          </Show>
        </button>
      </Show>
    </div>
  );

  return (
    <Show when={loaded()} fallback={<Spinner class="mx-auto mt-24 block" />}>
      {header}

      <Show when={!online()}>
        <p class="mb-4 flex items-center gap-2 border-l-4 border-warn bg-sunk px-3 py-2 text-sm">
          <CloudOff size={16} class="text-warn" /> Plans can only be saved while online.
        </p>
      </Show>

      <Show
        when={!picking()}
        fallback={
          <>
            <p class="eyebrow">Start from a template</p>
            <ul class="mt-2 border-t-2 border-ink">
              <For each={PLAN_TEMPLATES}>
                {(t) => (
                  <li>
                    <button
                      class="rule flex w-full items-center gap-3 border-b py-4 text-left active:bg-sunk"
                      onClick={() => {
                        setForm(toForm(t));
                        setPicking(false);
                      }}
                    >
                      <div class="min-w-0 flex-1">
                        <p class="display text-2xl">{t.name}</p>
                        <p class="mt-0.5 text-sm text-muted">{t.description}</p>
                      </div>
                      <ArrowRight size={20} class="shrink-0 text-muted" />
                    </button>
                  </li>
                )}
              </For>
            </ul>
            <button
              class="btn btn-block mt-5"
              onClick={() => {
                setForm('days', [{ key: uuid(), name: 'Day 1', exercises: [newExercise()] }]);
                setPicking(false);
              }}
            >
              <Plus size={18} /> Start from scratch
            </button>
          </>
        }
      >
        <div class="grid gap-2">
          <input
            class="field display h-14 !text-3xl"
            placeholder="Plan name"
            aria-label="Plan name"
            value={form.name}
            onInput={(e) => setForm('name', e.currentTarget.value)}
          />
          <textarea
            class="field"
            rows="2"
            placeholder="Description (optional)"
            aria-label="Description"
            value={form.description}
            onInput={(e) => setForm('description', e.currentTarget.value)}
          />
        </div>

        <For each={form.days}>
          {(day, d) => (
            <section class="mt-7">
              <div class="flex items-center gap-1 border-b-2 border-ink pb-1.5">
                <input
                  class="display min-w-0 flex-1 bg-transparent text-[1.75rem] outline-none placeholder:text-muted"
                  placeholder={`Day ${d() + 1}`}
                  aria-label={`Day ${d() + 1} name`}
                  value={day.name}
                  onInput={(e) => setForm('days', d(), 'name', e.currentTarget.value)}
                />
                <button
                  class="btn btn-icon"
                  aria-label="Move day up"
                  disabled={d() === 0}
                  onClick={() =>
                    setForm(
                      'days',
                      produce((l) => move(l, d(), -1)),
                    )
                  }
                >
                  <ArrowUp size={18} />
                </button>
                <button
                  class="btn btn-icon"
                  aria-label="Move day down"
                  disabled={d() === form.days.length - 1}
                  onClick={() =>
                    setForm(
                      'days',
                      produce((l) => move(l, d(), 1)),
                    )
                  }
                >
                  <ArrowDown size={18} />
                </button>
                <button
                  class="btn btn-icon -mr-3 text-bad"
                  aria-label="Remove day"
                  onClick={() => setForm('days', (l) => l.filter((_, k) => k !== d()))}
                >
                  <Trash2 size={18} />
                </button>
              </div>

              <For each={day.exercises}>
                {(ex, e) => {
                  const label = () => supersetLabels(supersetNumbers(day.exercises))[e()];
                  const isLast = () => e() === day.exercises.length - 1;
                  return (
                    <div class="rule border-b py-3">
                      <div class="flex items-center gap-1">
                        <span
                          class="display w-7 shrink-0 text-lg"
                          classList={{ 'text-signal': !!label(), 'text-muted': !label() }}
                        >
                          {label() ?? e() + 1}
                        </span>
                        <ExerciseNameInput
                          class="field h-11"
                          value={ex.exercise_name}
                          suggestions={suggestions()}
                          onInput={(v) => setForm('days', d(), 'exercises', e(), 'exercise_name', v)}
                        />
                        <button
                          class="btn btn-icon"
                          classList={{ 'text-signal': ex.linkNext && !isLast(), 'text-muted': !ex.linkNext }}
                          aria-label="Superset with next exercise"
                          aria-pressed={ex.linkNext && !isLast()}
                          disabled={isLast()}
                          onClick={() => setForm('days', d(), 'exercises', e(), 'linkNext', (v) => !v)}
                        >
                          <Link2 size={16} />
                        </button>
                        <button
                          class="btn btn-icon -mr-3"
                          aria-label={`More for ${ex.exercise_name || 'this exercise'}`}
                          onClick={() => setMenu({ d: d(), e: e() })}
                        >
                          <Ellipsis size={20} />
                        </button>
                      </div>
                      <div class="mt-2 ml-7 grid grid-cols-[3.5rem_auto_3.5rem_auto_3.5rem_auto] items-center gap-2 text-sm text-muted">
                        {numberInput(d(), e(), 'target_sets', 'Target sets')}
                        <span class="eyebrow">sets</span>
                        {numberInput(d(), e(), 'target_reps_min', 'Minimum reps')}
                        <span>–</span>
                        {numberInput(d(), e(), 'target_reps_max', 'Maximum reps')}
                        <span class="eyebrow">reps</span>
                      </div>
                    </div>
                  );
                }}
              </For>
              <button
                class="btn btn-quiet btn-block mt-1 text-muted"
                onClick={() => setForm('days', d(), 'exercises', (l) => [...l, newExercise()])}
              >
                <Plus size={18} /> Add exercise
              </button>
            </section>
          )}
        </For>

        <button
          class="btn btn-block mt-6 border-dashed"
          onClick={() => setForm('days', (l) => [...l, { key: uuid(), name: '', exercises: [newExercise()] }])}
        >
          <Plus size={18} /> Add day
        </button>
        <div class="h-10" />
      </Show>

      <Sheet
        open={!!menu()}
        onClose={() => setMenu(null)}
        title={(menu() && form.days[menu().d]?.exercises[menu().e]?.exercise_name) || 'Exercise'}
      >
        <Show when={menu()}>
          {(m) => {
            const count = () => form.days[m().d]?.exercises.length ?? 0;
            const act = (fn) => {
              fn();
              setMenu(null);
            };
            const row = 'rule flex items-center gap-3 border-b py-4 text-left text-lg font-medium disabled:opacity-35';
            return (
              <div class="rule grid border-t">
                <button
                  class={row}
                  disabled={m().e === 0}
                  onClick={() =>
                    act(() =>
                      setForm(
                        'days',
                        m().d,
                        'exercises',
                        produce((l) => move(l, m().e, -1)),
                      ),
                    )
                  }
                >
                  <ArrowUp size={20} /> Move earlier
                </button>
                <button
                  class={row}
                  disabled={m().e >= count() - 1}
                  onClick={() =>
                    act(() =>
                      setForm(
                        'days',
                        m().d,
                        'exercises',
                        produce((l) => move(l, m().e, 1)),
                      ),
                    )
                  }
                >
                  <ArrowDown size={20} /> Move later
                </button>
                <button
                  class={`${row} text-bad`}
                  onClick={() => act(() => setForm('days', m().d, 'exercises', (l) => l.filter((_, k) => k !== m().e)))}
                >
                  <Trash2 size={20} /> Remove exercise
                </button>
              </div>
            );
          }}
        </Show>
      </Sheet>

      <ConfirmSheet
        open={confirmLeave()}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => navigate(backTo())}
        title="Discard changes?"
        confirmLabel="Discard"
        danger
      />
    </Show>
  );
}
