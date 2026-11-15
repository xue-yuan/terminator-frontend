import { createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronRight, CloudOff, Download, LogOut, Music, RefreshCw, Scale, Share, ShieldCheck } from 'lucide-solid';
import { currentUser, isAdmin, signOut } from '../lib/auth';
import { bodyWeightList, refreshAll } from '../lib/data';
import { formatDay, formatWeight, timeAgo } from '../lib/format';
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
import { discardEntry, failedEntries, flush, lastSyncedAt, pendingEntries, retryFailed, syncing } from '../lib/sync';
import { connectSpotify, disconnectSpotify, spotifyStatus } from '../lib/spotify';
import { setTheme, theme } from '../lib/theme';
import { toast } from '../lib/toast';
import { wakeLockSupported } from '../lib/wakelock';
import DataTransfer from '../components/DataTransfer';
import { ConfirmSheet, PageHeader, Segmented } from '../components/ui';

/** What a queued change is, for the list of rejected ones. */
function describeEntry(entry) {
  if (entry.type === 'exercise') return `Exercise: ${entry.data?.name ?? ''}`;
  if (entry.type === 'bodyWeight') {
    return entry.op === 'delete' ? 'Delete weigh-in' : `Body weight: ${entry.data?.weight} ${entry.data?.unit}`;
  }
  return entry.op === 'delete' ? 'Delete workout' : entry.data?.name || 'Workout';
}

function Setting(props) {
  return (
    <div class="rule border-b py-4">
      <div class="mb-2 flex items-baseline justify-between gap-3">
        <p class="font-semibold">{props.label}</p>
        <Show when={props.hint}>
          <p class="text-sm text-muted">{props.hint}</p>
        </Show>
      </div>
      {props.children}
    </div>
  );
}

function Group(props) {
  return (
    <section class="mt-8">
      <h2 class="display border-b-2 border-ink pb-1.5 text-xl">{props.title}</h2>
      {props.children}
    </section>
  );
}

