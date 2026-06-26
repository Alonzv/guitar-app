// Guitar open-string frequencies — standard tuning E-A-D-G-B-E
const STANDARD_OPEN_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AudioCtxClass: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;

// ── Audio graph ───────────────────────────────────────────────────────────
let _ctx: AudioContext | null = null;
let _masterGain: GainNode | null = null;
let _unlocking: Promise<void> | null = null;
let _silentPlayed = false;

// iOS 16.4+ Web Audio Session API.
// 'playback'        = ignore mute switch; playback-only (default for this app).
// 'play-and-record' = ignore mute switch; mic + speaker simultaneously (Tuner).
// Never downgrade from a more permissive mode already set by Tuner.
function setPlaybackSession(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = (navigator as any).audioSession;
    if (!session) return;
    if (session.type !== 'playback' && session.type !== 'play-and-record') {
      session.type = 'playback';
    }
  } catch { /* not supported on non-Safari or older iOS */ }
}

// Older iOS (< 16.4) fix: play a silent <audio> element synchronously within
// the user gesture — this switches iOS audio session from "ambient" (muted by
// silent switch) to "playback" (ignores silent switch). Only needs to run once.
function playSilentElement(): void {
  if (_silentPlayed) return;
  _silentPlayed = true;
  try {
    const el = document.createElement('audio');
    // Minimal valid WAV: 44-byte header, 0 PCM samples, 44100 Hz mono 16-bit.
    el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    el.volume = 0;
    el.play().catch(() => { /* autoplay blocked — will retry on next gesture */ _silentPlayed = false; });
  } catch { _silentPlayed = false; }
}

/** Called by Tuner when it starts recording mic input. */
export function setMicSession(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = (navigator as any).audioSession;
    if (session) session.type = 'play-and-record';
  } catch { /* ignore */ }
}

/** Called by Tuner when it stops — revert to playback-only. */
export function clearMicSession(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = (navigator as any).audioSession;
    if (session) session.type = 'playback';
  } catch { /* ignore */ }
}

function initAudioGraph(): void {
  if (_ctx && _ctx.state !== 'closed') return;
  _ctx = new AudioCtxClass();
  _masterGain = _ctx.createGain();
  _masterGain.connect(_ctx.destination);
}

export function getSharedContext(): AudioContext {
  initAudioGraph();
  return _ctx!;
}

/** Use this as the final connect() target instead of ctx.destination. */
export function getOutputNode(): AudioNode {
  initAudioGraph();
  return _masterGain!;
}

// ── Unlock ────────────────────────────────────────────────────────────────
// Must be called synchronously from a user-gesture handler on every play action.
// Returns a Promise that resolves once the context is actually running.
export function unlockAudio(): Promise<void> {
  setPlaybackSession();   // iOS 16.4+ — must be before AudioContext creation
  playSilentElement();    // older iOS — must be synchronous in gesture handler
  initAudioGraph();

  const ctx = _ctx!;
  if (ctx.state === 'running') return Promise.resolve();

  // Coalesce concurrent unlock calls into one promise.
  if (_unlocking) return _unlocking;

  // The classic iOS WebAudio unlock: play a 1-sample silent buffer synchronously
  // within the gesture handler. Without this, resume() alone doesn't always work
  // on iOS < 14.5 and on some Android browsers with strict autoplay policies.
  try {
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch { /* ignore — best-effort */ }

  _unlocking = ctx.resume().then(() => {
    _unlocking = null;
  }).catch(() => {
    _unlocking = null;
  });

  return _unlocking;
}

// ── Helpers ───────────────────────────────────────────────────────────────

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
  gain.connect(getOutputNode());
  osc.start(startTime);
  osc.stop(startTime + 1.6);
}

function synthesizeScaleNote(ctx: AudioContext, freq: number, startTime: number): void {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
  osc.connect(gain);
  gain.connect(getOutputNode());
  osc.start(startTime);
  osc.stop(startTime + 0.38);
}

export interface FretPos { string: number; fret: number; }

/** Play scale notes sequentially. Call from a user-gesture handler. */
export function playScale(midiNotes: number[]): void {
  if (midiNotes.length === 0) return;
  unlockAudio().then(() => {
    const ctx = getSharedContext();
    midiNotes.forEach((midi, i) => {
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      synthesizeScaleNote(ctx, freq, ctx.currentTime + 0.1 + i * 0.35);
    });
  });
}

/** Arpeggiate a chord low → high. Call only from a user-gesture handler. */
export function playChord(
  fretPositions: FretPos[],
  openFreqs = STANDARD_OPEN_FREQS,
  capo = 0,
): void {
  if (fretPositions.length === 0) return;
  unlockAudio().then(() => {
    const ctx = getSharedContext();
    const sorted = [...fretPositions].sort((a, b) => a.string - b.string);
    sorted.forEach((pos, i) => {
      const freq = openFreqs[pos.string] * Math.pow(2, (pos.fret + capo) / 12);
      synthesizeNote(ctx, freq, ctx.currentTime + 0.1 + i * 0.065);
    });
  });
}
