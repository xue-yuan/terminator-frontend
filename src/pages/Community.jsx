import { createSignal, For, onMount, Show } from 'solid-js';
import { Users } from 'lucide-solid';
import { OfflineError } from '../lib/api';
import { community } from '../lib/data';
import { Badge } from '../components/Achievement';
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

/**
 * Everyone who trains here, with their level and the title they wear. By
 * name, never by level or anything else: nobody is ranked, everyone trains
 * for themselves.
 */
export default function Community() {
  const [failed, setFailed] = createSignal(null);
  onMount(async () => {
    await community.refresh();
    const err = community.error();
    if (err) setFailed(err.message);
    else if (!community.data() && !navigator.onLine) setFailed(new OfflineError().message);
  });
  const players = () => community.data() ?? [];

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
        <Section
          class="mt-2"
          title={`${players().length} ${players().length === 1 ? 'player' : 'players'}`}
          footer="Everyone who trains here, by name. Wear a title from your achievements and everyone here sees it."
        >
          <For each={players()}>
            {(p) => (
              <div class="row" style={{ '--sep-inset': '4.25rem' }}>
                <span
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[17px] font-semibold text-white"
                  style={{ background: COLORS[p.id % COLORS.length] }}
                  aria-hidden="true"
                >
                  {initials(p.name)}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <span class="truncate font-medium">{p.name}</span>
                    <Show when={p.you}>
                      <span class="pill shrink-0">You</span>
                    </Show>
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
