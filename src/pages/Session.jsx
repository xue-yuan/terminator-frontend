import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js';
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
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Trophy,
  Undo2,
  Unlink2,
} from 'lucide-solid';
import {
  catalog,
  catalogEntry,
  exerciseByName,
  exerciseOptions,
  progression,
  recentExercises,
  workoutList,
} from '../lib/data';
import { levelFor, workoutXp } from '../lib/achievements';
import { startOfWeek } from '../lib/dates';
import { weekStreak } from '../lib/stats';
import { exerciseKey, POPULAR } from '../lib/exercises';
import {
  describeSets,
  formatClock,
  formatDuration,
  formatLoad,
  formatNumber,
  formatWeight,
  isWarmup,
  plural,
  setLabel,
  timeAgo,
  toLocalInput,
} from '../lib/format';
import { enter, riseIn, slideAway } from '../lib/motion';
import { useBack } from '../lib/nav';
import { useNow } from '../lib/now';
import { celebrate, unit as displayUnit, keepAwake, restSound } from '../lib/prefs';
import { primeSound } from '../lib/sound';
import { celebrateFinish, prepareCelebration } from '../lib/celebrate';
import { restProgress, restRemaining } from '../lib/rest';
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
  draftChanged,
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
  restoreExercise,
  restoreSet,
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
import { toast, undoable } from '../lib/toast';
import { useWakeLock } from '../lib/wakelock';
import { PrTag, Segmented, Sheet, Switch } from '../components/ui';
import { discardWorkout } from '../components/StartSheet';
import { SwipeRow } from '../components/SwipeRow';
import ExerciseNameInput from '../components/ExerciseNameInput';
import SpotifyBar from '../components/SpotifyBar';
import { spotifyStatus } from '../lib/spotify';

const buzz = () => navigator.vibrate?.(8);

/**
 * The XP a just-saved workout earns, worked out here (it may not be uploaded
 * for a while): { before, gained, levelUp }, or null if achievements never loaded.
 */
function earnedXp(workout) {
  const p = progression.data();
  if (!p) return null;
  const week = startOfWeek(workout.performed_at).getTime();
  const firstThisWeek = !workoutList().some(
    (w) => w.id !== workout.id && startOfWeek(w.performed_at).getTime() === week,
  );
  const gained = workoutXp(workout, p.rules, { streak: weekStreak(), firstThisWeek });
  const step = p.rules.level_step;
  return { before: p.xp, gained, levelUp: levelFor(p.xp + gained, step) > levelFor(p.xp, step) };
}

/**
 * Pull the workout down to minimise it, like an iOS sheet: a downward drag that
 * starts on the header, or anywhere while the page is scrolled to the top, moves
 * the workout (and its bottom bars) with the finger, and so does one on the
 * bottom bars (a [data-pull-handle] too: always in reach of the thumb); let go far or fast enough
 * and it carries on down (onMinimize(px dragged)), otherwise it springs back.
 * Touch events, not pointer events: the page must still scroll natively, and
 * only a non-passive touchmove can take a vertical drag over from the browser.
 */
function createPullDown(elements, onMinimize) {
  let drag = null;
  const place = (dy, animate) => {
    for (const el of elements()) {
      if (!el) continue;
      el.style.transition = animate ? 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
      el.style.transform = dy ? `translateY(${dy}px)` : '';
    }
  };
  const onStart = (e) => {
    const t = e.touches[0];
    drag =
      e.touches.length === 1 && !e.target.closest('[role=listbox], textarea') // those scroll by themselves
        ? { x: t.clientX, y: t.clientY, header: !!e.target.closest('[data-pull-handle]'), active: false }
        : null;
  };
  const onMove = (e) => {
    if (!drag) return;
    const t = e.touches[0];
    if (!drag.active) {
      const dx = t.clientX - drag.x;
      const dy = t.clientY - drag.y;
      if (Math.hypot(dx, dy) < 10) return;
      const down = dy > 0 && dy > Math.abs(dx) * 1.2;
      if (!down || (!drag.header && window.scrollY > 0) || document.querySelector('dialog[open]')) {
        drag = null; // a scroll or a sideways swipe: not ours
        return;
      }
      Object.assign(drag, { active: true, y: t.clientY, lastY: t.clientY, lastT: e.timeStamp, v: 0, dy: 0 });
    }
    e.preventDefault();
    drag.dy = Math.max(0, t.clientY - drag.y);
    drag.v = (t.clientY - drag.lastY) / Math.max(1, e.timeStamp - drag.lastT);
    drag.lastY = t.clientY;
    drag.lastT = e.timeStamp;
    place(drag.dy, false);
  };
  const onEnd = () => {
    const d = drag;
    drag = null;
    if (!d?.active) return;
    if (d.dy > 140 || (d.dy > 40 && d.v > 0.5)) onMinimize(d.dy);
    else place(0, true);
  };
  /** Listen on `el` (a ref callback calls this); stops when its owner goes. */
  return (el) => {
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    onCleanup(() => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    });
  };
}

