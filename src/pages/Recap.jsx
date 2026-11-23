import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { CalendarX2, ChevronLeft, ChevronRight, Share, Trophy } from 'lucide-solid';
import { OfflineError } from '../lib/api';
import { cachedRecap, fetchRecap, recapKey } from '../lib/data';
import { addDays, startOfWeek } from '../lib/dates';
import { fileDate } from '../lib/download';
import { MUSCLE_GROUPS, REGIONS, regionOf } from '../lib/exercises';
import {
  formatDistance,
  formatDuration,
  formatLoad,
  formatNumber,
  formatTimedSet,
  isTimedSet,
  plural,
} from '../lib/format';
import { distanceUnit, setRecapSeen, unit } from '../lib/prefs';
import { describeRecords } from '../lib/records';
import { recapCard, recapTitle } from '../lib/sharecard';
import { convert } from '../lib/units';
import { Badge } from '../components/Achievement';
import ShareSheet, { sharer } from '../components/ShareSheet';
import { EmptyState, PageHeader, Section, Segmented, Spinner } from '../components/ui';

// Where the page opens: the current week, unless something asked for another period first.
let opening = null;
/** Open the recap at a period (`day`: any day in it), e.g. last week's from the Today card. */
export const openRecapAt = (period, day) => (opening = { period, day: new Date(day) });

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const periodStart = (period, d) => (period === 'week' ? startOfWeek(d) : startOfMonth(d));
const shift = (period, d, n) =>
  period === 'week' ? addDays(startOfWeek(d), 7 * n) : new Date(d.getFullYear(), d.getMonth() + n, 1);

const rangeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

/** "This Week", "Last Week", "2–8 Nov"; "This Month", "October 2026". */
function periodName(period, d) {
  const start = periodStart(period, d).getTime();
  const now = new Date();
  if (start === periodStart(period, now).getTime()) return period === 'week' ? 'This Week' : 'This Month';
  if (start === shift(period, now, -1).getTime())
    return period === 'week' ? 'Last Week' : monthFmt.format(new Date(start));
  if (period === 'month') return monthFmt.format(new Date(start));
  return `${rangeFmt.format(new Date(start))} – ${rangeFmt.format(addDays(new Date(start), 6))}`;
}

export default function Recap() {
  const start = opening ?? { period: 'week', day: new Date() };
  opening = null;
  const [period, setPeriod] = createSignal(start.period);
  const [day, setDay] = createSignal(start.day);
  const [recap, setRecap] = createSignal(cachedRecap(start.period, start.day));
  const [loading, setLoading] = createSignal(false);
  const [failed, setFailed] = createSignal(null);
  const [sharing, setSharing] = createSignal(false);

  createEffect(
    on([period, day], async ([p, d]) => {
      const key = recapKey(p, periodStart(p, d));
      setRecap(cachedRecap(p, periodStart(p, d)));
      setFailed(null);
      setLoading(true);
      try {
        const fresh = await fetchRecap(p, periodStart(p, d));
        if (recapKey(period(), periodStart(period(), day())) === key) setRecap(fresh);
        setRecapSeen(p, periodStart(p, d));
      } catch (err) {
        setFailed(err instanceof OfflineError ? "You're offline" : err.message);
      } finally {
        setLoading(false);
      }
    }),
  );

  const isCurrent = () => periodStart(period(), day()).getTime() >= periodStart(period(), new Date()).getTime();
  const pick = (p) => {
    setPeriod(p);
    setDay(p === 'week' ? startOfWeek(day()) : startOfMonth(day()));
  };
  const word = () => period();
  const r = () => recap();
  const prev = () => r()?.previous;

  return (
    <>
      <PageHeader
        back="/profile"
        backLabel="You"
        title="Recap"
        actions={
          <Show when={r()?.totals.workouts}>
            <button
              type="button"
              class="btn btn-icon text-accent"
              aria-label="Share recap"
              onClick={() => setSharing(true)}
            >
              <Share size={22} />
            </button>
          </Show>
        }
      />

      <Segmented
        label="Period"
        value={period()}
        options={[
          ['week', 'Week'],
          ['month', 'Month'],
        ]}
        onChange={pick}
      />
      <div class="mt-3 flex items-center gap-1">
        <button
          type="button"
          class="btn btn-icon text-accent"
          aria-label={`Previous ${word()}`}
          onClick={() => setDay(shift(period(), day(), -1))}
        >
          <ChevronLeft size={26} />
        </button>
        <div class="min-w-0 flex-1 text-center">
          <p class="t-headline truncate">{periodName(period(), day())}</p>
          <p class="t-foot text-label-2">
            <Show when={r()} fallback={' '}>
              {recapTitle(r())}
            </Show>
          </p>
        </div>
        <button
          type="button"
          class="btn btn-icon text-accent disabled:opacity-30"
          aria-label={`Next ${word()}`}
          disabled={isCurrent()}
          onClick={() => setDay(shift(period(), day(), 1))}
        >
          <ChevronRight size={26} />
        </button>
      </div>

      <Show
        when={r()}
        fallback={
          <Show when={!loading()} fallback={<Spinner class="mx-auto mt-12 block text-label-2" />}>
            <div class="card mt-4">
              <EmptyState icon={CalendarX2} title="Couldn't load the recap" body={failed() ?? ''} />
            </div>
          </Show>
        }
      >
        <Show
          when={r().totals.workouts}
          fallback={
            <div class="card mt-4">
              <EmptyState
                icon={CalendarX2}
                title={`No workouts this ${word()}`}
                body={
                  prev()?.workouts
                    ? `Last ${word()}: ${plural(prev().workouts, 'workout')}.`
                    : 'Workouts you log show up here, with your records and titles.'
                }
              />
            </div>
          }
        >
          <Totals recap={r()} word={word()} />
          <Days recap={r()} />
          <Records recap={r()} />
          <Exercises recap={r()} />
          <Muscles recap={r()} />
          <Earned recap={r()} />
        </Show>
      </Show>

      <Show when={r()}>
        <ShareSheet
          open={sharing()}
          onClose={() => setSharing(false)}
          title="Share Recap"
          filename={`recap-${period()}-${fileDate(new Date(`${r().start}T00:00:00`))}.png`}
          alt={`${recapTitle(r())}: a picture to share`}
          make={() => recapCard(r(), { who: sharer(), unit: unit(), distanceUnit: distanceUnit() })}
        />
      </Show>
    </>
  );
}

