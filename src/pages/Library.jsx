import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { ChevronRight, CloudOff, Plus, Search, ShieldCheck, Trash2, TriangleAlert } from 'lucide-solid';
import { isAdmin } from '../lib/auth';
import { addToLibrary, catalog, refreshAll, removeFromLibrary, saveLibraryEntry } from '../lib/data';
import { matchesQuery, MUSCLE_GROUPS } from '../lib/exercises';
import { plural } from '../lib/format';
import { online } from '../lib/network';
import { toast } from '../lib/toast';
import MusclePicker from '../components/MusclePicker';
import { SwipeRow } from '../components/SwipeRow';
import { ConfirmSheet, EmptyState, PageHeader, Section, Sheet, Spinner } from '../components/ui';

/**
 * The built-in exercise library (admins only): the suggestions everyone gets
 * when naming an exercise, with a Chinese name, other names and a muscle group.
 */
export default function Library() {
  const [query, setQuery] = createSignal('');
  const [muscle, setMuscle] = createSignal(null);
  const [editing, setEditing] = createSignal(null); // {} for a new one, or the entry
  const [removing, setRemoving] = createSignal(null);
  refreshAll(); // pick up another admin's changes (a cheap check)

  const entries = () => catalog.data() ?? [];
  const sections = createMemo(() => {
    const matches = entries().filter((e) => matchesQuery(e, query()) && (!muscle() || e.muscle_group === muscle()));
    return MUSCLE_GROUPS.map(([key, label, zh]) => ({
      key,
      title: `${label} · ${zh}`,
      entries: matches.filter((e) => e.muscle_group === key),
    })).filter((s) => s.entries.length);
  });

  async function remove() {
    const entry = removing();
    try {
      await removeFromLibrary(entry.id);
      toast(`${entry.name} removed from the library`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const chip = (selected) =>
    `h-8 shrink-0 rounded-full px-3.5 text-[14px] font-medium transition-colors ${selected ? 'bg-label text-bg' : 'bg-card text-label'}`;

  return (
    <>
      <PageHeader
        back="/profile"
        backLabel="You"
        eyebrow={catalog.data() ? plural(entries().length, 'exercise') : null}
        title="Exercise Library"
        actions={
          <Show when={isAdmin() && online() && catalog.data()}>
            <button
              type="button"
              class="btn btn-icon text-accent"
              aria-label="Add exercise"
              onClick={() => setEditing({})}
            >
              <Plus size={26} strokeWidth={2.25} />
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
              <EmptyState icon={CloudOff} title="You're offline" body="Editing the library needs a connection." />
            </div>
          }
        >
          <Show
            when={catalog.data()}
            fallback={
              <Show when={catalog.error()} fallback={<Spinner class="mx-auto mt-10 block text-label-2" />}>
                <div class="card mt-3">
                  <EmptyState icon={TriangleAlert} title="Couldn't load the library" body={catalog.error().message}>
                    <button type="button" class="btn" aria-busy={catalog.loading()} onClick={() => catalog.refresh()}>
                      Try Again
                    </button>
                  </EmptyState>
                </div>
              </Show>
            }
          >
            <label class="relative mt-3 block">
              <Search size={18} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-label-2" />
              <input
                type="search"
                class="field h-10 bg-fill pl-9"
                placeholder="Search in English or 中文"
                aria-label="Search the library"
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />
            </label>

            <div
              class="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4"
              role="radiogroup"
              aria-label="Muscle group"
            >
              <button
                type="button"
                role="radio"
                aria-checked={!muscle()}
                class={chip(!muscle())}
                onClick={() => setMuscle(null)}
              >
                All
              </button>
              <For each={MUSCLE_GROUPS}>
                {([key, label]) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={muscle() === key}
                    class={chip(muscle() === key)}
                    onClick={() => setMuscle(muscle() === key ? null : key)}
                  >
                    {label}
                  </button>
                )}
              </For>
            </div>

            <For
              each={sections()}
              fallback={
                <div class="card mt-4">
                  <EmptyState
                    icon={Search}
                    title={entries().length ? 'Nothing matches' : 'The library is empty'}
                    body={entries().length ? null : 'Add an exercise with the + button.'}
                  />
                </div>
              }
            >
              {(section) => (
                <Section title={section.title}>
                  <For each={section.entries}>
                    {(entry) => (
                      <SwipeRow
                        fullSwipe={false}
                        actions={[{ label: 'Delete', icon: Trash2, tone: 'bad', onAction: () => setRemoving(entry) }]}
                      >
                        <button type="button" class="row row-tap w-full text-left" onClick={() => setEditing(entry)}>
                          <span class="min-w-0 flex-1">
                            <span class="block truncate">{entry.name}</span>
                            <Show when={entry.zh || entry.aka}>
                              <span class="t-foot block truncate text-label-2">
                                {entry.zh}
                                <Show when={entry.aka}>
                                  <span class="text-label-3">
                                    {entry.zh ? ' · ' : ''}
                                    {entry.aka}
                                  </span>
                                </Show>
                              </span>
                            </Show>
                          </span>
                          <ChevronRight size={17} class="-mr-1 shrink-0 text-label-3" />
                        </button>
                      </SwipeRow>
                    )}
                  </For>
                </Section>
              )}
            </For>
            <p class="group-footer">
              Everyone gets these as suggestions when naming an exercise. Changing or deleting one never renames or
              removes anyone's own exercises.
            </p>
          </Show>
        </Show>
      </Show>

      <EntrySheet
        entry={editing()}
        onClose={() => setEditing(null)}
        onDelete={(entry) => {
          setEditing(null);
          setRemoving(entry);
        }}
      />
      <ConfirmSheet
        open={!!removing()}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title={`Delete ${removing()?.name ?? 'exercise'}?`}
        confirmLabel="Delete from Library"
        danger
      >
        It won't be suggested any more. Anyone who already logs it keeps their exercise and its history.
      </ConfirmSheet>
    </>
  );
}

const BLANK = { name: '', zh: '', aka: '', muscle_group: null };

/** Add or edit one library entry. `entry`: null (closed), {} (new) or the entry. */
function EntrySheet(props) {
  const [form, setForm] = createSignal(BLANK);
  // What the sheet shows: kept while it slides away after `entry` went null.
  const [shown, setShown] = createSignal({});
  const [busy, setBusy] = createSignal(false);
  const isNew = () => !shown().id;
  createEffect(
    on(
      () => props.entry,
      (entry) => {
        if (!entry) return;
        setShown(entry);
        setForm({
          name: entry.name ?? '',
          zh: entry.zh ?? '',
          aka: entry.aka ?? '',
          muscle_group: entry.muscle_group ?? null,
        });
      },
    ),
  );
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    const f = form();
    if (!f.name.trim()) return toast('Give it an English name', 'error');
    if (!f.muscle_group) return toast('Choose a muscle group', 'error');
    const body = {
      name: f.name.trim(),
      zh: f.zh.trim() || null,
      aka: f.aka.trim() || null,
      muscle_group: f.muscle_group,
    };
    setBusy(true);
    try {
      if (isNew()) await addToLibrary(body);
      else await saveLibraryEntry(shown().id, body);
      toast(isNew() ? `${body.name} added to the library` : 'Saved', 'success');
      props.onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const field = (key, label, placeholder, attrs = {}) => (
    <label class="row">
      <span class="w-28 shrink-0">{label}</span>
      <input
        class="field-inline"
        placeholder={placeholder}
        autocomplete="off"
        value={form()[key]}
        readOnly={busy()}
        onInput={(e) => set(key, e.currentTarget.value)}
        {...attrs}
      />
    </label>
  );

  return (
    <Sheet
      open={!!props.entry}
      onClose={() => props.onClose()}
      title={isNew() ? 'New Exercise' : 'Edit Exercise'}
      locked={busy()}
    >
      <form onSubmit={submit}>
        <div class="group">
          {field('name', 'English', 'Bench Press', { autocapitalize: 'words' })}
          {field('zh', '中文', '槓鈴臥推')}
          {field('aka', 'Also called', '平板臥推 臥推', { autocapitalize: 'none' })}
        </div>
        <p class="group-footer">
          Other names people search for, separated by spaces. They find this exercise but aren't shown.
        </p>

        <p class="group-header">Muscle group</p>
        <MusclePicker value={form().muscle_group} onPick={(key) => set('muscle_group', key)} withZh disabled={busy()} />

        <button type="submit" class="btn btn-lg btn-primary btn-block mt-6" aria-busy={busy()} disabled={busy()}>
          {isNew() ? 'Add to Library' : 'Save'}
        </button>
        <Show when={!isNew()}>
          <button
            type="button"
            class="btn btn-lg btn-block mt-2 bg-card text-bad"
            disabled={busy()}
            onClick={() => props.onDelete(shown())}
          >
            Delete from Library
          </button>
        </Show>
      </form>
    </Sheet>
  );
}
