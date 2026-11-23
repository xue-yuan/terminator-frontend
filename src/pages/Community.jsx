import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { Check, Hand, Users } from 'lucide-solid';
import { OfflineError } from '../lib/api';
import { community, feed, highFive, refreshAll, teamGoal } from '../lib/data';
import { addDays } from '../lib/dates';
import { formatDay, formatTime, plural } from '../lib/format';
import { toast } from '../lib/toast';
import { Badge, CommunityTag } from '../components/Achievement';
import { EmptyState, PageHeader, Section, Spinner } from '../components/ui';

const initials = (name) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

// Avatar colours (iOS system colours), the same for someone every time.
const COLORS = ['#ff9500', '#34c759', '#5856d6', '#ff2d55', '#007aff', '#af52de', '#30b0c7', '#a2845e'];

function Avatar(props) {
  return (
    <span
      class="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        background: COLORS[props.id % COLORS.length],
        width: `${props.size ?? 44}px`,
        height: `${props.size ?? 44}px`,
        'font-size': `${Math.round((props.size ?? 44) * 0.38)}px`,
      }}
      aria-hidden="true"
    >
      {initials(props.name)}
    </span>
  );
}

/** "18:30" today, "Yesterday 18:30", else "Mon 23 Nov · 18:30". */
function when(iso) {
  const d = new Date(iso);
  const today = new Date().toDateString();
  if (d.toDateString() === today) return `Today ${formatTime(iso)}`;
  if (d.toDateString() === addDays(new Date(), -1).toDateString()) return `Yesterday ${formatTime(iso)}`;
  return `${formatDay(iso)} · ${formatTime(iso)}`;
}

/**
 * Everyone who trains here: this week's goal for everyone together, who
 * finished a workout and when (high-five it), and the players with their
 * titles. By name, never ranked: everyone trains for themselves.
 */
export default function Community() {
  const [failed, setFailed] = createSignal(null);
  onMount(async () => {
    await Promise.all([community.refresh(), teamGoal.refresh(), feed.refresh()]);
    refreshAll(); // high-fives on your workouts, among the rest
    const err = community.error() ?? teamGoal.error() ?? feed.error();
    if (err) setFailed(err.message);
    else if (!community.data() && !navigator.onLine) setFailed(new OfflineError().message);
  });
  const players = () => community.data() ?? [];
  const byId = createMemo(() => new Map(players().map((p) => [p.id, p])));

  return (
    <>
      <PageHeader back="/profile" backLabel="You" title="Community" />
      <Show
        when={players().length}
        fallback={
          <Show when={!community.loading()} fallback={<Spinner class="mx-auto mt-12 block text-label-2" />}>
            <div class="card mt-3">
              <EmptyState icon={Users} title="Couldn't load who's here" body={failed() ?? "You're offline."} />
            </div>
          </Show>
        }
      >
        <Show when={teamGoal.data()}>{(goal) => <Goal goal={goal()} byId={byId()} />}</Show>
        <Feed />

        <Section
          title={plural(players().length, 'player')}
          footer="Everyone who trains here, by name. Wear your titles from Achievements and everyone here sees them."
        >
          <For each={players()}>
            {(p) => (
              <div class="row" style={{ '--sep-inset': '4.25rem' }}>
                <Avatar id={p.id} name={p.name} />
                <span class="min-w-0 flex-1">
                  {/* The tags go to the next line rather than cutting the name short. */}
                  <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span class="max-w-full truncate font-medium">{p.name}</span>
                    <Show when={p.you}>
                      <span class="pill shrink-0">You</span>
                    </Show>
                    <Show when={p.community_title}>{(t) => <CommunityTag title={t()} />}</Show>
                  </span>
                  <Show when={p.title} fallback={<span class="t-foot block truncate text-label-3">No title yet</span>}>
                    <span class="t-sub flex items-center gap-1.5 truncate font-medium">
                      <Badge medal={p.title.medal} icon="star" size={16} /> {p.title.title}
                    </span>
                  </Show>
                </span>
                <span class="num t-foot shrink-0 font-semibold text-label-2">Lv {p.level}</span>
              </div>
            )}
          </For>
        </Section>
      </Show>
    </>
  );
}

