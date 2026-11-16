import { createMemo, createSignal, Show } from 'solid-js';
import { FileSpreadsheet, FileUp, HardDriveDownload } from 'lucide-solid';
import { FORMAT_NAMES, readImportFile, summarize, workoutsToCsv } from '../lib/backup';
import { exportBackup, importBackup } from '../lib/data';
import { downloadFile, fileDate } from '../lib/download';
import { formatDay, plural } from '../lib/format';
import { online } from '../lib/network';
import { unit as defaultUnit } from '../lib/prefs';
import { toast } from '../lib/toast';
import { UNITS } from '../lib/units';
import { ChipToggle, Sheet, Spinner } from './ui';

/** Back up, export as CSV, and import (our backups and CSV, Strong, Hevy). Rows for a grouped section. */
export default function DataTransfer() {
  const [busy, setBusy] = createSignal(null); // 'json' | 'csv'
  const [file, setFile] = createSignal(null); // { name, text }
  let input;

  async function exportAs(kind) {
    setBusy(kind);
    try {
      const backup = await exportBackup();
      if (kind === 'json') {
        downloadFile(`terminator-${fileDate()}.json`, JSON.stringify(backup, null, 2), 'application/json');
      } else {
        downloadFile(`terminator-workouts-${fileDate()}.csv`, workoutsToCsv(backup.workouts), 'text/csv');
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function pick(event) {
    const chosen = event.currentTarget.files?.[0];
    event.currentTarget.value = ''; // picking the same file again still fires
    if (chosen) setFile({ name: chosen.name, text: await chosen.text() });
  }

  const row = 'row row-tap text-accent disabled:opacity-40';
  return (
    <>
      <button type="button" class={row} disabled={!online() || !!busy()} onClick={() => exportAs('json')}>
        <Show when={busy() === 'json'} fallback={<HardDriveDownload size={20} class="w-6" />}>
          <span class="w-6">
            <Spinner class="h-4 w-4" />
          </span>
        </Show>
        Back Up Everything (JSON)
      </button>
      <button
        type="button"
        class={row}
        style={{ '--sep-inset': '3.25rem' }}
        disabled={!online() || !!busy()}
        onClick={() => exportAs('csv')}
      >
        <Show when={busy() === 'csv'} fallback={<FileSpreadsheet size={20} class="w-6" />}>
          <span class="w-6">
            <Spinner class="h-4 w-4" />
          </span>
        </Show>
        Export Workouts (CSV)
      </button>
      <button
        type="button"
        class={row}
        style={{ '--sep-inset': '3.25rem' }}
        disabled={!online()}
        onClick={() => input.click()}
      >
        <FileUp size={20} class="w-6" /> Import…
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        class="hidden"
        aria-label="File to import"
        onChange={pick}
      />
      <ImportSheet file={file()} onClose={() => setFile(null)} />
    </>
  );
}

function ImportSheet(props) {
  const [unit, setUnit] = createSignal(defaultUnit()); // Strong's files don't say
  const [progress, setProgress] = createSignal(null); // { done, total } while importing
  const parsed = createMemo(() => {
    if (!props.file) return null;
    try {
      return readImportFile(props.file.name, props.file.text, { unit: unit() });
    } catch (err) {
      return { error: err.message };
    }
  });
  const info = () => (parsed()?.backup ? summarize(parsed().backup) : null);
  const source = () => (parsed()?.format === 'backup' ? 'Terminator backup' : `${FORMAT_NAMES[parsed()?.format]} CSV`);

  async function run() {
    setProgress({ done: 0, total: info().workouts });
    try {
      const r = await importBackup(parsed().backup, (done, total) => setProgress({ done, total }));
      const parts = [plural(r.workouts_created, 'new workout')];
      if (r.workouts_updated) parts.push(`${r.workouts_updated} updated`);
      if (r.plans_created) parts.push(plural(r.plans_created, 'plan'));
      if (r.body_weights) parts.push(plural(r.body_weights, 'weigh-in'));
      toast(`Imported ${parts.join(', ')}`, 'success');
      props.onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setProgress(null);
    }
  }

  return (
    <Sheet open={!!props.file} onClose={() => !progress() && props.onClose()} title="Import">
      <Show when={parsed()}>
        <Show
          when={!parsed().error}
          fallback={<p class="t-sub rounded-xl bg-card px-4 py-3 text-bad">{parsed().error}</p>}
        >
          <p class="t-foot font-semibold text-label-2 uppercase">{source()}</p>
          <p class="t-title2 mt-0.5">
            {plural(info().workouts, 'workout')}
            <span class="ml-2 text-[17px] font-normal text-label-2">· {plural(info().sets, 'set')}</span>
          </p>
          <Show when={info().from}>
            <p class="t-sub mt-1 text-label-2">
              {formatDay(info().from)} – {formatDay(info().to)} · {plural(info().exercises, 'exercise')}
            </p>
          </Show>
          <Show when={info().plans || info().bodyWeights}>
            <p class="t-sub mt-1 text-label-2">
              {plural(info().plans, 'plan')} · {plural(info().bodyWeights, 'weigh-in')}
            </p>
          </Show>
          <Show when={parsed().skipped}>
            <p class="t-foot mt-2 text-label-2">
              {plural(parsed().skipped, 'row')} without reps (e.g. cardio) left out.
            </p>
          </Show>
          <Show when={parsed().format === 'strong'}>
            <div class="row mt-4 rounded-xl">
              <p class="flex-1">Weights in this file are in</p>
              <ChipToggle label="Unit" value={unit()} options={UNITS.map((u) => [u, u])} onChange={setUnit} />
            </div>
          </Show>
          <button
            type="button"
            class="btn btn-lg btn-primary btn-block mt-6"
            disabled={!!progress() || !online()}
            onClick={run}
          >
            <Show when={progress()} fallback="Import">
              <Spinner class="h-4 w-4" /> {progress().done} / {progress().total}
            </Show>
          </button>
        </Show>
      </Show>
    </Sheet>
  );
}
