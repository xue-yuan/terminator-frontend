import { createEffect, createSignal, on, onCleanup, Show } from 'solid-js';
import { Download, Share } from 'lucide-solid';
import { levelFor } from '../lib/achievements';
import { currentUser } from '../lib/auth';
import { progression } from '../lib/data';
import { downloadFile } from '../lib/download';
import { toast } from '../lib/toast';
import { Sheet, Spinner } from './ui';

/** Who's sharing, for the line under a card's title: { name, title, level }. */
export function sharer() {
  const p = progression.data();
  return {
    name: currentUser()?.full_name ?? null,
    title: p?.title ?? null,
    level: p ? levelFor(p.xp, p.rules.level_step) : null,
  };
}

/**
 * A picture to share (lib/sharecard.js): drawn when the sheet opens, shown,
 * then handed to the share sheet (Instagram, Messages, Save Image...) or saved.
 * The picture is ready before Share is tapped: iOS only opens the share sheet
 * straight from a tap, not after waiting for something.
 * make(): Promise<Blob>; filename: what it's saved as.
 */
export default function ShareSheet(props) {
  const [blob, setBlob] = createSignal(null);
  const [url, setUrl] = createSignal(null);
  const [failed, setFailed] = createSignal(false);
  createEffect(
    on(
      () => props.open,
      async (open) => {
        if (!open) return;
        setBlob(null);
        setFailed(false);
        try {
          const made = await props.make();
          setBlob(made);
          setUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return URL.createObjectURL(made);
          });
        } catch (err) {
          setFailed(true);
          toast(err.message || "Couldn't draw the picture", 'error');
        }
      },
    ),
  );
  onCleanup(() => url() && URL.revokeObjectURL(url()));

  const file = () => blob() && new File([blob()], props.filename, { type: 'image/png' });
  const canShare = () => !!file() && !!navigator.canShare?.({ files: [file()] });

  async function share() {
    try {
      await navigator.share({ files: [file()] });
    } catch (err) {
      if (err.name !== 'AbortError') toast("Couldn't open the share sheet", 'error');
    }
  }
  const save = () => downloadFile(props.filename, blob(), 'image/png');

  return (
    <Sheet open={props.open} onClose={() => props.onClose()} title={props.title ?? 'Share'}>
      <div class="mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-lg">
        <Show
          when={blob() && url()}
          fallback={
            <div class="grid h-full place-items-center text-label-2">
              <Show when={!failed()} fallback={<p class="t-sub">Couldn't draw the picture.</p>}>
                <Spinner />
              </Show>
            </div>
          }
        >
          <img src={url()} alt={props.alt ?? 'Picture to share'} class="anim-pop block h-full w-full" />
        </Show>
      </div>
      <div class="mt-5 grid gap-2" classList={{ 'grid-cols-2': canShare() }}>
        <Show when={canShare()}>
          <button type="button" class="btn btn-lg btn-primary" disabled={!blob()} onClick={share}>
            <Share size={19} /> Share
          </button>
        </Show>
        <button
          type="button"
          class="btn btn-lg"
          classList={{ 'btn-gray': canShare(), 'btn-primary': !canShare() }}
          disabled={!blob()}
          onClick={save}
        >
          <Download size={19} /> Save Image
        </button>
      </div>
    </Sheet>
  );
}
