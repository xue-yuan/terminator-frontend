import { createEffect, createSignal, on, onCleanup, Show } from 'solid-js';
import { Download, Share } from 'lucide-solid';
import { levelFor } from '../lib/achievements';
import { currentUser } from '../lib/auth';
import { progression } from '../lib/data';
import { downloadFile } from '../lib/download';
import { setShareStyle, shareStyle } from '../lib/prefs';
import { toast } from '../lib/toast';
import { Segmented, Sheet, Spinner } from './ui';

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
 * make(style): Promise<Blob>; filename: what it's saved as.
 * styles: optional [[style, label]] to pick from (the last one picked is remembered).
 */
export default function ShareSheet(props) {
  // Pictures drawn since the sheet opened, by style: switching back is instant.
  const [pictures, setPictures] = createSignal({});
  const [failed, setFailed] = createSignal(false);
  const style = () => {
    const options = props.styles ?? [];
    return options.some(([value]) => value === shareStyle()) ? shareStyle() : (options[0]?.[0] ?? 'default');
  };
  const picture = () => pictures()[style()] ?? null;
  const forget = () => {
    for (const p of Object.values(pictures())) URL.revokeObjectURL(p.url);
    setPictures({});
  };

  let opening = 0; // which opening of the sheet a drawing belongs to
  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return;
        opening++;
        forget(); // the workout may have changed since
      },
    ),
  );
  createEffect(
    on(
      () => props.open && style(),
      async (wanted) => {
        if (wanted === false || pictures()[wanted]) return;
        const run = opening;
        setFailed(false);
        try {
          const blob = await props.make(wanted);
          if (run !== opening) return;
          setPictures((p) => ({ ...p, [wanted]: { blob, url: URL.createObjectURL(blob) } }));
        } catch (err) {
          if (run !== opening) return;
          setFailed(true);
          toast(err.message || "Couldn't draw the picture", 'error');
        }
      },
    ),
  );
  onCleanup(forget);

  const blob = () => picture()?.blob ?? null;
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
      <Show when={props.styles}>
        {(styles) => (
          <Segmented
            class="mx-auto mb-3 max-w-sm"
            label="Picture"
            value={style()}
            options={styles()}
            onChange={setShareStyle}
          />
        )}
      </Show>
      <div class="mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-lg">
        <Show
          when={picture()}
          keyed
          fallback={
            <div class="grid h-full place-items-center text-label-2">
              <Show when={!failed()} fallback={<p class="t-sub">Couldn't draw the picture.</p>}>
                <Spinner />
              </Show>
            </div>
          }
        >
          {(p) => <img src={p.url} alt={props.alt ?? 'Picture to share'} class="anim-pop block h-full w-full" />}
        </Show>
      </div>
      <div class="mt-5 grid gap-2" classList={{ 'grid-cols-1': canShare() }}>
        <Show when={canShare()}>
          <button type="button" class="btn btn-lg btn-primary" disabled={!blob()} onClick={share}>
            <Share size={19} /> Share
          </button>
        </Show>
        {/* <button
          type="button"
          class="btn btn-lg"
          classList={{ 'btn-gray': canShare(), 'btn-primary': !canShare() }}
          disabled={!blob()}
          onClick={save}
        >
          <Download size={19} /> Save Image
        </button> */}
      </div>
    </Sheet>
  );
}
