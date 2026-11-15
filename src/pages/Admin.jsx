import { createResource, createSignal, For, Show } from 'solid-js';
import { ShieldCheck, Trash2, UserCheck, UserPlus } from 'lucide-solid';
import { isAdmin } from '../lib/auth';
import { allowEmail, readAccess, removeEmail } from '../lib/data';
import { formatDay } from '../lib/format';
import { online } from '../lib/network';
import { toast } from '../lib/toast';
import { ConfirmSheet, EmptyState, PageHeader, Spinner } from '../components/ui';

/** Admins (ADMIN_EMAILS on the server) choose who else may use the app. */
export default function Admin() {
  const [access, { mutate, refetch }] = createResource(() => isAdmin() && online(), readAccess);
  const [email, setEmail] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [removing, setRemoving] = createSignal(null);

  async function add(event) {
    event.preventDefault();
    const value = email().trim();
    if (!value) return;
    setBusy(true);
    try {
      mutate(await allowEmail(value));
      setEmail('');
      toast(`${value} can use the app now`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(value) {
    try {
      mutate(await removeEmail(value));
      toast(`${value} removed`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <PageHeader back="/profile" eyebrow="Admin" title="Access" />
      <Show when={isAdmin()} fallback={<EmptyState title="Admins only" body="This page is for the app's admins." />}>
        <Show
          when={online()}
          fallback={<EmptyState title="You're offline" body="Managing access needs a connection." />}
        >
          <Show when={access()} fallback={<Spinner class="mx-auto block" />}>
            <Show when={!access().restricted}>
              <p class="mb-4 border-l-4 border-warn bg-sunk px-3 py-2 text-sm">
                Anyone with a Google account can sign in: no ADMIN_EMAILS are set on the server.
              </p>
            </Show>

            <form onSubmit={add} class="flex gap-2">
              <input
                type="email"
                class="field min-w-0 flex-1"
                placeholder="name@gmail.com"
                aria-label="Email to let in"
                autocomplete="off"
                autocapitalize="none"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
              />
              <button type="submit" class="btn btn-signal" disabled={busy() || !email().trim()}>
                <UserPlus size={18} /> Add
              </button>
            </form>
            <p class="mt-2 text-sm text-muted">
              They sign in with Google using this address. Removing someone signs them out.
            </p>

            <h2 class="display mt-8 border-b-2 border-ink pb-1.5 text-xl">Admins</h2>
            <ul>
              <For each={access().admins}>
                {(admin) => (
                  <li class="rule flex items-center gap-3 border-b py-3">
                    <ShieldCheck size={18} class="shrink-0 text-signal" />
                    <span class="min-w-0 flex-1 truncate font-medium">{admin}</span>
                    <span class="text-xs text-muted">set on the server</span>
                  </li>
                )}
              </For>
            </ul>

            <h2 class="display mt-8 border-b-2 border-ink pb-1.5 text-xl">Can use the app</h2>
            <ul>
              <For each={access().allowed} fallback={<li class="py-4 text-muted">Nobody else yet.</li>}>
                {(entry) => (
                  <li class="rule flex items-center gap-3 border-b py-3">
                    <UserCheck
                      size={18}
                      class="shrink-0"
                      classList={{ 'text-ok': entry.signed_up, 'text-muted': !entry.signed_up }}
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-medium">{entry.email}</span>
                      <span class="block text-xs text-muted">
                        {entry.signed_up ? 'Signed in' : 'Not signed in yet'} · added {formatDay(entry.added_at)}
                      </span>
                    </span>
                    <button
                      class="btn btn-icon -mr-3 text-muted"
                      aria-label={`Remove ${entry.email}`}
                      onClick={() => setRemoving(entry.email)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </li>
                )}
              </For>
            </ul>
            <button class="btn btn-quiet btn-block mt-4 text-muted" onClick={refetch}>
              Refresh
            </button>
          </Show>
        </Show>
      </Show>

      <ConfirmSheet
        open={!!removing()}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove(removing())}
        title="Remove access?"
        confirmLabel="Remove"
        danger
      >
        {removing()} won't be able to use the app, and is signed out on their next request. Their data is kept.
      </ConfirmSheet>
    </>
  );
}
