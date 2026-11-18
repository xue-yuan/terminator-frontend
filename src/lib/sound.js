// The chime that says rest is over. iPhones can't vibrate from a web page, so a
// sound is the only nudge there (Android vibrates as well).
//
// Web Audio may only start from a tap, so primeSound() is called from the tap
// that logs a set (and starts the rest); chime() then plays when time is up.

let ctx = null;

/** Ready the audio output. Call from inside a tap handler. */
export function primeSound() {
  try {
    if (!ctx) {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return;
      // A short sound over whatever music is playing (which may duck for it),
      // not a takeover that would pause Spotify. Safari 16.4+. On iOS this kind
      // of sound obeys the silent switch, like system alerts; 'playback' would
      // ring through it but stop the music, so silent mode stays silent.
      if (navigator.audioSession) navigator.audioSession.type = 'transient';
      ctx = new AudioContext();
    }
    // 'suspended', or iOS's 'interrupted' after the app was in the background.
    if (ctx.state !== 'running') ctx.resume();
    // iOS only unlocks output once something has played within the tap: one silent sample.
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, 22050);
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    /* no sound then; the bar still turns orange */
  }
}

/** Soft sine notes: [frequency, start (s), length (s), peak gain]. Returns false if audio isn't ready. */
function play(notes) {
  if (!ctx || ctx.state !== 'running') return false;
  const start = ctx.currentTime + 0.02;
  for (const [frequency, at, length, peak] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(peak, start + at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + at);
    osc.stop(start + at + length + 0.05);
  }
  return true;
}

/** Two soft rising notes. Returns false if audio isn't ready. */
export const chime = () =>
  play([
    [880, 0, 0.45, 0.4],
    [1318.5, 0.16, 0.45, 0.4],
  ]);

/** A workout finished: a quick rising C major arpeggio that rings out on top. */
export const fanfare = () =>
  play([
    [523.25, 0, 0.3, 0.22],
    [659.25, 0.09, 0.3, 0.22],
    [783.99, 0.18, 0.3, 0.24],
    [1046.5, 0.29, 0.9, 0.3],
    [1318.5, 0.29, 0.9, 0.12],
  ]);