export default function Session() {
  const navigate = useNavigate();
  const back = useBack();
  const [sheet, setSheet] = createSignal(null); // 'details' | 'finish' | 'exercise'
  // The bottom bars come in once the workout has risen into place.
  const [rising, setRising] = createSignal(true);
  let root;
  let dock;
  let leaving = false;
  // No reaching for the phone to wake it between sets.
  useWakeLock(() => keepAwake() && !!draft());

  // Opened via the "Start workout" app shortcut or a stale link: start fresh
  // (before the first render, so the workout is there to mount).
  if (!draft()) startWorkout();
  onMount(() => riseIn(root).then(() => setRising(false)));
  // The workout went away by itself (left open for hours, cleared elsewhere): go home.
  createEffect(() => {
    if (!draft() && !leaving) navigate('/', { replace: true });
  });

  /** Slide the workout down (into the bottom bar) and go where it ends up. */
  const leave = (go, dragged = 0) => {
    leaving = true;
    slideAway({ dragged });
    go();
  };
  // Editing a logged workout isn't left running in the background: Cancel (or a
  // pull down) closes it. Untouched, it just closes; changed, it goes with Undo.
  const cancelEdit = (dragged) => {
    const id = draft().id;
    const changed = draftChanged();
    setSheet(null);
    leave(() => {
      if (changed) discardWorkout();
      else discardDraft();
      back(`/workouts/${id}`);
    }, dragged);
  };
  const minimize = (dragged) => (draft().mode === 'edit' ? cancelEdit(dragged) : leave(() => back('/'), dragged));
  // Pull it down with the thumb, from anywhere once scrolled to the top (or by
  // the header at any time), instead of reaching for the button up in the corner.
  const pullDown = createPullDown(() => [root, dock], minimize);

  const finish = () => {
    const wasEdit = draft().mode === 'edit';
    if (!wasEdit) prepareCelebration(); // still inside the tap: lets the fanfare play
    const records = draftRecords().length;
    const { workout, error } = finishWorkout();
    if (error) return toast(error, 'error');
    setSheet(null);
    // A new workout gets confetti and a "Workout Complete" card instead of a toast.
    if (wasEdit || !celebrate()) toast(wasEdit ? 'Changes saved' : 'Workout saved', 'success');
    else celebrateFinish(workout.id, { records, xp: earnedXp(workout) });
    leave(() => navigate(`/workouts/${workout.id}`, { replace: true }));
  };

  // No confirmation: it goes right away, with Undo in the toast.
  const discard = () => {
    setSheet(null);
    leave(() => {
      discardWorkout();
      navigate('/', { replace: true });
    });
  };

  const focusedIndex = () => Math.min(draft().focus.ex, draft().exercises.length - 1);

  return (
    <Show when={draft()}>
      <div
        ref={(el) => {
          root = el;
          pullDown(el);
        }}
        class="relative z-[41] -mx-4 min-h-dvh bg-bg px-4"
      >
        <SessionHeader
          onDetails={() => setSheet('details')}
          onFinish={() => setSheet('finish')}
          onMinimize={() => minimize(0)}
        />

        <Show when={draft().exercises.length} fallback={<FirstExercise />}>
          <FocusedExercise
            index={focusedIndex()}
            onMenu={() => setSheet('exercise')}
            onFinish={() => setSheet('finish')}
          />
        </Show>

        {/* An edit is thrown away with Cancel, up in the corner. */}
        <Show when={draft().mode === 'new'}>
          <div class="group mt-10">
            <button type="button" class="row row-tap justify-center text-bad" onClick={discard}>
              Discard Workout
            </button>
          </div>
        </Show>

        <div classList={{ 'h-32': !spotifyStatus().connected, 'h-48': spotifyStatus().connected }} />
      </div>
      {/* Music controls and the rest timer share the bottom edge. Outside the workout
          above so a pull-down can move both together (a transform would detach it). */}
      <Show when={!rising()}>
        <div
          ref={(el) => {
            dock = el;
            pullDown(el);
          }}
          data-pull-handle
          class="fixed inset-x-0 bottom-0 z-[42]"
        >
          <SpotifyBar />
          <RestBar />
          <Show when={spotifyStatus().connected && restRemaining() == null}>
            <div class="bar pb-safe" />
          </Show>
        </div>
      </Show>

      <DetailsSheet open={sheet() === 'details'} onClose={() => setSheet(null)} onDiscard={discard} />
      <ExerciseSheet open={sheet() === 'exercise'} index={focusedIndex()} onClose={() => setSheet(null)} />
      <FinishSheet open={sheet() === 'finish'} onClose={() => setSheet(null)} onFinish={finish} />
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
      data-pull-handle
      class="bar sticky top-0 z-30 -mx-4 border-b-[0.5px] border-separator px-4"
      style={{ 'padding-top': 'calc(env(safe-area-inset-top) + 0.625rem)' }}
    >
      {/* Says it can be pulled down, like a sheet. */}
      <div class="grabber mb-[3px]" aria-hidden="true" />
      <div class="flex h-12 items-center gap-2">
        <div class="flex w-20 shrink-0">
          <Show
            when={draft().mode === 'new'}
            fallback={
              <button type="button" class="btn btn-plain -ml-2 h-11 px-2" onClick={() => props.onMinimize()}>
                Cancel
              </button>
            }
          >
            <button
              type="button"
              class="btn btn-icon -ml-2 text-accent"
              aria-label="Minimize workout"
              onClick={() => props.onMinimize()}
            >
              <ChevronDown size={30} strokeWidth={2.25} />
            </button>
          </Show>
        </div>
        <button
          type="button"
          class="min-w-0 flex-1 text-center active:opacity-60"
          onClick={() => props.onDetails()}
          aria-label="Workout details"
        >
          <p class="t-headline truncate">{draft().name || 'Workout'}</p>
          <p class="t-cap flex items-center justify-center gap-1 text-label-2">
            <Show when={isLive()}>
              <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            </Show>
            <span class="num">{isLive() ? clock() : draft().mode === 'edit' ? 'Editing' : 'Logged workout'}</span>
            <span>· {plural(completedSetCount(), 'set')}</span>
          </p>
        </button>
        <div class="flex w-20 shrink-0 justify-end">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            onClick={() => props.onFinish()}
            disabled={!anySetLogged()}
          >
            {draft().mode === 'edit' ? 'Save' : 'Finish'}
          </button>
        </div>
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
    <div
      ref={strip}
      class="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pt-1 pb-2.5"
      role="tablist"
      aria-label="Exercises"
    >
      <For each={draft().exercises}>
        {(ex, i) => {
          // Counts are of working sets, like the header; warm-ups still have to be done to complete it.
          const working = () => ex.sets.filter((s) => !isWarmup(s));
          const done = () => working().filter((s) => s.done).length;
          const active = () => draft().focus.ex === i();
          const complete = () => ex.sets.length > 0 && ex.sets.every((s) => s.done);
          const label = () => labels()[i()];
          return (
            <button
              type="button"
              role="tab"
              aria-selected={active()}
              class="flex h-8 max-w-[12rem] shrink-0 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium transition-colors"
              classList={{
                'bg-accent text-on-accent': active(),
                'bg-fill text-label': !active() && complete(),
                'bg-fill text-label-2': !active() && !complete(),
              }}
              onClick={() => focusExercise(i())}
            >
              <Show when={complete()}>
                <Check size={14} strokeWidth={3} class={active() ? '' : 'text-ok'} />
              </Show>
              <Show when={label()}>
                <span class="font-semibold" classList={{ 'text-accent': !active() }}>
                  {label()}
                </span>
              </Show>
              <span class="truncate">{ex.name || 'New exercise'}</span>
              <span class="num opacity-70">
                {done()}/{working().length}
              </span>
            </button>
          );
        }}
      </For>
      <button
        type="button"
        class="flex h-8 shrink-0 items-center gap-1 rounded-full bg-fill px-3 text-[14px] font-medium text-accent"
        onClick={() => addExercise()}
      >
        <Plus size={16} strokeWidth={2.5} /> Add
      </button>
    </div>
  );
}

