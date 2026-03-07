// Guitar open-string frequencies — standard tuning E-A-D-G-B-E
const OPEN_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AudioCtxClass: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;

// ── Single shared AudioContext (never closed) ─────────────────────────────
// Creating a fresh context on every play-press is unreliable on iOS because
// the context starts in "suspended" state and the resume() promise resolves
// outside the user-gesture window, so scheduled audio plays too late or not at all.
// One persistent context that we resume() once is far more reliable.
let _ctx: AudioContext | null = null;

export function getSharedContext(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new AudioCtxClass();
  }
  return _ctx;
}

// ── iOS silent-mode + autoplay unlock ────────────────────────────────────
// Must be called from a native user-gesture handler (touchstart / click).
// Safe to call many times — work is skipped after first success.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let _silentUnlocked = false;

export function unlockAudio(): void {
  // 1. Resume the shared Web Audio context within the user gesture.
  const ctx = getSharedContext();
  ctx.resume().catch(() => {});

  // 2. Play a 1-sample silent Web Audio buffer — keeps the context "warm".
  try {
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch { /* ignore */ }

  // 3. Play through HTMLAudioElement (with playsinline, appended to DOM).
  //    This is the only reliable way to switch the iOS AVAudioSession from
  //    "ambient" (respects mute switch) to "playback" (ignores mute switch).
  if (_silentUnlocked) return;
  _silentUnlocked = true;
  try {
    const audio = document.createElement('audio');
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    audio.volume = 0.001;
    audio.src = SILENT_WAV;
    document.body.appendChild(audio);
    const p = audio.play();
    if (p) {
      p.catch(() => { _silentUnlocked = false; })
       .finally(() => { try { audio.remove(); } catch { /* */ } });
    } else {
      try { audio.remove(); } catch { /* */ }
    }
  } catch {
    _silentUnlocked = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────

function synthesizeNote(ctx: AudioContext, freq: number, startTime: number): void {
  const osc    = ctx.createOscillator();
  const gain   = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'sawtooth';
  osc.frequency.value = freq;

  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 6, 5000);
  filter.Q.value = 0.7;

  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(0.2, startTime + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.5);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + 1.6);
}

export interface FretPos { string: number; fret: number; }

/** Arpeggiate a chord low → high string. Call only from a user gesture. */
export function playChord(fretPositions: FretPos[]): void {
  if (fretPositions.length === 0) return;
  unlockAudio();
  const ctx = getSharedContext();
  const sorted = [...fretPositions].sort((a, b) => a.string - b.string);
  sorted.forEach((pos, i) => {
    const freq = OPEN_FREQS[pos.string] * Math.pow(2, pos.fret / 12);
    synthesizeNote(ctx, freq, ctx.currentTime + i * 0.065);
  });
}
