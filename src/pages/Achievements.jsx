import { createMemo, createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { Check, ChevronRight, WifiOff } from 'lucide-solid';
import {
  describeOwn,
  describeProgress,
  isCommunity,
  levelProgress,
  MEDALS,
  nextTier,
  titleKey,
  topTier,
  unlockedTiers,
  unlocks,
} from '../lib/achievements';
import { progression, refreshAll, wearCommunityTitle, wearTitle } from '../lib/data';
import { formatDay } from '../lib/format';
import { toast } from '../lib/toast';
import { Badge, XpBar } from '../components/Achievement';
import { EmptyState, PageHeader, Section, SectionTitle, Sheet, Spinner } from '../components/ui';

/** Level, XP, the title you wear and every achievement, by category. */
export default function Achievements() {
  refreshAll(); // a cheap check for anything new
  const p = () => progression.data();
  const [openId, setOpenId] = createSignal(null);
  // Which slot is being picked for: 'title' | 'community' | null.
  const [picking, setPicking] = createSignal(null);
  const opened = () => p()?.achievements.find((a) => a.id === openId()) ?? null;
  const titles = () => p()?.achievements.reduce((n, a) => n + a.tiers.length, 0) ?? 0;

  return (
    <>
      <PageHeader
        back="/profile"
        backLabel="You"
        title="Achievements"
        subtitle={p() ? `${unlocks(p()).length} of ${titles()} titles` : ''}
      />

      <Show
        when={p()}
        fallback={
          <Show when={!progression.loading()} fallback={<Spinner class="mx-auto mt-10 block text-label-2" />}>
            <div class="card mt-4">
              <EmptyState icon={WifiOff} title="Not loaded yet" body="Your achievements show up once you're online." />
            </div>
          </Show>
        }
      >
        <LevelCard progress={p()} />

        <Section class="mt-2" title="Titles">
          <button type="button" class="row row-tap" onClick={() => setPicking('title')}>
            <span class="flex-1">
              Title
              <span class="t-foot block text-label-2">Under your name</span>
            </span>
            <span class="row-value t-sub">{p().title?.title ?? 'None'}</span>
            <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
          </button>
          <button type="button" class="row row-tap" onClick={() => setPicking('community')}>
            <span class="flex-1">
              Community Title
              <span class="t-foot block text-label-2">Next to your name, earned together</span>
            </span>
            <span class="row-value t-sub">{p().community_title?.title ?? 'None'}</span>
            <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
          </button>
        </Section>

        <For each={p().categories}>
          {(category) => {
            const list = () => p().achievements.filter((a) => a.category === category.id);
            return (
              <Show when={list().length}>
                <SectionTitle>{category.name}</SectionTitle>
                <div class="card grid grid-cols-3 gap-y-5 px-1 py-4">
                  <For each={list()}>{(a) => <BadgeCell achievement={a} onOpen={() => setOpenId(a.id)} />}</For>
                </div>
                <Show when={category.id === 'community'}>
                  <p class="group-footer">
                    Earned together: reach the community’s weekly goal, or add your part to what everyone does. Worn
                    next to your name, apart from your title.
                  </p>
                </Show>
              </Show>
            );
          }}
        </For>
        <p class="group-footer">
          Worked out from your whole history. What you’ve earned stays yours, even if you edit or delete a workout
          later.
        </p>
      </Show>

      <AchievementSheet achievement={opened()} progress={p()} onClose={() => setOpenId(null)} />
      <TitleSheet
        open={!!picking()}
        community={picking() === 'community'}
        progress={p()}
        onClose={() => setPicking(null)}
      />
    </>
  );
}

export function LevelCard(props) {
  const level = () => levelProgress(props.progress.xp, props.progress.rules.level_step);
  return (
    <div class="card mt-3 px-4 pt-3.5 pb-4">
      <div class="flex items-baseline justify-between gap-3">
        <p class="t-title2">Level {level().level}</p>
        <p class="num t-foot text-label-2">
          {(props.progress.xp - level().from).toLocaleString('en')} / {(level().to - level().from).toLocaleString('en')}{' '}
          XP
        </p>
      </div>
      <div class="mt-2">
        <XpBar fraction={level().fraction} />
      </div>
      <p class="t-foot mt-2 text-label-2">
        {(level().to - props.progress.xp).toLocaleString('en')} XP to level {level().level + 1} ·{' '}
        {props.progress.xp.toLocaleString('en')} XP in all
      </p>
    </div>
  );
}

function BadgeCell(props) {
  const a = () => props.achievement;
  const next = () => nextTier(a());
  return (
    <button
      type="button"
      class="flex min-w-0 flex-col items-center gap-1.5 px-1.5 text-center transition-transform active:scale-95"
      onClick={() => props.onOpen()}
      aria-label={a().name ?? 'Secret achievement'}
    >
      <Badge medal={topTier(a())?.medal} icon={a().icon} secret={!a().name} />
      <span class="t-foot line-clamp-2 leading-tight font-medium">{a().name ?? '???'}</span>
      <span class="num t-cap -mt-1 text-label-2">
        <Show when={a().name} fallback="Secret">
          <Show
            when={next()}
            fallback={
              <span class="inline-flex items-center gap-0.5 text-accent">
                <Check size={12} strokeWidth={3} /> Done
              </span>
            }
          >
            {(n) => describeProgress(a(), n().target)}
          </Show>
        </Show>
      </span>
    </button>
  );
}

/** One achievement: every tier, what it takes, when it was reached, and wearing its title. */
function AchievementSheet(props) {
  const a = () => props.achievement;
  const [busy, setBusy] = createSignal(null);
  const community = () => !!a() && isCommunity(a());
  const wear = async (key) => {
    setBusy(key);
    try {
      await (community() ? wearCommunityTitle : wearTitle)(key);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet open={!!a()} onClose={() => props.onClose()} title={a()?.name ?? 'Secret'}>
      <Show when={a()}>
        <div class="flex flex-col items-center pb-4">
          <Badge medal={topTier(a())?.medal} icon={a().icon} secret={!a().name} size={84} />
          <p class="t-sub mt-2 text-label-2">
            {a().name ? `${unlockedTiers(a()).length} of ${a().tiers.length} reached` : 'Keep training to find out.'}
          </p>
        </div>
        <Show when={a().name}>
          <div class="group">
            <For each={a().tiers}>
              {(tier) => {
                const key = () => titleKey(a(), tier);
                const wearing = () =>
                  (community() ? props.progress?.community_title : props.progress?.title)?.key === key();
                return (
                  <div class="row !items-start !py-3" style={{ '--sep-inset': '4rem' }}>
                    <Badge medal={tier.unlocked_at ? tier.medal : null} icon={a().icon} size={36} />
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold" classList={{ 'text-label-2': !tier.unlocked_at }}>
                        {tier.title}
                      </p>
                      <p class="t-foot text-label-2">{tier.description}</p>
                      <p class="t-foot mt-0.5">
                        <Show
                          when={tier.unlocked_at}
                          fallback={
                            <span class="num text-label-2">
                              {describeProgress(a(), tier.target)}
                              <Show when={describeOwn(a())}>{(own) => ` · ${own()}`}</Show>
                            </span>
                          }
                        >
                          <Show
                            when={tier.workout_id}
                            fallback={<span class="text-label-2">{formatDay(tier.unlocked_at)}</span>}
                          >
                            <A href={`/workouts/${tier.workout_id}`} class="text-accent">
                              {formatDay(tier.unlocked_at)}
                            </A>
                          </Show>
                        </Show>
                        <Show when={tier.xp}>
                          <span class="text-label-2"> · +{tier.xp} XP</span>
                        </Show>
                      </p>
                    </div>
                    <Show when={tier.unlocked_at}>
                      <Show when={!wearing()} fallback={<span class="pill pill-accent mt-0.5 shrink-0">Wearing</span>}>
                        <button
                          type="button"
                          class="btn btn-sm btn-tinted shrink-0"
                          aria-busy={busy() === key()}
                          disabled={!!busy()}
                          onClick={() => wear(key())}
                        >
                          Wear
                        </button>
                      </Show>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </Sheet>
  );
}

/**
 * Pick the title shown under your name, or (`community`) the community title
 * next to it, from the ones you've unlocked (best first). Each slot takes only its own kind.
 */
function TitleSheet(props) {
  const [busy, setBusy] = createSignal(null);
  const rank = (u) => MEDALS.indexOf(u.tier.medal);
  const owned = createMemo(() =>
    unlocks(props.progress)
      .filter((u) => isCommunity(u.achievement) === !!props.community)
      .sort((x, y) => rank(y) - rank(x) || Date.parse(y.tier.unlocked_at) - Date.parse(x.tier.unlocked_at)),
  );
  const current = () => (props.community ? props.progress?.community_title : props.progress?.title)?.key ?? null;
  const pick = async (key) => {
    if (key === current()) return props.onClose();
    setBusy(key ?? 'none');
    try {
      await (props.community ? wearCommunityTitle : wearTitle)(key);
      props.onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };
  const mark = (key) => (
    <Show
      when={busy() === (key ?? 'none')}
      fallback={
        <Show when={current() === key}>
          <Check size={20} class="text-accent" />
        </Show>
      }
    >
      <Spinner class="text-label-2" />
    </Show>
  );
  return (
    <Sheet open={props.open} onClose={() => props.onClose()} title={props.community ? 'Community Title' : 'Title'}>
      <div class="group">
        <button type="button" class="row row-tap" disabled={!!busy()} onClick={() => pick(null)}>
          <span class="flex-1">None</span>
          {mark(null)}
        </button>
        <For each={owned()}>
          {(u) => (
            <button
              type="button"
              class="row row-tap"
              style={{ '--sep-inset': '3.75rem' }}
              disabled={!!busy()}
              onClick={() => pick(u.key)}
            >
              <Badge medal={u.tier.medal} icon={u.achievement.icon} size={32} />
              <span class="min-w-0 flex-1 text-left">
                <span class="block truncate">{u.tier.title}</span>
                <span class="t-foot block truncate text-label-2">{u.achievement.name}</span>
              </span>
              {mark(u.key)}
            </button>
          )}
        </For>
      </div>
      <Show when={!owned().length}>
        <p class="group-footer">
          {props.community
            ? 'Reach a community goal together to earn your first community title.'
            : 'Unlock an achievement to earn your first title.'}
        </p>
      </Show>
    </Sheet>
  );
}