// ---- focused exercise ------------------------------------------------------------

function QuickPicks(props) {
  // Your recent exercises, topped up with popular ones while history is short
  // (those still in the library: an admin may have removed one).
  const picks = createMemo(() => {
    const used = new Set(draft().exercises.map((e) => exerciseKey(e.name)));
    const out = [];
    const popular = POPULAR.filter((name) => !catalog.data() || catalogEntry(name));
    for (const name of [...recentExercises().map((e) => e.name), ...popular]) {
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
      <p class="group-header !px-1">{recentExercises().length ? 'Quick picks' : 'Popular exercises'}</p>
      <div class="flex flex-wrap gap-2">
        <For each={picks()}>
          {(name) => (
            <button
              type="button"
              class="h-9 rounded-full bg-card px-3.5 text-[15px] transition-transform active:scale-95 active:bg-fill"
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

function SearchField(props) {
  return (
    <div class="relative">
      <Search size={18} class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-label-2" />
      {props.children}
    </div>
  );
}

function FirstExercise() {
  const [name, setName] = createSignal('');
  const add = (value) => value.trim() && addExercise(value.trim());
  return (
    <div class="pt-6">
      <h2 class="t-title1">What's first?</h2>
      <form
        class="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(name());
        }}
      >
        <SearchField>
          <ExerciseNameInput
            class="field pl-9"
            placeholder="Search or type an exercise"
            value={name()}
            onInput={setName}
            onPick={add}
            suggestions={exerciseOptions()}
            listWhenEmpty={false}
          />
        </SearchField>
        <button type="submit" class="btn btn-primary" disabled={!name().trim()}>
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
  // exercise at the same index. 'auto' (a new exercise) waits for a tap before
  // the keyboard comes up; 'manual' (you tapped the name to change it) focuses it.
  const [renaming, setRenaming] = createSignal(false);
  createEffect(
    on(
      () => ex()?.key,
      () => setRenaming(ex()?.name ? false : 'auto'),
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
      () => enter(section, { y: 6 }),
      { defer: true },
    ),
  );

  const deleteSet = (j) => {
    const exercise = i();
    const removed = ex().sets[j];
    removeSet(exercise, j);
    undoable('Set deleted', () => restoreSet(exercise, j, removed));
  };

  return (
    <Show when={ex()}>
      <section ref={section} class="pt-4">
        <div class="flex items-start gap-2">
          <div class="min-w-0 flex-1">
            <p class="t-foot text-label-2">
              Exercise {i() + 1} of {draft().exercises.length}
              <Show when={labels()[i()]}>
                <span class="text-accent"> · Superset {labels()[i()][0]}</span>
              </Show>
            </p>
            <Show
              when={renaming()}
              fallback={
                <button
                  type="button"
                  class="t-title1 block w-full text-left active:opacity-60"
                  onClick={() => setRenaming('manual')}
                >
                  {ex().name}
                </button>
              }
            >
              <div class="mt-1.5">
                <SearchField>
                  <ExerciseNameInput
                    class="field h-12 pl-9 text-[20px] font-semibold"
                    placeholder="Exercise name"
                    value={ex().name}
                    suggestions={exerciseOptions()}
                    autofocus={renaming() === 'manual'}
                    listWhenEmpty={false}
                    onInput={(v) => updateDraft('exercises', i(), 'name', v)}
                    onCommit={() => {
                      if (ex().name.trim()) setRenaming(false);
                      applyHistoryHints(i());
                    }}
                  />
                </SearchField>
              </div>
            </Show>
          </div>
          <button
            type="button"
            class="btn btn-round mt-1 shrink-0"
            aria-label="Exercise options"
            onClick={() => props.onMenu()}
          >
            <Ellipsis size={18} strokeWidth={2.5} />
          </button>
        </div>

        <Show when={renaming() && !ex().name}>
          <QuickPicks
            onPick={(name) => {
              updateDraft('exercises', i(), 'name', name);
              applyHistoryHints(i());
            }}
          />
        </Show>

        <Show when={last()}>
          <p class="t-sub mt-1 text-label-2">
            Last time, {timeAgo(last().last_performed_at)}:{' '}
            <span class="text-label">{describeSets(last().last_sets, last().last_unit)}</span>
          </p>
        </Show>
        <Show when={draft().mode === 'new' && ex().suggestion}>
          {(step) => (
            <p class="t-sub mt-2.5 flex items-start gap-2 rounded-xl bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] px-3 py-2">
              <TrendingUp size={17} class="mt-0.5 shrink-0 text-ok" />
              <span>
                <b class="font-semibold">
                  Up a step: {formatWeight(step().weight)} {step().unit}.
                </b>{' '}
                Every set reached {plural(step().repMax, 'rep')} last time.
              </span>
            </p>
          )}
        </Show>
        <Show when={saved()?.notes}>
          <p class="t-sub mt-2.5 rounded-xl bg-card px-3 py-2 whitespace-pre-wrap text-label-2">{saved().notes}</p>
        </Show>

        <Show when={ex().sets.length}>
          <div class="group mt-4" role="list" aria-label="Sets">
            <For each={ex().sets}>
              {(set, j) => (
                <Show
                  when={focused() === j()}
                  fallback={
                    <SwipeRow
                      actions={[{ label: 'Delete', icon: Trash2, tone: 'bad', onAction: () => deleteSet(j()) }]}
                      style={{ '--sep-inset': '3.5rem' }}
                    >
                      <SetRow
                        ex={ex()}
                        set={set}
                        i={i()}
                        j={j()}
                        label={setLabel(ex().sets, j())}
                        onOpen={() => focusSet(i(), j())}
                      />
                    </SwipeRow>
                  }
                >
                  <SetEditor
                    set={set}
                    i={i()}
                    j={j()}
                    label={setLabel(ex().sets, j())}
                    onDelete={() => deleteSet(j())}
                  />
                </Show>
              )}
            </For>
          </div>
        </Show>

        <div class="mt-3 flex gap-2">
          <button type="button" class="btn btn-tinted min-w-0 flex-1" onClick={() => addSet(i())}>
            <Plus size={18} strokeWidth={2.5} /> Add Set
            <Show when={addSetPreview(i())}>
              {(copy) => <span class="num truncate font-normal opacity-80">· {describeCopy(copy())}</span>}
            </Show>
          </button>
          <button type="button" class="btn btn-gray shrink-0" onClick={() => addWarmup(i())}>
            <Plus size={18} strokeWidth={2.5} /> Warm-up
          </button>
        </div>

        <Show when={allDone() && focused() === -1}>
          <div class="anim-pop mt-4">
            <Show
              when={nextExercise()}
              fallback={
                <button type="button" class="btn btn-lg btn-primary btn-block" onClick={() => props.onFinish()}>
                  <Check size={20} strokeWidth={2.75} /> {draft().mode === 'edit' ? 'Save Changes' : 'Finish Workout'}
                </button>
              }
            >
              <button type="button" class="btn btn-lg btn-primary btn-block" onClick={() => focusExercise(i() + 1)}>
                Next: <span class="truncate">{nextExercise().name || 'exercise'}</span>{' '}
                <ArrowRight size={20} strokeWidth={2.5} />
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
  return w > 0 ? `${formatWeight(w)} ${unit} × ${reps}` : plural(reps, 'rep');
}

/** Log a set and celebrate a record. Returns false if it couldn't be logged. */
function log(i, j) {
  // This tap may start the rest timer: ready the chime that ends it (audio needs a tap).
  if (restSound()) primeSound();
  const problem = logSet(i, j);
  if (problem) {
    toast(problem, 'error');
    return false;
  }
  buzz();
  const ex = draft().exercises[i];
  const logged = ex.sets[j];
  if (logged.pr.length) {
    const what =
      logged.weight > 0
        ? `${formatWeight(parseNumber(logged.weight))} ${ex.unit} × ${logged.reps}`
        : plural(logged.reps, 'rep');
    toast(`New PR · ${ex.name} ${what} (${describeRecords(logged.pr)})`, 'pr');
    navigator.vibrate?.([30, 60, 30]);
  }
  return true;
}

/** The round marker at the start of a set: its number, W for a warm-up, a tick once logged. */
function SetBadge(props) {
  return (
    <span
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
      classList={{
        'bg-accent text-on-accent': props.set.done,
        'bg-fill text-label-2': !props.set.done,
      }}
    >
      <Show when={props.set.done} fallback={props.label}>
        <Show when={isWarmup(props.set)} fallback={<Check size={15} strokeWidth={3} class="anim-check" />}>
          W
        </Show>
      </Show>
    </span>
  );
}

function SetRow(props) {
  const set = () => props.set;
  const weight = () => effectiveValue(props.ex, set(), 'weight');
  const reps = () => effectiveValue(props.ex, set(), 'reps');
  const suggested = () => !set().done && !set().weight && !set().reps;
  return (
    <div role="listitem" class="flex items-center bg-card">
      <button type="button" class="row row-tap min-w-0 flex-1 !pr-2" onClick={() => props.onOpen()}>
        <SetBadge set={set()} label={props.label} />
        <span
          class="num min-w-0 flex-1 truncate"
          classList={{ 'text-label-3': suggested(), 'text-[15px]': isWarmup(set()) }}
        >
          <span class="text-[20px] font-semibold" classList={{ '!text-[17px]': isWarmup(set()) }}>
            {weight() === '' ? '–' : formatLoad(parseNumber(weight()))}
          </span>
          <span class="mx-1 text-[15px] text-label-2">{parseNumber(weight()) === 0 ? '×' : `${props.ex.unit} ×`}</span>
          <span class="text-[20px] font-semibold" classList={{ '!text-[17px]': isWarmup(set()) }}>
            {reps() || '–'}
          </span>
        </span>
        <Show when={set().rpe}>
          <span class="pill">RPE {set().rpe}</span>
        </Show>
        <Show when={set().pr?.length}>
          <PrTag title={describeRecords(set().pr)} />
        </Show>
      </button>
      {/* Log it as shown, without opening it. */}
      <Show when={!set().done}>
        <button
          type="button"
          class="mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-label-3 transition-transform active:scale-90"
          aria-label={`Log set ${props.label}`}
          onClick={() => log(props.i, props.j)}
        >
          <span class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-current">
            <Check size={14} strokeWidth={3} />
          </span>
        </button>
      </Show>
    </div>
  );
}

function Stepper(props) {
  const value = () => props.set[props.field];
  const hint = () => hintValue(draft().exercises[props.i], props.set, props.field);
  // With `bodyweight`, a weight of 0 reads "BW", typed or suggested; the BW button sets it.
  const isBW = (v) => !!props.bodyweight && v !== '' && parseNumber(v) === 0;
  const bodyweight = () => isBW(effectiveValue(draft().exercises[props.i], props.set, props.field));
  const placeholder = () => {
    if (isBW(hint())) return 'BW';
    const n = parseNumber(hint());
    return Number.isFinite(n) ? formatWeight(n) : '–'; // nothing to log yet
  };
  const button =
    'flex w-11 shrink-0 items-center justify-center text-accent transition-colors active:bg-fill-2 disabled:opacity-40';
  return (
    <div class="min-w-0">
      {/* Tall enough for the BW button, in both steppers so the two stay level. */}
      <div class="flex h-6 items-center justify-between gap-2 pl-1">
        <label class="t-cap truncate font-medium text-label-2 uppercase" for={props.id}>
          {props.label}
        </label>
        <Show when={props.bodyweight}>
          {/* Small to look at; the ::before makes it a comfortable target. */}
          <button
            type="button"
            title="Bodyweight"
            aria-pressed={bodyweight()}
            class="relative h-6 shrink-0 rounded-full px-2.5 text-[12px] font-bold transition-colors before:absolute before:-inset-x-1.5 before:-inset-y-2 before:content-['']"
            classList={{ 'bg-accent text-on-accent': bodyweight(), 'bg-fill text-accent': !bodyweight() }}
            onClick={() => {
              buzz();
              updateDraft('exercises', props.i, 'sets', props.j, props.field, '0');
            }}
          >
            BW
          </button>
        </Show>
      </div>
      <div class="mt-1.5 flex h-14 overflow-hidden rounded-xl bg-fill">
        <button
          type="button"
          class={button}
          aria-label={`Decrease ${props.label.toLowerCase()} by ${props.step}`}
          onClick={() => {
            buzz();
            stepField(props.i, props.j, props.field, -props.step);
          }}
        >
          <Minus size={22} strokeWidth={2.75} />
        </button>
        <input
          id={props.id}
          class="num w-full min-w-0 bg-transparent text-center text-[28px] font-semibold outline-none placeholder:text-label"
          inputmode={props.inputmode}
          value={isBW(value()) ? 'BW' : value()}
          placeholder={placeholder()}
          // Typing over "BW" (selected on focus) leaves just the number.
          onInput={(e) =>
            updateDraft(
              'exercises',
              props.i,
              'sets',
              props.j,
              props.field,
              e.currentTarget.value.replace(/[^\d.,]/g, ''),
            )
          }
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          class={button}
          aria-label={`Increase ${props.label.toLowerCase()} by ${props.step}`}
          onClick={() => {
            buzz();
            stepField(props.i, props.j, props.field, props.step);
          }}
        >
          <Plus size={22} strokeWidth={2.75} />
        </button>
      </div>
    </div>
  );
}

const RPE_CHOICES = ['6', '7', '8', '9', '10'];

/** The open set: weight and reps side by side, RPE, and Log. Small enough that the whole exercise stays in view. */
function SetEditor(props) {
  const set = () => props.set;
  const unit = () => draft().exercises[props.i].unit;
  return (
    <div
      role="listitem"
      ref={(el) => queueMicrotask(() => el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }))}
      // Margins keep it clear of the sticky header and the rest timer when scrolled into view.
      class="anim-pop scroll-mt-36 scroll-mb-36 bg-card px-4 pt-3 pb-4"
      style={{ '--sep-inset': '0px' }}
    >
      <div class="flex items-center gap-3">
        <SetBadge set={set()} label={props.label} />
        <p class="t-headline flex-1">{props.label === 'W' ? 'Warm-up' : `Set ${props.label}`}</p>
        <span class="t-sub text-label-2">Warm-up</span>
        <Switch label="Warm-up set" checked={isWarmup(set())} onChange={() => toggleWarmup(props.i, props.j)} />
        <button
          type="button"
          class="btn btn-icon -mr-2 text-bad"
          aria-label="Delete set"
          onClick={() => props.onDelete()}
        >
          <Trash2 size={19} />
        </button>
      </div>

      <div class="mt-2.5 grid grid-cols-[1.15fr_1fr] gap-2">
        <Stepper
          id={`w-${set().key}`}
          label={`Weight · ${unit()}`}
          field="weight"
          step={weightStepFor(props.i)}
          inputmode="decimal"
          bodyweight
          set={set()}
          i={props.i}
          j={props.j}
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
      </div>

      <div class="mt-2.5 flex items-center gap-2">
        <span class="t-cap w-9 shrink-0 pl-1 font-medium text-label-2 uppercase">RPE</span>
        <div class="grid flex-1 grid-cols-5 gap-1.5" role="radiogroup" aria-label="RPE">
          <For each={RPE_CHOICES}>
            {(v) => (
              <button
                type="button"
                role="radio"
                aria-checked={set().rpe === v}
                class="num h-9 rounded-lg text-[16px] font-semibold transition-colors"
                classList={{ 'bg-accent text-on-accent': set().rpe === v, 'bg-fill text-label-2': set().rpe !== v }}
                onClick={() => updateDraft('exercises', props.i, 'sets', props.j, 'rpe', set().rpe === v ? '' : v)}
              >
                {v}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show
        when={set().done}
        fallback={
          <button type="button" class="btn btn-lg btn-primary btn-block mt-3" onClick={() => log(props.i, props.j)}>
            <Check size={22} strokeWidth={3} /> Log Set
          </button>
        }
      >
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button type="button" class="btn btn-lg btn-gray" onClick={() => undoSet(props.i, props.j)}>
            <Undo2 size={18} /> Undo
          </button>
          <button type="button" class="btn btn-lg btn-tinted" onClick={() => closeEditor(props.i)}>
            Done
          </button>
        </div>
      </Show>
    </div>
  );
}

// ---- rest timer -------------------------------------------------------------------

function RestBar() {
  return (
    <Show when={restRemaining() != null}>
      <div
        class="bar anim-slide-up relative border-t-[0.5px] border-separator pb-safe"
        classList={{ '!bg-accent text-on-accent': restRemaining() === 0 }}
        role="timer"
        aria-live="off"
      >
        <div
          class="absolute top-0 left-0 h-[3px] bg-accent"
          style={{ width: `${restProgress() * 100}%`, transition: 'width 250ms linear' }}
        />
        <div class="mx-auto flex max-w-xl items-center gap-2 px-4 py-2.5">
          <div class="flex-1">
            <p class="t-cap font-medium uppercase" classList={{ 'text-label-2': restRemaining() > 0 }}>
              {restRemaining() > 0 ? 'Rest' : 'Rest over'}
            </p>
            <p class="num text-[34px] leading-9 font-semibold">
              {restRemaining() > 0 ? formatClock(restRemaining()) : 'Go!'}
            </p>
          </div>
          <Show when={restRemaining() > 0}>
            <button
              type="button"
              class="btn btn-sm btn-gray num"
              onClick={() => adjustRest(-15)}
              aria-label="15 seconds less"
            >
              −15
            </button>
            <button
              type="button"
              class="btn btn-sm btn-gray num"
              onClick={() => adjustRest(15)}
              aria-label="15 seconds more"
            >
              +15
            </button>
          </Show>
          <button
            type="button"
            class="btn btn-sm"
            classList={{ 'btn-primary': restRemaining() > 0, 'bg-white text-accent': restRemaining() === 0 }}
            onClick={stopRest}
          >
            {restRemaining() > 0 ? 'Skip' : 'OK'}
          </button>
        </div>
      </div>
    </Show>
  );
}

// ---- sheets -----------------------------------------------------------------------

function DetailsSheet(props) {
  return (
    <Sheet open={props.open} onClose={() => props.onClose()} title="Workout Details">
      <div class="group">
        <label class="row">
          <span class="w-20 shrink-0">Name</span>
          <input
            class="field-inline text-right"
            placeholder="Workout"
            value={draft().name}
            onInput={(e) => updateDraft('name', e.currentTarget.value)}
          />
        </label>
        <label class="row">
          <span class="w-20 shrink-0">Started</span>
          <input
            type="datetime-local"
            class="field-inline text-right text-label-2"
            value={toLocalInput(draft().startedAt)}
            onChange={(e) => {
              if (!e.currentTarget.value) return;
              updateDraft({ startedAt: new Date(e.currentTarget.value).toISOString(), timeEdited: true });
            }}
          />
        </label>
      </div>
      <Show when={draft().mode === 'new'}>
        <p class="group-footer">Change the start to log a past workout (its duration won't be recorded).</p>
      </Show>
      <div class="group mt-6">
        <textarea
          class="field-inline block min-h-24 w-full px-4 py-3"
          rows="3"
          placeholder="Notes: how did it go?"
          value={draft().notes}
          onInput={(e) => updateDraft('notes', e.currentTarget.value)}
        />
      </div>
      <Show when={draft().mode === 'new'}>
        <button type="button" class="btn btn-lg btn-block mt-6 bg-card text-bad" onClick={() => props.onDiscard()}>
          Discard Workout
        </button>
      </Show>
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
  const remove = () => {
    const index = props.index;
    const removed = ex();
    removeExercise(index);
    undoable(`${removed.name || 'Exercise'} removed`, () => restoreExercise(index, removed));
  };
  const item = 'row row-tap disabled:opacity-35';
  return (
    <Sheet open={props.open} onClose={() => props.onClose()} title={ex()?.name || 'Exercise'}>
      <Show when={ex()}>
        <div class="group">
          <div class="row">
            <span class="flex-1">Weight unit</span>
            <Segmented
              class="w-32"
              label="Weight unit"
              value={ex().unit}
              options={UNITS.map((u) => [u, u])}
              onChange={(u) => setExerciseUnit(props.index, u)}
            />
          </div>
        </div>
        <p class="group-footer">Relabels this exercise's numbers; nothing is converted.</p>

        <div class="group mt-6" style={{ '--sep-inset': '3.25rem' }}>
          <button
            type="button"
            class={item}
            disabled={props.index === 0}
            onClick={() => run(() => moveExercise(props.index, -1))}
          >
            <ArrowUp size={20} class="w-6 text-accent" /> Move Earlier
          </button>
          <button
            type="button"
            class={item}
            disabled={props.index >= draft().exercises.length - 1}
            onClick={() => run(() => moveExercise(props.index, 1))}
          >
            <ArrowDown size={20} class="w-6 text-accent" /> Move Later
          </button>
          <Show when={next() && !linkedToNext()}>
            <button type="button" class={item} onClick={() => run(() => linkWithNext(props.index))}>
              <Link2 size={20} class="w-6 shrink-0 text-accent" />
              <span class="min-w-0 flex-1">
                Superset with Next
                <span class="t-foot block truncate text-label-2">
                  Alternate sets with {next().name || 'the next exercise'}; rest after each round
                </span>
              </span>
            </button>
          </Show>
          <Show when={inSuperset()}>
            <button type="button" class={item} onClick={() => run(() => unlink(props.index))}>
              <Unlink2 size={20} class="w-6 text-accent" /> Remove from Superset
            </button>
          </Show>
        </div>

        <div class="group mt-6">
          <button
            type="button"
            class="row row-tap text-bad"
            style={{ '--sep-inset': '3.25rem' }}
            onClick={() => run(remove)}
          >
            <Trash2 size={20} class="w-6" /> Remove Exercise
          </button>
        </div>
      </Show>
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
    <Sheet open={props.open} onClose={() => props.onClose()} title={isEdit() ? 'Save Changes?' : 'Finish Workout?'}>
      <Show when={stats()}>
        <div class="card grid grid-cols-3">
          <div class="px-4 py-3">
            <p class="t-foot text-label-2">Time</p>
            <p class="num text-[24px] font-semibold">{formatDuration(elapsedSeconds()) ?? '–'}</p>
          </div>
          <div class="border-l-[0.5px] border-separator px-4 py-3">
            <p class="t-foot text-label-2">Sets</p>
            <p class="num text-[24px] font-semibold">{stats().sets}</p>
          </div>
          <div class="border-l-[0.5px] border-separator px-4 py-3">
            <p class="t-foot text-label-2">Volume</p>
            <p class="num text-[24px] font-semibold">
              {formatNumber(stats().vol)}
              <span class="ml-0.5 text-[14px] font-medium text-label-2">{displayUnit()}</span>
            </p>
          </div>
        </div>
        <Show when={draftRecords().length}>
          <div class="mt-3 flex items-start gap-2.5 rounded-xl bg-accent-soft px-4 py-3 text-accent">
            <Trophy size={18} class="mt-0.5 shrink-0" />
            <p class="font-semibold">
              {plural(draftRecords().length, 'new PR', 'new PRs')}:{' '}
              {[...new Set(draftRecords().map((r) => r.name))].join(', ')}
            </p>
          </div>
        </Show>
        <Show when={stats().skipped.length}>
          <p class="group-footer">
            No sets logged for {stats().skipped.join(', ')}. {stats().skipped.length === 1 ? 'It' : 'They'} won't be
            saved.
          </p>
        </Show>
        <button type="button" class="btn btn-lg btn-primary btn-block mt-6" onClick={() => props.onFinish()}>
          <Check size={22} strokeWidth={3} /> {isEdit() ? 'Save Changes' : 'Finish & Save'}
        </button>
        <button type="button" class="btn btn-lg btn-plain btn-block mt-1" onClick={() => props.onClose()}>
          Keep Going
        </button>
      </Show>
    </Sheet>
  );
}