export default function Profile() {
  const user = currentUser;
  const [confirmSignOut, setConfirmSignOut] = createSignal(false);
  const unsynced = () => pendingEntries().length + failedEntries().length;

  const syncNow = async () => {
    await flush();
    await refreshAll({ force: true });
  };

  return (
    <>
      <PageHeader eyebrow={user()?.email} title={user()?.full_name || 'You'} />

      <Group title="Sync">
        <div class="rule flex items-center gap-3 border-b py-4">
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 font-semibold">
              <Show
                when={online()}
                fallback={
                  <>
                    <CloudOff size={16} class="text-warn" /> Offline
                  </>
                }
              >
                <span class="h-2 w-2 bg-ok" /> Online
              </Show>
            </p>
            <p class="mt-0.5 text-sm text-muted">
              <Show when={pendingEntries().length} fallback="Everything is synced.">
                {pendingEntries().length} change(s) waiting to upload.
              </Show>
              <Show when={lastSyncedAt()}> Last upload {timeAgo(lastSyncedAt())}.</Show>
            </p>
          </div>
          <button class="btn btn-sm" onClick={syncNow} disabled={!online() || syncing()}>
            <RefreshCw size={14} classList={{ 'animate-spin': syncing() }} /> Sync
          </button>
        </div>
        <Show when={failedEntries().length}>
          <div class="rule border-b py-4">
            <p class="font-semibold text-bad">The server rejected these changes</p>
            <For each={failedEntries()}>
              {(entry) => (
                <div class="mt-2 flex items-start gap-2 border-l-4 border-bad bg-sunk p-2 text-sm">
                  <div class="min-w-0 flex-1">
                    <p class="font-medium">
                      {describeEntry(entry)}
                      <Show when={entry.type === 'workout' && entry.data}> · {formatDay(entry.data.performed_at)}</Show>
                    </p>
                    <p class="text-muted">{entry.error}</p>
                  </div>
                  <button class="btn btn-sm btn-quiet" onClick={() => discardEntry(entry.version)}>
                    Discard
                  </button>
                </div>
              )}
            </For>
            <button class="btn btn-sm btn-block mt-3" onClick={retryFailed}>
              Retry all
            </button>
          </div>
        </Show>
      </Group>

      <Show when={isAdmin()}>
        <Group title="Admin">
          <A href="/admin" class="rule flex items-center gap-3 border-b py-4 active:bg-sunk">
            <ShieldCheck size={20} class="shrink-0 text-muted" />
            <span class="min-w-0 flex-1">
              <span class="block font-semibold">Access</span>
              <span class="block text-sm text-muted">Choose who can use the app</span>
            </span>
            <ChevronRight size={18} class="shrink-0 text-muted" />
          </A>
        </Group>
      </Show>

      <Group title="Body">
        <A href="/body" class="rule flex items-center gap-3 border-b py-4 active:bg-sunk">
          <Scale size={20} class="shrink-0 text-muted" />
          <span class="min-w-0 flex-1">
            <span class="block font-semibold">Body weight</span>
            <span class="block text-sm text-muted">
              <Show when={bodyWeightList()[0]} fallback="Track it over time">
                {(last) => `${formatWeight(last().weight)} ${last().unit} · ${timeAgo(last().measured_at)}`}
              </Show>
            </span>
          </span>
          <ChevronRight size={18} class="shrink-0 text-muted" />
        </A>
      </Group>

      <Group title="Training">
        <Setting label="Rest timer" hint="Starts after each logged set">
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
        </Setting>
        <Setting label="Default unit" hint="New exercises and totals">
          <Segmented
            label="Default unit"
            value={unit()}
            options={[
              ['kg', 'kg'],
              ['lb', 'lb'],
            ]}
            onChange={setUnit}
          />
          <p class="mt-2 text-sm text-muted">
            Each exercise remembers the unit you last logged it in. Switch it per exercise while logging.
          </p>
        </Setting>
        <Setting label="Weight step · kg" hint="For the − / + buttons">
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
        </Setting>
        <Setting label="Weight step · lb" hint="For the − / + buttons">
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
        </Setting>
      </Group>

      <Show when={spotifyStatus().configured}>
        <Group title="Music">
          <div class="rule flex items-center gap-3 border-b py-4">
            <Music size={20} class="shrink-0 text-muted" />
            <div class="min-w-0 flex-1">
              <p class="font-semibold">Spotify</p>
              <p class="text-sm text-muted">
                <Show when={spotifyStatus().connected} fallback="Control playback while logging (needs Premium)">
                  Connected: controls show while logging
                </Show>
              </p>
            </div>
            <Show
              when={spotifyStatus().connected}
              fallback={
                <button
                  class="btn btn-sm btn-signal"
                  disabled={!online()}
                  onClick={() => connectSpotify().catch((err) => toast(err.message, 'error'))}
                >
                  Connect
                </button>
              }
            >
              <button
                class="btn btn-sm"
                disabled={!online()}
                onClick={() => disconnectSpotify().catch((err) => toast(err.message, 'error'))}
              >
                Disconnect
              </button>
            </Show>
          </div>
        </Group>
      </Show>

      <Group title="Data">
        <DataTransfer />
      </Group>

      <Group title="App">
        <Setting label="Keep screen on" hint="While logging a workout">
          <Segmented
            label="Keep screen on"
            value={keepAwake()}
            options={[
              [true, 'On'],
              [false, 'Off'],
            ]}
            onChange={setKeepAwake}
          />
          <Show when={!wakeLockSupported()}>
            <p class="mt-2 text-sm text-muted">This browser can't keep the screen on.</p>
          </Show>
        </Setting>
        <Setting label="Appearance">
          <Segmented
            label="Appearance"
            value={theme()}
            options={[
              ['system', 'Auto'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ]}
            onChange={setTheme}
          />
        </Setting>
        <div class="rule flex items-center gap-3 border-b py-4">
          <div class="min-w-0 flex-1">
            <Show when={!isStandalone()} fallback={<p class="font-semibold">Installed on this device</p>}>
              <p class="font-semibold">Install the app</p>
              <p class="mt-0.5 text-sm text-muted">
                <Show when={isIOS() && !canPromptInstall()} fallback="Home screen icon, full screen, works offline.">
                  In Safari tap <Share size={13} class="inline align-[-2px]" /> Share → “Add to Home Screen”.
                </Show>
              </p>
            </Show>
          </div>
          <Show when={canPromptInstall()}>
            <button class="btn btn-sm btn-signal" onClick={promptInstall}>
              <Download size={14} /> Install
            </button>
          </Show>
        </div>
      </Group>

      <button class="btn btn-danger btn-block mt-8" onClick={() => setConfirmSignOut(true)}>
        <LogOut size={18} /> Sign out
      </button>

      <ConfirmSheet
        open={confirmSignOut()}
        onClose={() => setConfirmSignOut(false)}
        onConfirm={signOut}
        title="Sign out?"
        confirmLabel="Sign out"
        danger={unsynced() > 0}
      >
        <Show when={unsynced()} fallback="Your data stays safe on the server.">
          {unsynced()} change(s) haven't been uploaded yet and will be lost. Sync first if you can.
        </Show>
      </ConfirmSheet>
    </>
  );
}
