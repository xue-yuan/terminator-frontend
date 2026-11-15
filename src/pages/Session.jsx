import { createEffect, createMemo, createSignal, For, on, onMount, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Ellipsis,
  Link2,
  Minus,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Trophy,
  Undo2,
  Unlink2,
} from 'lucide-solid';
import { exerciseByName, exerciseOptions, recentExercises } from '../lib/data';
import { exerciseKey, POPULAR } from '../lib/exercises';
import {
  describeSets,
  formatClock,
  formatDuration,
  formatNumber,
  formatWeight,
  isWarmup,
  setLabel,
  timeAgo,
  toLocalInput,
} from '../lib/format';
import { enter } from '../lib/motion';
import { useNow } from '../lib/now';
import { unit as displayUnit, keepAwake } from '../lib/prefs';
import { convert, UNITS } from '../lib/units';
import {
  addExercise,
  addSet,
  addSetPreview,
  addWarmup,
  anySetLogged,
  adjustRest,
  applyHistoryHints,
  closeEditor,
  completedSetCount,
  discardDraft,
  draft,
  draftRecords,
  draftLabels as labels,
  effectiveValue,
  elapsedSeconds,
  finishWorkout,
  focusExercise,
  focusSet,
  groupMembers,
  hintValue,
  linkWithNext,
  logSet,
  moveExercise,
  parseNumber,
  removeExercise,
  removeSet,
  setExerciseUnit,
  startWorkout,
  stepField,
  stopRest,
  toggleWarmup,
  undoSet,
  unlink,
  updateDraft,
  weightStepFor,
} from '../lib/session';
import { describeRecords } from '../lib/records';
import { toast } from '../lib/toast';
import { useWakeLock } from '../lib/wakelock';
import { ChipToggle, ConfirmSheet, PrTag, Sheet } from '../components/ui';
import ExerciseNameInput from '../components/ExerciseNameInput';
import SpotifyBar from '../components/SpotifyBar';
import { spotifyStatus } from '../lib/spotify';

const buzz = () => navigator.vibrate?.(8);

export default function Session() {
  const navigate = useNavigate();
  const [sheet, setSheet] = createSignal(null); // 'details' | 'finish' | 'discard' | 'exercise'
  // No reaching for the phone to wake it between sets.
  useWakeLock(() => keepAwake() && !!draft());

  // Opened via the "Start workout" app shortcut or a stale link: start fresh.
  onMount(() => !draft() && startWorkout());

  const finish = () => {
    const wasEdit = draft().mode === 'edit';
    const { workout, error } = finishWorkout();
    if (error) return toast(error, 'error');
    toast(wasEdit ? 'Changes saved' : 'Workout saved', 'success');
    navigate(`/workouts/${workout.id}`, { replace: true });
  };

  const discard = () => {
    const wasEdit = draft().mode === 'edit';
    const id = draft().id;
    discardDraft();
    navigate(wasEdit ? `/workouts/${id}` : '/', { replace: true });
  };

  const focusedIndex = () => Math.min(draft().focus.ex, draft().exercises.length - 1);

  return (
    <Show when={draft()}>
      <SessionHeader
        onDetails={() => setSheet('details')}
        onFinish={() => setSheet('finish')}
        onMinimize={() => navigate('/')}
      />

      <Show when={draft().exercises.length} fallback={<FirstExercise />}>
        <FocusedExercise
          index={focusedIndex()}
          onMenu={() => setSheet('exercise')}
          onFinish={() => setSheet('finish')}
        />
      </Show>

      <div classList={{ 'h-32': !spotifyStatus().connected, 'h-48': spotifyStatus().connected }} />
      {/* Music controls and the rest timer share the bottom edge. */}
      <div class="fixed inset-x-0 bottom-0 z-40">
        <SpotifyBar />
        <RestBar />
        <Show when={spotifyStatus().connected && !draft().restEndsAt}>
          <div class="bg-raised pb-safe" />
        </Show>
      </div>

      <DetailsSheet open={sheet() === 'details'} onClose={() => setSheet(null)} onDiscard={() => setSheet('discard')} />
      <ExerciseSheet open={sheet() === 'exercise'} index={focusedIndex()} onClose={() => setSheet(null)} />
      <FinishSheet open={sheet() === 'finish'} onClose={() => setSheet(null)} onFinish={finish} />
      <ConfirmSheet
        open={sheet() === 'discard'}
        onClose={() => setSheet(null)}
        onConfirm={discard}
        title={draft().mode === 'edit' ? 'Discard changes?' : 'Discard workout?'}
        confirmLabel="Discard"
        danger
      >
        {draft().mode === 'edit'
          ? 'The saved workout stays as it was.'
          : 'Everything logged in this session will be lost.'}
      </ConfirmSheet>
    </Show>
  );
}

