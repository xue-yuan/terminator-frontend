import { createResource, createSignal, For, Show } from 'solid-js';
import { CloudOff, ShieldCheck, Trash2, TriangleAlert, UserCheck, UserPlus } from 'lucide-solid';
import { isAdmin } from '../lib/auth';
import { allowEmail, readAccess, removeEmail } from '../lib/data';
import { formatDay } from '../lib/format';
import { online } from '../lib/network';
import { toast } from '../lib/toast';
import { SwipeRow } from '../components/SwipeRow';
import { ConfirmSheet, EmptyState, PageHeader, Section, Spinner } from '../components/ui';

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
      <PageHeader
        back="/profile"
        backLabel="You"
        title="Access"
        actions={
          <Show when={isAdmin() && online() && access()}>
            <button type="button" class="btn btn-plain h-11 px-2" aria-busy={access.loading} onClick={refetch}>
              Refresh
            </button>
          </Show>
        }
      />
      <Show
        when={isAdmin()}
        fallback={
          <div class="card mt-3">
            <EmptyState icon={ShieldCheck} title="Admins only" body="This page is for the app's admins." />
          </div>
        }
      >
        <Show
          when={online()}
          fallback={
            <div class="card mt-3">
              <EmptyState icon={CloudOff} title="You're offline" body="Managing access needs a connection." />
            </div>
          }
        >
          <Show when={access()} fallback={<Spinner class="mx-auto mt-10 block text-label-2" />}>
            <Show when={!access().restricted}>
              <p class="t-sub mt-3 flex items-start gap-2 rounded-xl bg-card px-4 py-3">
                <TriangleAlert size={18} class="mt-0.5 shrink-0 text-warn" />
                Anyone with a Google account can sign in: no ADMIN_EMAILS are set on the server.
              </p>
            </Show>

            <form onSubmit={add}>
              <Section
                title="Let someone in"
                footer="They sign in with Google using this address. Removing someone signs them out."
              >
                <div class="row !py-1.5 !pr-1.5">
                  <input
                    type="email"
                    class="field-inline"
                    placeholder="name@gmail.com"
                    aria-label="Email to let in"
                    autocomplete="off"
                    autocapitalize="none"
                    value={email()}
                    readOnly={busy()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                  />
                  <button
                    type="submit"
                    class="btn btn-sm btn-primary"
                    aria-busy={busy()}
                    disabled={busy() || !email().trim()}
                  >
                    <UserPlus size={16} /> Add
                  </button>
                </div>
              </Section>
            </form>

            <Section title="Admins" footer="Set on the server (ADMIN_EMAILS).">
              <For each={access().admins}>
                {(admin) => (
                  <div class="row" style={{ '--sep-inset': '3.25rem' }}>
                    <ShieldCheck size={20} class="w-6 shrink-0 text-accent" />
                    <span class="min-w-0 flex-1 truncate">{admin}</span>
                  </div>
                )}
              </For>
            </Section>

            <Section
              title="Can use the app"
              footer={access().allowed.length ? 'Swipe someone left to remove them.' : null}
            >
              <For each={access().allowed} fallback={<p class="row text-label-2">Nobody else yet.</p>}>
                {(entry) => (
                  <SwipeRow
                    fullSwipe={false}
                    actions={[{ label: 'Remove', icon: Trash2, tone: 'bad', onAction: () => setRemoving(entry.email) }]}
                  >
                    <div class="row" style={{ '--sep-inset': '3.25rem' }}>
                      <UserCheck
                        size={20}
                        class="w-6 shrink-0"
                        classList={{ 'text-ok': entry.signed_up, 'text-label-3': !entry.signed_up }}
                      />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate">{entry.email}</span>
                        <span class="t-foot block text-label-2">
                          {entry.signed_up ? 'Signed in' : 'Not signed in yet'} · added {formatDay(entry.added_at)}
                        </span>
                      </span>
                    </div>
                  </SwipeRow>
                )}
              </For>
            </Section>
          </Show>
        </Show>
      </Show>

      <ConfirmSheet
        open={!!removing()}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove(removing())}
        title="Remove Access?"
        confirmLabel="Remove"
        danger
      >
        {removing()} won't be able to use the app, and is signed out on their next request. Their data is kept.
      </ConfirmSheet>
    </>
  );
}
