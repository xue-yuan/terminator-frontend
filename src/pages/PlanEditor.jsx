import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { useNavigate, useParams } from '@solidjs/router';
import { ArrowDown, ArrowUp, ChevronRight, CloudOff, Ellipsis, Link2, Plus, Trash2 } from 'lucide-solid';
import { api } from '../lib/api';
import { exerciseOptions, plans, savePlan } from '../lib/data';
import { supersetLabels } from '../lib/format';
import { useBack } from '../lib/nav';
import { online } from '../lib/network';
import { PLAN_TEMPLATES } from '../lib/templates';
import { toast } from '../lib/toast';
import { uuid } from '../lib/uuid';
import { SwipeRow } from '../components/SwipeRow';
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
  const back = useBack();
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
  const leave = () => (JSON.stringify(form) === pristine ? back(backTo()) : setConfirmLeave(true));

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

  const numberInput = (d, e, field, label, placeholder) => (
    <input
      class="num h-8 w-11 rounded-lg bg-fill text-center text-[16px] font-semibold outline-none focus:ring-2 focus:ring-accent"
      inputmode="numeric"
      aria-label={label}
      placeholder={placeholder}
      value={form.days[d].exercises[e][field]}
      onInput={(ev) => setForm('days', d, 'exercises', e, field, ev.currentTarget.value.replace(/\D/g, ''))}
      onFocus={(ev) => ev.currentTarget.select()}
    />
  );

  const removeExercise = (d, e) => setForm('days', d, 'exercises', (l) => l.filter((_, k) => k !== e));
  const moveDay = (d, delta) =>
    setForm(
      'days',
      produce((l) => move(l, d, delta)),
    );

  // A form sheet's bar: Cancel, the title, Save.
  const header = (
    <div
      class="bar sticky top-0 z-30 -mx-4 mb-2 border-b-[0.5px] border-separator px-4"
      style={{ 'padding-top': 'calc(env(safe-area-inset-top) + 0.25rem)' }}
    >
      <div class="flex h-11 items-center gap-2">
        <div class="w-20 shrink-0">
          <button type="button" class="-ml-1 h-11 px-1 text-[17px] text-accent active:opacity-50" onClick={leave}>
            Cancel
          </button>
        </div>
        <p class="t-headline min-w-0 flex-1 truncate text-center">{editingId() ? 'Edit Plan' : 'New Plan'}</p>
        <div class="flex w-20 shrink-0 justify-end">
          <Show when={!picking()}>
            <button
              type="button"
              class="btn btn-sm btn-primary"
              onClick={save}
              aria-busy={saving()}
              disabled={!online()}
            >
              Save
            </button>
          </Show>
        </div>
      </div>
    </div>
  );

  return (
    <Show when={loaded()} fallback={<Spinner class="mx-auto mt-24 block text-label-2" />}>
      {header}

      <Show when={!online()}>
        <p class="t-sub mt-2 flex items-center gap-2 rounded-xl bg-card px-4 py-3 text-label-2">
          <CloudOff size={18} class="shrink-0 text-warn" /> Plans can only be saved while online.
        </p>
      </Show>

      <Show
        when={!picking()}
        fallback={
          <>
            <p class="group-header">Start from a template</p>
            <div class="group">
              <For each={PLAN_TEMPLATES}>
                {(t) => (
                  <button
                    type="button"
                    class="row row-tap"
                    onClick={() => {
                      setForm(toForm(t));
                      setPicking(false);
                    }}
                  >
                    <div class="min-w-0 flex-1">
                      <p class="t-headline">{t.name}</p>
                      <p class="t-foot text-label-2">{t.description}</p>
                    </div>
                    <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
                  </button>
                )}
              </For>
            </div>
            <button
              type="button"
              class="btn btn-lg btn-block mt-6 bg-card"
              onClick={() => {
                setForm('days', [{ key: uuid(), name: 'Day 1', exercises: [newExercise()] }]);
                setPicking(false);
              }}
            >
              <Plus size={20} strokeWidth={2.5} /> Start from Scratch
            </button>
          </>
        }
      >
        <div class="group mt-4">
          <input
            class="field-inline row t-headline"
            placeholder="Plan name"
            aria-label="Plan name"
            value={form.name}
            onInput={(e) => setForm('name', e.currentTarget.value)}
          />
          <textarea
            class="field-inline block min-h-16 w-full px-4 py-3"
            rows="2"
            placeholder="Description (optional)"
            aria-label="Description"
            value={form.description}
            onInput={(e) => setForm('description', e.currentTarget.value)}
          />
        </div>

        <For each={form.days}>
          {(day, d) => (
            <section>
              <div class="group-header flex items-end gap-1">
                <span class="min-w-0 flex-1">Day {d() + 1}</span>
                <button
                  type="button"
                  class="btn btn-round -mb-1 text-accent disabled:opacity-30"
                  aria-label="Move day up"
                  disabled={d() === 0}
                  onClick={() => moveDay(d(), -1)}
                >
                  <ArrowUp size={16} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  class="btn btn-round -mb-1 text-accent disabled:opacity-30"
                  aria-label="Move day down"
                  disabled={d() === form.days.length - 1}
                  onClick={() => moveDay(d(), 1)}
                >
                  <ArrowDown size={16} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  class="btn btn-round -mb-1 text-bad"
                  aria-label="Remove day"
                  onClick={() => setForm('days', (l) => l.filter((_, k) => k !== d()))}
                >
                  <Trash2 size={15} strokeWidth={2.25} />
                </button>
              </div>
              <div class="group overflow-visible">
                <input
                  class="field-inline row t-headline rounded-t-xl"
                  placeholder={`Day ${d() + 1} name`}
                  aria-label={`Day ${d() + 1} name`}
                  value={day.name}
                  onInput={(e) => setForm('days', d(), 'name', e.currentTarget.value)}
                />
                <For each={day.exercises}>
                  {(ex, e) => {
                    const label = () => supersetLabels(supersetNumbers(day.exercises))[e()];
                    const isLast = () => e() === day.exercises.length - 1;
                    return (
                      <SwipeRow
                        style={{ '--sep-inset': '3rem' }}
                        actions={[
                          { label: 'Delete', icon: Trash2, tone: 'bad', onAction: () => removeExercise(d(), e()) },
                        ]}
                      >
                        <div class="flex items-start gap-1 py-2 pr-2 pl-4">
                          <span
                            class="num mt-2.5 w-7 shrink-0 text-[15px] font-semibold"
                            classList={{ 'text-accent': !!label(), 'text-label-3': !label() }}
                          >
                            {label() ?? e() + 1}
                          </span>
                          <div class="min-w-0 flex-1">
                            <ExerciseNameInput
                              class="field-inline h-10 w-full"
                              placeholder="Exercise"
                              value={ex.exercise_name}
                              suggestions={suggestions()}
                              onInput={(v) => setForm('days', d(), 'exercises', e(), 'exercise_name', v)}
                            />
                            <div class="t-foot flex items-center gap-1.5 pb-1 text-label-2">
                              {numberInput(d(), e(), 'target_sets', 'Target sets', '3')}
                              <span>sets ×</span>
                              {numberInput(d(), e(), 'target_reps_min', 'Minimum reps', '8')}
                              <span>–</span>
                              {numberInput(d(), e(), 'target_reps_max', 'Maximum reps', '12')}
                              <span>reps</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            class="btn btn-icon h-10 w-10"
                            classList={{
                              'text-accent': ex.linkNext && !isLast(),
                              'text-label-3': !ex.linkNext || isLast(),
                            }}
                            aria-label="Superset with next exercise"
                            aria-pressed={ex.linkNext && !isLast()}
                            disabled={isLast()}
                            onClick={() => setForm('days', d(), 'exercises', e(), 'linkNext', (v) => !v)}
                          >
                            <Link2 size={18} />
                          </button>
                          <button
                            type="button"
                            class="btn btn-icon h-10 w-10 text-label-2"
                            aria-label={`More for ${ex.exercise_name || 'this exercise'}`}
                            onClick={() => setMenu({ d: d(), e: e() })}
                          >
                            <Ellipsis size={20} />
                          </button>
                        </div>
                      </SwipeRow>
                    );
                  }}
                </For>
                <button
                  type="button"
                  class="row row-tap rounded-b-xl text-accent"
                  onClick={() => setForm('days', d(), 'exercises', (l) => [...l, newExercise()])}
                >
                  <Plus size={20} strokeWidth={2.5} class="w-6" /> Add Exercise
                </button>
              </div>
            </section>
          )}
        </For>

        <button
          type="button"
          class="btn btn-lg btn-block mt-8 bg-card"
          onClick={() => setForm('days', (l) => [...l, { key: uuid(), name: '', exercises: [newExercise()] }])}
        >
          <Plus size={20} strokeWidth={2.5} /> Add Day
        </button>
        <p class="group-footer text-center">
          Swipe an exercise left to remove it. The link button supersets it with the next one.
        </p>
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
            const item = 'row row-tap disabled:opacity-35';
            return (
              <>
                <div class="group" style={{ '--sep-inset': '3.25rem' }}>
                  <button
                    type="button"
                    class={item}
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
                    <ArrowUp size={20} class="w-6 text-accent" /> Move Earlier
                  </button>
                  <button
                    type="button"
                    class={item}
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
                    <ArrowDown size={20} class="w-6 text-accent" /> Move Later
                  </button>
                </div>
                <div class="group mt-6">
                  <button
                    type="button"
                    class={`${item} text-bad`}
                    onClick={() => act(() => removeExercise(m().d, m().e))}
                  >
                    <Trash2 size={20} class="w-6" /> Remove Exercise
                  </button>
                </div>
              </>
            );
          }}
        </Show>
      </Sheet>

      <ConfirmSheet
        open={confirmLeave()}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => back(backTo())}
        title="Discard Changes?"
        confirmLabel="Discard Changes"
        danger
      />
    </Show>
  );
}
