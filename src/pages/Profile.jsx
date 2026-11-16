import { createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import {
  ChevronRight,
  Download,
  Music,
  RotateCw,
  Scale,
  Share,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-solid';
import { currentUser, isAdmin, signOut } from '../lib/auth';
import { bodyWeightList } from '../lib/data';
import { formatDay, formatWeight, plural, timeAgo } from '../lib/format';
import { canPromptInstall, isIOS, isStandalone, promptInstall } from '../lib/install';
import { online } from '../lib/network';
import {
  keepAwake,
  restSeconds,
  setKeepAwake,
  setRestSeconds,
  setUnit,
  setWeightStepKg,
  setWeightStepLb,
  unit,
  weightStepKg,
  weightStepLb,
} from '../lib/prefs';
import { discardEntry, failedEntries, pendingEntries, retryFailed } from '../lib/sync';
import { connectSpotify, disconnectSpotify, spotifyStatus } from '../lib/spotify';
import { setTheme, theme } from '../lib/theme';
import { toast } from '../lib/toast';
import { wakeLockSupported } from '../lib/wakelock';
import DataTransfer from '../components/DataTransfer';
import { SwipeRow } from '../components/SwipeRow';
import { ConfirmSheet, PageHeader, Section, Segmented, Switch } from '../components/ui';

/** What a queued change is, for the list of rejected ones. */
function describeEntry(entry) {
  if (entry.type === 'exercise') return `Exercise: ${entry.data?.name ?? ''}`;
  if (entry.type === 'bodyWeight') {
    return entry.op === 'delete' ? 'Delete weigh-in' : `Body weight: ${entry.data?.weight} ${entry.data?.unit}`;
  }
  return entry.op === 'delete' ? 'Delete workout' : entry.data?.name || 'Workout';
}

/** A setting whose choices sit under its label in the same cell. */
function Choice(props) {
  return (
    <div class="px-4 py-3">
      <div class="mb-2 flex items-baseline justify-between gap-3">
        <span>{props.label}</span>
        <Show when={props.hint}>
          <span class="t-foot text-right text-label-2">{props.hint}</span>
        </Show>
      </div>
      {props.children}
    </div>
  );
}

const initials = (name) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

export default function Profile() {
  const user = currentUser;
  const [confirmSignOut, setConfirmSignOut] = createSignal(false);
  const unsynced = () => pendingEntries().length + failedEntries().length;

  const [spotifyBusy, setSpotifyBusy] = createSignal(false);
  async function connect() {
    setSpotifyBusy(true);
    try {
      await connectSpotify(); // leaves for Spotify's sign-in; keep the spinner until the page goes
      setTimeout(() => setSpotifyBusy(false), 5000);
    } catch (err) {
      toast(err.message, 'error');
      setSpotifyBusy(false);
    }
  }
  async function disconnect() {
    setSpotifyBusy(true);
    try {
      await disconnectSpotify();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSpotifyBusy(false);
    }
  }

  const [retrying, setRetrying] = createSignal(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await retryFailed();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <PageHeader title="You" />

      <div class="card mt-2 flex items-center gap-3 px-4 py-3">
        <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#ff9a3c] text-[22px] font-semibold text-white">
          {initials(user()?.full_name)}
        </span>
        <span class="min-w-0 flex-1">
          <span class="t-title3 block truncate">{user()?.full_name || 'You'}</span>
          <span class="t-sub block truncate text-label-2">{user()?.email}</span>
        </span>
      </div>

      {/* Only shown when something needs you: the server refused a change. */}
      <Show when={failedEntries().length}>
        <Section
          title="Couldn't upload"
          footer="The server refused these changes. Retry them, or swipe one left to discard it."
        >
          <For each={failedEntries()}>
            {(entry) => (
              <SwipeRow
                actions={[{ label: 'Discard', icon: Trash2, tone: 'bad', onAction: () => discardEntry(entry.version) }]}
              >
                <div class="row" style={{ '--sep-inset': '3.25rem' }}>
                  <TriangleAlert size={20} class="w-6 shrink-0 text-bad" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate">
                      {describeEntry(entry)}
                      <Show when={entry.type === 'workout' && entry.data}> · {formatDay(entry.data.performed_at)}</Show>
                    </p>
                    <p class="t-foot text-label-2">{entry.error}</p>
                  </div>
                </div>
              </SwipeRow>
            )}
          </For>
          <button
            type="button"
            class="row row-tap text-accent"
            style={{ '--sep-inset': '3.25rem' }}
            disabled={!online() || retrying()}
            onClick={retry}
          >
            <RotateCw size={19} class="w-6" classList={{ 'animate-spin': retrying() }} /> Retry All
          </button>
        </Section>
      </Show>

      <Section class="mt-2" title={isAdmin() ? 'Body & access' : 'Body'}>
        <A href="/body" class="row row-tap" style={{ '--sep-inset': '3.75rem' }}>
          <span class="row-icon bg-[#34c759]">
            <Scale size={18} />
          </span>
          <span class="flex-1">Body Weight</span>
          <span class="row-value t-sub">
            <Show when={bodyWeightList()[0]}>
              {(last) => `${formatWeight(last().weight)} ${last().unit} · ${timeAgo(last().measured_at)}`}
            </Show>
          </span>
          <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
        </A>
        <Show when={isAdmin()}>
          <A href="/admin" class="row row-tap" style={{ '--sep-inset': '3.75rem' }}>
            <span class="row-icon bg-[#5e5ce6]">
              <ShieldCheck size={18} />
            </span>
            <span class="flex-1">Access</span>
            <span class="row-value t-sub">Who can use the app</span>
            <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
          </A>
        </Show>
      </Section>

      <Section title="Training">
        <Choice label="Rest timer" hint="After each logged set">
          <Segmented
            label="Rest timer"
            value={restSeconds()}
            options={[
              [0, 'Off'],
              [60, '1:00'],
              [90, '1:30'],
              [120, '2:00'],
              [180, '3:00'],
            ]}
            onChange={setRestSeconds}
          />
        </Choice>
        <Choice label="Default unit" hint="New exercises and totals">
          <Segmented
            label="Default unit"
            value={unit()}
            options={[
              ['kg', 'kg'],
              ['lb', 'lb'],
            ]}
            onChange={setUnit}
          />
        </Choice>
        <Choice label="Weight step (kg)" hint="The − / + buttons">
          <Segmented
            label="Weight step in kg"
            value={weightStepKg()}
            options={[
              [1, '1'],
              [2, '2'],
              [2.5, '2.5'],
              [5, '5'],
            ]}
            onChange={setWeightStepKg}
          />
        </Choice>
        <Choice label="Weight step (lb)" hint="The − / + buttons">
          <Segmented
            label="Weight step in lb"
            value={weightStepLb()}
            options={[
              [2.5, '2.5'],
              [5, '5'],
              [10, '10'],
            ]}
            onChange={setWeightStepLb}
          />
        </Choice>
      </Section>
      <p class="group-footer">
        Each exercise remembers the unit you last logged it in; change it from the exercise's menu while logging.
      </p>

      <Show when={spotifyStatus().configured}>
        <Section title="Music">
          <div class="row" style={{ '--sep-inset': '3.75rem' }}>
            <span class="row-icon bg-[#1db954]">
              <Music size={18} />
            </span>
            <div class="min-w-0 flex-1">
              <p>Spotify</p>
              <p class="t-foot text-label-2">
                <Show when={spotifyStatus().connected} fallback="Control playback while logging (needs Premium)">
                  Connected: controls show while logging
                </Show>
              </p>
            </div>
            <Show
              when={spotifyStatus().connected}
              fallback={
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  aria-busy={spotifyBusy()}
                  disabled={!online()}
                  onClick={connect}
                >
                  Connect
                </button>
              }
            >
              <button
                type="button"
                class="btn btn-sm btn-gray"
                aria-busy={spotifyBusy()}
                disabled={!online()}
                onClick={disconnect}
              >
                Disconnect
              </button>
            </Show>
          </div>
        </Section>
      </Show>

      <Section
        title="Data"
        footer={`Import a Terminator backup or CSV, or a CSV from Strong or Hevy. Importing the same file again updates instead of duplicating.${online() ? '' : ' Needs a connection.'}`}
      >
        <DataTransfer />
      </Section>

      <Section title="App">
        <div class="row">
          <span class="flex-1">
            Keep screen on
            <span class="t-foot block text-label-2">
              {wakeLockSupported() ? 'While logging a workout' : "This browser can't keep the screen on"}
            </span>
          </span>
          <Switch
            label="Keep screen on"
            checked={keepAwake()}
            onChange={setKeepAwake}
            disabled={!wakeLockSupported()}
          />
        </div>
        <Choice label="Appearance">
          <Segmented
            label="Appearance"
            value={theme()}
            options={[
              ['system', 'Automatic'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ]}
            onChange={setTheme}
          />
        </Choice>
        <div class="row">
          <div class="min-w-0 flex-1">
            <Show when={!isStandalone()} fallback={<p>Installed on this device</p>}>
              <p>Install the app</p>
              <p class="t-foot text-label-2">
                <Show when={isIOS() && !canPromptInstall()} fallback="Home screen icon, full screen, works offline.">
                  In Safari tap <Share size={13} class="inline align-[-2px]" /> Share → “Add to Home Screen”.
                </Show>
              </p>
            </Show>
          </div>
          <Show when={canPromptInstall()}>
            <button type="button" class="btn btn-sm btn-primary" onClick={promptInstall}>
              <Download size={14} /> Install
            </button>
          </Show>
        </div>
      </Section>

      <div class="group mt-8">
        <button type="button" class="row row-tap justify-center text-bad" onClick={() => setConfirmSignOut(true)}>
          Sign Out
        </button>
      </div>

      <ConfirmSheet
        open={confirmSignOut()}
        onClose={() => setConfirmSignOut(false)}
        onConfirm={signOut}
        title="Sign Out?"
        confirmLabel="Sign Out"
        danger={unsynced() > 0}
      >
        <Show when={unsynced()} fallback="Your data stays safe on the server.">
          {plural(unsynced(), 'change')} {unsynced() === 1 ? "hasn't" : "haven't"} been uploaded yet and will be lost.
          Connect to the internet first if you can.
        </Show>
      </ConfirmSheet>
    </>
  );
}