/** This week's goal for everyone together: how far along it is, and who has trained. */
function Goal(props) {
  const g = () => props.goal;
  const left = () => Math.max(0, g().target - g().total);
  const sunday = () => addDays(new Date(`${g().week_end}T00:00:00`), -1);
  return (
    <Section
      class="mt-2"
      title="This Week Together"
      footer={
        g().weeks_reached
          ? `You've been part of ${plural(g().weeks_reached, 'reached goal')}${g().streak > 1 ? `, ${g().streak} weeks in a row` : ''}. Reached goals earn community titles.`
          : 'Train this week to be part of it. Reaching it together earns community titles.'
      }
    >
      <div class="px-4 pt-3 pb-4">
        <div class="flex items-baseline justify-between gap-3">
          <p class="num">
            <span class="text-[34px] leading-10 font-semibold">{g().total}</span>
            <span class="ml-1 text-[17px] font-medium text-label-2">/ {plural(g().target, 'workout')}</span>
          </p>
          <Show
            when={g().reached}
            fallback={
              <span class="t-foot text-label-2">
                {left()} to go · ends {formatDay(sunday())}
              </span>
            }
          >
            <span class="pill pill-accent shrink-0">
              <Check size={12} strokeWidth={3} /> Reached
            </span>
          </Show>
        </div>
        <div
          class="mt-2 h-2.5 overflow-hidden rounded-full bg-fill"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax={g().target}
          aria-valuenow={g().total}
        >
          <div
            class="h-full rounded-full bg-accent transition-[width] duration-700 ease-ios"
            style={{ width: `${Math.min(100, (g().total / g().target) * 100)}%` }}
          />
        </div>
        <Show when={g().trained.length}>
          <div class="mt-3 flex items-center gap-2">
            <div class="flex -space-x-2">
              <For each={g().trained.slice(0, 8)}>
                {(id) => (
                  <span class="rounded-full ring-2 ring-[var(--card)]">
                    <Avatar id={id} name={props.byId.get(id)?.name} size={28} />
                  </span>
                )}
              </For>
            </div>
            <span class="t-foot text-label-2">{plural(g().trained.length, 'player')} trained this week</span>
          </div>
        </Show>
      </div>
    </Section>
  );
}

/** Who finished a workout, and when (nothing more about it), with a high-five for each. */
function Feed() {
  const [busy, setBusy] = createSignal(null);
  const toggle = async (item) => {
    navigator.vibrate?.(8);
    setBusy(item.workout_id);
    try {
      await highFive(item.workout_id, !item.high_fived);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Section title="Activity">
      <For each={feed.data() ?? []} fallback={<p class="row t-sub text-label-2">Finished workouts show up here.</p>}>
        {(item) => (
          <div class="row" style={{ '--sep-inset': '4.25rem' }}>
            <Avatar id={item.player_id} name={item.name} size={40} />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{item.you ? 'You' : item.name}</span>
              <span class="t-foot block truncate text-label-2">Finished a workout · {when(item.at)}</span>
              <Show when={item.you && item.high_fivers.length}>
                <span class="t-foot flex items-center gap-1 text-accent">
                  <Hand size={13} class="shrink-0" />
                  <span class="truncate">{item.high_fivers.join(', ')} high-fived</span>
                </span>
              </Show>
            </span>
            <Show when={!item.you}>
              <button
                type="button"
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-60"
                classList={{
                  'bg-accent text-on-accent': item.high_fived,
                  'bg-accent-soft text-accent': !item.high_fived,
                }}
                aria-pressed={item.high_fived}
                aria-label={`High-five ${item.name}`}
                title={item.high_fived ? 'High-fived' : 'High-five'}
                disabled={busy() === item.workout_id}
                onClick={() => toggle(item)}
              >
                <Hand size={19} classList={{ 'anim-pop': item.high_fived }} />
              </button>
            </Show>
          </div>
        )}
      </For>
    </Section>
  );
}