// ---- header + exercise strip --------------------------------------------------

function SessionHeader(props) {
  const now = useNow(1000);
  const clock = () => (now(), formatClock(elapsedSeconds()));
  const isLive = () => draft().mode === 'new' && !draft().timeEdited;

  return (
    <div
      class="sticky top-0 z-30 -mx-5 bg-paper px-5"
      style={{ 'padding-top': 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      <div class="flex items-center gap-1">
        <button class="btn btn-icon -ml-3" aria-label="Minimize workout" onClick={() => props.onMinimize()}>
          <ChevronDown size={26} />
        </button>
        <button class="min-w-0 flex-1 text-left" onClick={() => props.onDetails()} aria-label="Workout details">
          <p class="eyebrow flex items-center gap-1.5">
            <Show when={isLive()}>
              <span class="h-1.5 w-1.5 animate-pulse bg-signal" />
            </Show>
            {isLive() ? clock() : draft().mode === 'edit' ? 'Editing' : 'Logged workout'}
            <span>· {completedSetCount()} sets</span>
          </p>
          <p class="display flex items-center gap-1.5 truncate text-2xl">
            <span class="truncate">{draft().name || 'Workout'}</span>
            <Pencil size={14} class="shrink-0 text-muted" />
          </p>
        </button>
        <button class="btn btn-sm btn-ink" onClick={() => props.onFinish()} disabled={!anySetLogged()}>
          {draft().mode === 'edit' ? 'Save' : 'Finish'}
        </button>
      </div>
      <ExerciseStrip />
    </div>
  );
}

function ExerciseStrip() {
  let strip;
  // Keep the focused chip in view.
  createEffect(
    on(
      () => draft().focus.ex,
      (i) =>
        queueMicrotask(() =>
          strip?.children[i]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }),
        ),
    ),
  );
  return (
    <div class="rule -mx-5 mt-2 border-b-2">
      <div ref={strip} class="no-scrollbar flex gap-1 overflow-x-auto px-5 pb-2" role="tablist" aria-label="Exercises">
        <For each={draft().exercises}>
          {(ex, i) => {
            // Counts are of working sets, like the header; warm-ups still have to be done to complete it.
            const working = () => ex.sets.filter((s) => !isWarmup(s));
            const done = () => working().filter((s) => s.done).length;
            const active = () => draft().focus.ex === i();
            const complete = () => ex.sets.length > 0 && ex.sets.every((s) => s.done);
            const label = () => labels()[i()];
            // A superset's chips sit flush together with a signal-coloured top edge.
            const joinsNext = () => label() && draft().exercises[i() + 1]?.group === ex.group;
            return (
              <button
                role="tab"
                aria-selected={active()}
                class="flex h-10 max-w-[11rem] shrink-0 items-center gap-1.5 border-2 px-2.5 font-display text-[0.95rem] font-bold tracking-wide uppercase"
                classList={{
                  'border-ink bg-ink text-paper': active(),
                  'border-ink': !active() && complete(),
                  'rule text-muted': !active() && !complete(),
                  'border-t-signal': !!label(),
                  '-mr-1': !!joinsNext(),
                }}
                onClick={() => focusExercise(i())}
              >
                <Show
                  when={complete()}
                  fallback={
                    <span class="opacity-60" classList={{ '!text-signal !opacity-100': !!label() }}>
                      {label() ?? i() + 1}
                    </span>
                  }
                >
                  <Check size={14} strokeWidth={3} class={active() || label() ? 'text-signal' : ''} />
                </Show>
                <span class="truncate">{ex.name || 'New'}</span>
                <span class="opacity-60">
                  {done()}/{working().length}
                </span>
              </button>
            );
          }}
        </For>
        <button
          class="rule flex h-10 shrink-0 items-center gap-1 border-2 border-dashed px-3 font-display font-bold tracking-wide text-muted uppercase"
          onClick={() => addExercise()}
        >
          <Plus size={16} /> Add
        </button>
      </div>
    </div>
  );
}