/** "+2", "−1 h 5 m", "Same": the change against the period before. */
function Delta(props) {
  const d = () => props.now - props.before;
  return (
    <p class="t-cap mt-0.5 truncate text-label-2">
      <Show when={props.before != null} fallback={' '}>
        <Show when={Math.abs(d()) >= (props.min ?? 1)} fallback={`Same as last ${props.word}`}>
          {d() > 0 ? '▲ ' : '▼ '}
          {props.format(Math.abs(d()))} vs last {props.word}
        </Show>
      </Show>
    </p>
  );
}

function Tile(props) {
  return (
    <div class="min-w-0 px-4 py-3">
      <p class="t-foot text-label-2">{props.label}</p>
      <p class="num mt-0.5 flex items-baseline gap-1 font-semibold">
        <span class="text-[26px] leading-8 whitespace-nowrap">{props.value}</span>
        <Show when={props.unit}>
          <span class="text-[14px] font-medium text-label-2">{props.unit}</span>
        </Show>
      </p>
      {props.children}
    </div>
  );
}

function Totals(props) {
  const t = () => props.recap.totals;
  const p = () => props.recap.previous;
  const kg = (v) => convert(v, 'kg', unit());
  const showDistance = () => t().volume_kg === 0 && t().distance_m > 0;
  return (
    <div class="card mt-4 grid grid-cols-2 [&>*:nth-child(even)]:border-l-[0.5px] [&>*:nth-child(n+3)]:border-t-[0.5px] [&>*]:border-separator">
      <Tile label="Workouts" value={t().workouts}>
        <Delta now={t().workouts} before={p().workouts} word={props.word} format={String} />
      </Tile>
      <Tile label="Time" value={formatDuration(t().duration_seconds) ?? '–'}>
        <Delta
          now={t().duration_seconds}
          before={p().duration_seconds}
          word={props.word}
          format={formatDuration}
          min={60}
        />
      </Tile>
      <Tile label="Sets" value={t().working_sets}>
        <Delta now={t().working_sets} before={p().working_sets} word={props.word} format={String} />
      </Tile>
      <Show
        when={showDistance()}
        fallback={
          <Tile label="Volume" value={formatNumber(kg(t().volume_kg))} unit={unit()}>
            <Delta
              now={kg(t().volume_kg)}
              before={kg(p().volume_kg)}
              word={props.word}
              format={(v) => `${formatNumber(v)} ${unit()}`}
            />
          </Tile>
        }
      >
        <Tile label="Distance" value={formatDistance(t().distance_m, distanceUnit())}>
          <Delta
            now={t().distance_m}
            before={p().distance_m}
            word={props.word}
            format={(v) => formatDistance(v, distanceUnit())}
            min={10}
          />
        </Tile>
      </Show>
    </div>
  );
}

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The days trained: a week's seven, or a month's calendar. */
function Days(props) {
  const trained = createMemo(() => new Set(props.recap.days));
  const start = () => new Date(`${props.recap.start}T00:00:00`);
  const cells = createMemo(() => {
    const first = start();
    const count = Math.round((new Date(`${props.recap.end}T00:00:00`) - first) / 86_400_000);
    const lead = props.recap.period === 'month' ? (first.getDay() + 6) % 7 : 0;
    return [...Array.from({ length: lead }, () => null), ...Array.from({ length: count }, (_, i) => addDays(first, i))];
  });
  return (
    <Section title={`${plural(props.recap.days.length, 'day')} trained`}>
      <div class="px-4 pt-3 pb-4">
        <div class="grid grid-cols-7 gap-1.5 text-center">
          <For each={['M', 'T', 'W', 'T', 'F', 'S', 'S']}>
            {(d) => <span class="t-cap font-semibold text-label-2">{d}</span>}
          </For>
          <For each={cells()}>
            {(d) => (
              <Show when={d} fallback={<span />}>
                <span
                  class="num mx-auto grid aspect-square w-full max-w-10 place-items-center rounded-full text-[14px] font-semibold"
                  classList={{
                    'bg-accent text-on-accent': trained().has(iso(d)),
                    'bg-fill text-label-2': !trained().has(iso(d)),
                  }}
                  aria-label={`${d.toDateString()}${trained().has(iso(d)) ? ': trained' : ''}`}
                >
                  {d.getDate()}
                </span>
              </Show>
            )}
          </For>
        </div>
      </div>
    </Section>
  );
}