// ---- focused exercise ------------------------------------------------------------

function QuickPicks(props) {
  // Your recent exercises, topped up with popular ones while history is short.
  const picks = createMemo(() => {
    const used = new Set(draft().exercises.map((e) => exerciseKey(e.name)));
    const out = [];
    for (const name of [...recentExercises().map((e) => e.name), ...POPULAR]) {
      const key = exerciseKey(name);
      if (!used.has(key) && out.length < 10) {
        used.add(key);
        out.push(name);
      }
    }
    return out;
  });
  return (
    <Show when={picks().length}>
      <p class="eyebrow mt-5">{recentExercises().length ? 'Quick picks' : 'Popular exercises'}</p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <For each={picks()}>
          {(name) => (
            <button
              class="rule border-2 px-3 py-2 text-left font-medium active:bg-sunk"
              onClick={() => props.onPick(name)}
            >
              {name}
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}

function FirstExercise() {
  const [name, setName] = createSignal('');
  const add = (value) => value.trim() && addExercise(value.trim());
  return (
    <div class="pt-8">
      <p class="eyebrow">Empty workout</p>
      <h2 class="display mt-1 text-[2.75rem]">What's first?</h2>
      <form
        class="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(name());
        }}
      >
        <ExerciseNameInput value={name()} onInput={setName} onPick={add} suggestions={exerciseOptions()} autofocus />
        <button type="submit" class="btn btn-ink" disabled={!name().trim()}>
          Add
        </button>
      </form>
      <QuickPicks onPick={add} />
    </div>
  );
}

function FocusedExercise(props) {
  const i = () => props.index;
  const ex = () => draft().exercises[i()];
  // The name editor opens by itself for an unnamed exercise and stays open
  // while typing, until the name is committed (blur, Enter or a suggestion).
  // Keyed on the exercise itself: removing or moving one can put a different
  // exercise at the same index.
  const [renaming, setRenaming] = createSignal(false);
  createEffect(
    on(
      () => ex()?.key,
      () => setRenaming(!ex()?.name),
    ),
  );
  const saved = () => (ex().name ? exerciseByName(ex().name) : null);
  const last = () => (draft().mode === 'new' && saved()?.last_performed_at ? saved() : null);
  const focused = () => draft().focus.set;
  const allDone = () => ex().sets.length > 0 && ex().sets.every((s) => s.done);
  const nextExercise = () => draft().exercises[i() + 1];
  let section;
  createEffect(
    on(
      () => ex()?.key,
      () => enter(section, { y: 4 }),
      { defer: true },
    ),
  );

  return (
    <Show when={ex()}>
      <section ref={section} class="pt-5">
        <div class="flex items-center gap-2">
          <p class="eyebrow flex-1">
            Exercise {i() + 1} of {draft().exercises.length}
            <Show when={labels()[i()]}>
              <span class="ml-2 text-signal">· Superset {labels()[i()][0]}</span>
            </Show>
          </p>
          <button class="btn btn-icon -mr-3" aria-label="Exercise options" onClick={() => props.onMenu()}>
            <Ellipsis size={22} />
          </button>
        </div>

        <Show
          when={renaming()}
          fallback={
            <button class="display mt-1 block w-full text-left text-[2.5rem]" onClick={() => setRenaming(true)}>
              {ex().name}
            </button>
          }
        >
          <div class="mt-1">
            <ExerciseNameInput
              class="field display h-14 !text-3xl"
              value={ex().name}
              suggestions={exerciseOptions()}
              autofocus
              onInput={(v) => updateDraft('exercises', i(), 'name', v)}
              onCommit={() => {
                if (ex().name.trim()) setRenaming(false);
                applyHistoryHints(i());
              }}
            />
            <Show when={!ex().name}>
              <QuickPicks
                onPick={(name) => {
                  updateDraft('exercises', i(), 'name', name);
                  applyHistoryHints(i());
                }}
              />
            </Show>
          </div>
        </Show>

        <Show when={last()}>
          <p class="mt-2 text-sm text-muted">
            <span class="eyebrow">Last · {timeAgo(last().last_performed_at)}</span>
            <span class="ml-2 font-medium text-ink">{describeSets(last().last_sets, last().last_unit)}</span>
          </p>
        </Show>
        <Show when={draft().mode === 'new' && ex().suggestion}>
          {(step) => (
            <p class="mt-2 flex items-start gap-2 border-l-4 border-ok pl-2 text-sm">
              <TrendingUp size={16} class="mt-0.5 shrink-0 text-ok" />
              <span>
                <b>
                  Up a step: {formatWeight(step().weight)} {step().unit}.
                </b>{' '}
                Every set reached {step().repMax} reps last time.
              </span>
            </p>
          )}
        </Show>
        <Show when={saved()?.notes}>
          <p class="mt-2 border-l-4 border-signal pl-2 text-sm whitespace-pre-wrap">{saved().notes}</p>
        </Show>

        <ol class="mt-4" aria-label="Sets">
          <For each={ex().sets}>
            {(set, j) => (
              <Show
                when={focused() === j()}
                fallback={
                  <SetRow ex={ex()} set={set} label={setLabel(ex().sets, j())} onClick={() => focusSet(i(), j())} />
                }
              >
                <SetEditor set={set} i={i()} j={j()} label={setLabel(ex().sets, j())} />
              </Show>
            )}
          </For>
        </ol>

        <div class="mt-2 flex gap-1">
          <button class="btn btn-quiet shrink-0 text-muted" onClick={() => addWarmup(i())}>
            <Plus size={18} /> Warm-up
          </button>
          <button class="btn btn-quiet min-w-0 flex-1 text-muted" onClick={() => addSet(i())}>
            <Plus size={18} /> Add set
            <Show when={addSetPreview(i())}>
              {(copy) => <span class="truncate font-normal">· {describeCopy(copy())}</span>}
            </Show>
          </button>
        </div>

        <Show when={allDone() && focused() === -1}>
          <div class="mt-4">
            <Show
              when={nextExercise()}
              fallback={
                <button class="btn btn-lg btn-signal btn-block" onClick={() => props.onFinish()}>
                  <Check size={20} /> {draft().mode === 'edit' ? 'Save changes' : 'Finish workout'}
                </button>
              }
            >
              <button class="btn btn-lg btn-signal btn-block" onClick={() => focusExercise(i() + 1)}>
                Next: <span class="truncate">{nextExercise().name || 'exercise'}</span> <ArrowRight size={20} />
              </button>
            </Show>
          </div>
        </Show>
      </section>
    </Show>
  );
}

/** "60 kg × 8", or "12 reps" for bodyweight. */
function describeCopy({ weight, reps, unit }) {
  const w = parseNumber(weight);
  return w > 0 ? `${formatWeight(w)} ${unit} × ${reps}` : `${reps} reps`;
}

function SetRow(props) {
  const set = () => props.set;
  const weight = () => effectiveValue(props.ex, set(), 'weight');
  const reps = () => effectiveValue(props.ex, set(), 'reps');
  const suggested = () => !set().done && !set().weight && !set().reps;
  return (
    <li>
      <button
        class="rule flex w-full items-center gap-4 border-b py-3 text-left active:bg-sunk"
        onClick={() => props.onClick()}
      >
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center border-2 font-display text-lg font-bold"
          classList={{
            'border-ink bg-ink text-paper': set().done,
            'rule text-muted': !set().done,
            'border-dashed': isWarmup(set()) && !set().done,
          }}
        >
          <Show when={set().done} fallback={props.label}>
            <Show when={isWarmup(set())} fallback={<Check size={18} strokeWidth={3} class="anim-check" />}>
              W
            </Show>
          </Show>
        </span>
        <span
          class="display flex-1"
          classList={{ 'text-muted': suggested(), 'text-[1.75rem]': !isWarmup(set()), 'text-xl': isWarmup(set()) }}
        >
          {weight() ? formatWeight(parseNumber(weight())) : '–'}
          <span class="mx-1 text-base text-muted">{props.ex.unit} ×</span>
          {reps() || '–'}
        </span>
        <Show when={set().rpe}>
          <span class="tag text-muted">RPE {set().rpe}</span>
        </Show>
        <Show when={set().pr?.length}>
          <PrTag title={describeRecords(set().pr)} />
        </Show>
      </button>
    </li>
  );
}

function Stepper(props) {
  const value = () => props.set[props.field];
  const hint = () => hintValue(draft().exercises[props.i], props.set, props.field);
  return (
    <div>
      <div class="flex items-end justify-between gap-2">
        <label class="eyebrow" for={props.id}>
          {props.label}
        </label>
        {props.extra}
      </div>
      <div class="mt-1 grid h-[4.5rem] grid-cols-[4.5rem_1fr_4.5rem] border-2 border-ink">
        <button
          class="flex items-center justify-center bg-sunk active:bg-ink active:text-paper"
          aria-label={`Decrease ${props.label.toLowerCase()} by ${props.step}`}
          onClick={() => {
            buzz();
            stepField(props.i, props.j, props.field, -props.step);
          }}
        >
          <Minus size={28} strokeWidth={2.5} />
        </button>
        <input
          id={props.id}
          class="display w-full min-w-0 bg-raised text-center text-[2.75rem] outline-none placeholder:text-muted/70"
          inputmode={props.inputmode}
          value={value()}
          placeholder={Number.isFinite(parseNumber(hint())) ? formatWeight(parseNumber(hint())) : '0'}
          onInput={(e) => updateDraft('exercises', props.i, 'sets', props.j, props.field, e.currentTarget.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          class="flex items-center justify-center bg-sunk active:bg-ink active:text-paper"
          aria-label={`Increase ${props.label.toLowerCase()} by ${props.step}`}
          onClick={() => {
            buzz();
            stepField(props.i, props.j, props.field, props.step);
          }}
        >
          <Plus size={28} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

const RPE_CHOICES = ['6', '7', '8', '9', '10'];

function SetEditor(props) {
  const set = () => props.set;
  const unit = () => draft().exercises[props.i].unit;
  const log = () => {
    const { i, j } = props; // focus moves on once logged
    const problem = logSet(i, j);
    if (problem) return toast(problem, 'error');
    buzz();
    const ex = draft().exercises[i];
    const logged = ex.sets[j];
    if (logged.pr.length) {
      const what =
        logged.weight > 0
          ? `${formatWeight(parseNumber(logged.weight))} ${ex.unit} × ${logged.reps}`
          : `${logged.reps} reps`;
      toast(`New PR · ${ex.name} ${what} (${describeRecords(logged.pr)})`, 'pr');
      navigator.vibrate?.([30, 60, 30]);
    }
  };
  return (
    <li
      ref={(el) => queueMicrotask(() => el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }))}
      // Margins keep it clear of the sticky header and the rest timer when scrolled into view.
      class="anim-pop my-2 scroll-mt-40 scroll-mb-44 border-2 border-ink bg-raised p-4 shadow-[4px_4px_0_var(--ink)]"
    >
      <div class="mb-3 flex items-center gap-2">
        <p class="display flex-1 text-2xl">{props.label === 'W' ? 'Warm-up' : `Set ${props.label}`}</p>
        <button
          type="button"
          role="switch"
          aria-checked={isWarmup(set())}
          class="flex h-9 items-center gap-2 px-1 text-sm font-semibold"
          classList={{ 'text-muted': !isWarmup(set()) }}
          onClick={() => toggleWarmup(props.i, props.j)}
        >
          <span
            class="flex h-5 w-5 items-center justify-center border-2"
            classList={{
              'border-signal bg-signal text-on-signal': isWarmup(set()),
              'border-current': !isWarmup(set()),
            }}
          >
            <Show when={isWarmup(set())}>
              <Check size={12} strokeWidth={3.5} />
            </Show>
          </span>
          Warm-up
        </button>
        <Show when={set().done}>
          <span class="tag text-ok">
            <Check size={12} strokeWidth={3} /> Logged
          </span>
        </Show>
        <button
          class="btn btn-icon -mr-2 text-muted"
          aria-label="Remove set"
          onClick={() => removeSet(props.i, props.j)}
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div class="grid gap-3">
        <Stepper
          id={`w-${set().key}`}
          label={`Weight ${unit()}`}
          field="weight"
          step={weightStepFor(props.i)}
          inputmode="decimal"
          set={set()}
          i={props.i}
          j={props.j}
          extra={
            <ChipToggle
              label="Weight unit"
              value={unit()}
              options={UNITS.map((u) => [u, u])}
              onChange={(u) => setExerciseUnit(props.i, u)}
            />
          }
        />
        <Stepper
          id={`r-${set().key}`}
          label="Reps"
          field="reps"
          step={1}
          inputmode="numeric"
          set={set()}
          i={props.i}
          j={props.j}
        />
        <div>
          <p class="eyebrow">RPE (optional)</p>
          <div class="mt-1 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="RPE">
            <For each={RPE_CHOICES}>
              {(v) => (
                <button
                  role="radio"
                  aria-checked={set().rpe === v}
                  class="h-10 border-2 font-display text-lg font-bold"
                  classList={{ 'border-ink bg-ink text-paper': set().rpe === v, 'rule text-muted': set().rpe !== v }}
                  onClick={() => updateDraft('exercises', props.i, 'sets', props.j, 'rpe', set().rpe === v ? '' : v)}
                >
                  {v}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>

      <Show
        when={set().done}
        fallback={
          <button class="btn btn-lg btn-signal btn-block mt-4" onClick={log}>
            <Check size={22} strokeWidth={3} /> Log set
          </button>
        }
      >
        <div class="mt-4 grid grid-cols-2 gap-2">
          <button class="btn" onClick={() => undoSet(props.i, props.j)}>
            <Undo2 size={18} /> Undo
          </button>
          <button class="btn btn-ink" onClick={() => closeEditor(props.i)}>
            Done
          </button>
        </div>
      </Show>
    </li>
  );
}

// ---- rest timer -------------------------------------------------------------------

function RestBar() {
  const now = useNow(250);
  const endsAt = () => (draft()?.restEndsAt ? Date.parse(draft().restEndsAt) : null);
  const remaining = () => (endsAt() == null ? null : Math.max(0, Math.ceil((endsAt() - now()) / 1000)));
  const progress = () => Math.min(1, (remaining() ?? 0) / Math.max(1, draft()?.restTotal || 1));

  createEffect(
    on(remaining, (left, prev) => {
      if (left === 0 && prev > 0) navigator.vibrate?.([250, 120, 250]);
    }),
  );
  createEffect(() => {
    if (endsAt() != null && now() - endsAt() > 5000) stopRest();
  });

  return (
    <Show when={remaining() != null}>
      <div
        class="anim-slide-up border-t-2 border-ink pb-safe"
        classList={{ 'bg-ink text-paper': remaining() > 0, 'bg-signal text-on-signal': remaining() === 0 }}
        role="timer"
        aria-live="off"
      >
        <div
          class="h-1 bg-signal transition-[width] duration-200 ease-linear"
          style={{ width: `${progress() * 100}%` }}
        />
        <div class="mx-auto flex max-w-xl items-center gap-2 px-5 py-3">
          <div class="flex-1">
            <p
              class="eyebrow"
              classList={{ '!text-paper/60': remaining() > 0, '!text-on-signal/70': remaining() === 0 }}
            >
              {remaining() > 0 ? 'Rest' : 'Rest over'}
            </p>
            <p class="display text-[2.5rem] leading-none">{remaining() > 0 ? formatClock(remaining()) : 'Go!'}</p>
          </div>
          <Show when={remaining() > 0}>
            <button
              class="btn btn-sm border-paper/40 text-paper"
              onClick={() => adjustRest(-15)}
              aria-label="15 seconds less"
            >
              −15
            </button>
            <button
              class="btn btn-sm border-paper/40 text-paper"
              onClick={() => adjustRest(15)}
              aria-label="15 seconds more"
            >
              +15
            </button>
          </Show>
          <button
            class="btn btn-sm"
            classList={{ 'btn-signal': remaining() > 0, 'btn-ink': remaining() === 0 }}
            onClick={stopRest}
          >
            {remaining() > 0 ? 'Skip' : 'OK'}
          </button>
        </div>
      </div>
    </Show>
  );
}

// ---- sheets -----------------------------------------------------------------------

function DetailsSheet(props) {
  return (
    <Sheet open={props.open} onClose={() => props.onClose()} title="Workout details">
      <div class="grid gap-3">
        <label class="grid gap-1">
          <span class="eyebrow">Name</span>
          <input
            class="field"
            placeholder="Workout"
            value={draft().name}
            onInput={(e) => updateDraft('name', e.currentTarget.value)}
          />
        </label>
        <label class="grid gap-1">
          <span class="eyebrow">Started</span>
          <input
            type="datetime-local"
            class="field"
            value={toLocalInput(draft().startedAt)}
            onChange={(e) => {
              if (!e.currentTarget.value) return;
              updateDraft({ startedAt: new Date(e.currentTarget.value).toISOString(), timeEdited: true });
            }}
          />
          <Show when={draft().mode === 'new'}>
            <span class="text-xs text-muted">Change this to log a past workout (duration won't be recorded).</span>
          </Show>
        </label>
        <label class="grid gap-1">
          <span class="eyebrow">Notes</span>
          <textarea
            class="field"
            rows="3"
            placeholder="How did it go?"
            value={draft().notes}
            onInput={(e) => updateDraft('notes', e.currentTarget.value)}
          />
        </label>
      </div>
      <button class="btn btn-ink btn-block mt-5" onClick={() => props.onClose()}>
        Done
      </button>
      <button class="btn btn-danger btn-block mt-1" onClick={() => props.onDiscard()}>
        <Trash2 size={18} /> {draft().mode === 'edit' ? 'Discard changes' : 'Discard workout'}
      </button>
    </Sheet>
  );
}

function ExerciseSheet(props) {
  const ex = () => draft().exercises[props.index];
  // Do the action, then close the sheet.
  const run = (fn) => {
    fn();
    props.onClose();
  };
  const next = () => draft().exercises[props.index + 1];
  const inSuperset = () => groupMembers(props.index).length > 1;
  const linkedToNext = () => next() && ex()?.group != null && next().group === ex().group;
  return (
    <Sheet open={props.open} onClose={() => props.onClose()} title={ex()?.name || 'Exercise'}>
      <div class="rule grid border-t">
        <button
          class="rule flex items-center gap-3 border-b py-4 text-left text-lg font-medium disabled:opacity-35"
          disabled={props.index === 0}
          onClick={() => run(() => moveExercise(props.index, -1))}
        >
          <ArrowUp size={20} /> Move earlier
        </button>
        <button
          class="rule flex items-center gap-3 border-b py-4 text-left text-lg font-medium disabled:opacity-35"
          disabled={props.index >= draft().exercises.length - 1}
          onClick={() => run(() => moveExercise(props.index, 1))}
        >
          <ArrowDown size={20} /> Move later
        </button>
        <Show when={next() && !linkedToNext()}>
          <button
            class="rule flex items-center gap-3 border-b py-4 text-left text-lg font-medium"
            onClick={() => run(() => linkWithNext(props.index))}
          >
            <Link2 size={20} />
            <span class="min-w-0 flex-1">
              Superset with next
              <span class="block truncate text-sm font-normal text-muted">
                Alternate sets with {next().name || 'the next exercise'}; rest after each round
              </span>
            </span>
          </button>
        </Show>
        <Show when={inSuperset()}>
          <button
            class="rule flex items-center gap-3 border-b py-4 text-left text-lg font-medium"
            onClick={() => run(() => unlink(props.index))}
          >
            <Unlink2 size={20} /> Remove from superset
          </button>
        </Show>
        <button
          class="rule flex items-center gap-3 border-b py-4 text-left text-lg font-medium text-bad"
          onClick={() => run(() => removeExercise(props.index))}
        >
          <Trash2 size={20} /> Remove exercise
        </button>
      </div>
    </Sheet>
  );
}

function FinishSheet(props) {
  const stats = createMemo(() => {
    const d = draft();
    if (!d) return null;
    let sets = 0;
    let vol = 0;
    const skipped = [];
    for (const ex of d.exercises) {
      const logged = ex.sets.filter((s) => s.done);
      const done = logged.filter((s) => !isWarmup(s)); // warm-ups don't count
      if (!logged.length) skipped.push(ex.name || 'Unnamed exercise');
      sets += done.length;
      vol += convert(
        done.reduce((t, s) => t + (parseNumber(s.weight) || 0) * (parseNumber(s.reps) || 0), 0),
        ex.unit,
        displayUnit(),
      );
    }
    return { sets, vol, skipped, exercises: d.exercises.length - skipped.length };
  });
  const isEdit = () => draft()?.mode === 'edit';
  return (
    <Sheet open={props.open} onClose={() => props.onClose()} title={isEdit() ? 'Save changes?' : 'Finish workout?'}>
      <Show when={stats()}>
        <div class="rule grid grid-cols-3 border-y">
          <div class="px-2 py-3">
            <p class="display text-3xl">{formatDuration(elapsedSeconds()) ?? '–'}</p>
            <p class="eyebrow mt-1">Time</p>
          </div>
          <div class="rule border-l px-3 py-3">
            <p class="display text-3xl">{stats().sets}</p>
            <p class="eyebrow mt-1">Sets</p>
          </div>
          <div class="rule border-l px-3 py-3">
            <p class="display text-3xl">{formatNumber(stats().vol)}</p>
            <p class="eyebrow mt-1">{displayUnit()} volume</p>
          </div>
        </div>
        <Show when={draftRecords().length}>
          <div class="mt-3 flex items-start gap-2 bg-signal px-3 py-2 text-on-signal">
            <Trophy size={18} class="mt-0.5 shrink-0" />
            <p class="font-semibold">
              {draftRecords().length} new {draftRecords().length === 1 ? 'PR' : 'PRs'}:{' '}
              {[...new Set(draftRecords().map((r) => r.name))].join(', ')}
            </p>
          </div>
        </Show>
        <Show when={stats().skipped.length}>
          <p class="mt-3 text-sm text-muted">
            No sets logged for {stats().skipped.join(', ')}. {stats().skipped.length === 1 ? 'It' : 'They'} won't be
            saved.
          </p>
        </Show>
        <button class="btn btn-lg btn-signal btn-block mt-5" onClick={() => props.onFinish()}>
          <Check size={22} strokeWidth={3} /> {isEdit() ? 'Save changes' : 'Finish & save'}
        </button>
        <button class="btn btn-quiet btn-block mt-1" onClick={() => props.onClose()}>
          Keep going
        </button>
      </Show>
    </Sheet>
  );
}