function describeRecord(r) {
  if (isTimedSet(r)) return formatTimedSet(r, distanceUnit());
  return r.weight > 0 ? `${formatLoad(r.weight)} ${r.weight_unit} × ${r.reps}` : plural(r.reps, 'rep');
}

function Records(props) {
  return (
    <Show when={props.recap.records.length}>
      <Section title={plural(props.recap.records.length, 'Personal Record', 'Personal Records')}>
        <For each={props.recap.records}>
          {(rec) => (
            <A href={`/workouts/${rec.workout_id}`} class="row row-tap" style={{ '--sep-inset': '3.25rem' }}>
              <Trophy size={20} class="w-6 shrink-0 text-accent" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{rec.exercise_name}</span>
                <span class="t-foot block truncate text-label-2">{describeRecords(rec.kinds)}</span>
              </span>
              <span class="num row-value shrink-0">{describeRecord(rec)}</span>
              <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
            </A>
          )}
        </For>
      </Section>
    </Show>
  );
}

function Exercises(props) {
  const top = () => props.recap.exercises.slice(0, 5);
  const most = () => Math.max(1, ...top().map((e) => e.sets));
  return (
    <Section title="Most Trained">
      <For each={top()}>
        {(e) => (
          <A href={`/exercises/${e.exercise_id}`} class="row row-tap">
            <span class="min-w-0 flex-1">
              <span class="block truncate">{e.exercise_name}</span>
              <span class="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-fill">
                <span class="block h-full rounded-full bg-accent" style={{ width: `${(e.sets / most()) * 100}%` }} />
              </span>
            </span>
            <span class="num row-value shrink-0">{plural(e.sets, 'set')}</span>
            <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
          </A>
        )}
      </For>
    </Section>
  );
}

function Muscles(props) {
  const known = new Set(MUSCLE_GROUPS.map(([key]) => key));
  const regions = createMemo(() => {
    const sets = {};
    for (const [muscle, n] of Object.entries(props.recap.muscles)) {
      const group = known.has(muscle) ? muscle : 'other';
      const region = group === 'cardio' ? 'cardio' : regionOf(group);
      sets[region] = (sets[region] ?? 0) + n;
    }
    return [...REGIONS.map(([key, label]) => [key, label]), ['cardio', 'Cardio'], ['other', 'Other']]
      .map(([key, label]) => ({ key, label, sets: sets[key] ?? 0 }))
      .filter((r) => r.sets || REGIONS.some(([key]) => key === r.key));
  });
  const most = () => Math.max(1, ...regions().map((r) => r.sets));
  return (
    <Section title="Sets by Body Part">
      <div class="px-4 py-3">
        <For each={regions()}>
          {(region) => (
            <div class="flex items-center gap-3 py-1.5">
              <span class="t-sub w-20 shrink-0">{region.label}</span>
              <span class="h-2.5 flex-1 overflow-hidden rounded-full bg-fill">
                <span
                  class="block h-full rounded-full bg-accent"
                  style={{ width: `${(region.sets / most()) * 100}%` }}
                />
              </span>
              <span class="num t-sub w-8 shrink-0 text-right text-label-2">{region.sets}</span>
            </div>
          )}
        </For>
      </div>
    </Section>
  );
}

function Earned(props) {
  return (
    <Show when={props.recap.xp || props.recap.unlocks.length}>
      <Section title="Earned">
        <Show when={props.recap.xp}>
          <div class="row">
            <span class="flex-1">XP from workouts</span>
            <span class="num font-semibold text-accent">+{formatNumber(props.recap.xp)} XP</span>
          </div>
        </Show>
        <For each={props.recap.unlocks}>
          {(u) => (
            <A href="/achievements" class="row row-tap" style={{ '--sep-inset': '4rem' }}>
              <Badge medal={u.medal} icon={u.icon} size={34} />
              <span class="min-w-0 flex-1 truncate font-medium">{u.title}</span>
              <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
            </A>
          )}
        </For>
      </Section>
    </Show>
  );
}
