// Guitar open-string frequencies — standard tuning E-A-D-G-B-E
const STANDARD_OPEN_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AudioCtxClass: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;

// ── Audio graph ───────────────────────────────────────────────────────────
let _ctx: AudioContext | null = null;
let _masterGain: GainNode | null = null;
let _unlocking: Promise<void> | null = null;
let _silentPlayed = false;

// ── Now Playing suppression ───────────────────────────────────────────────
// audioSession.type = 'playback' causes iOS to show the app in the Now
// Playing widget. Telling MediaSession we are not playing hides it once
// sound finishes. delayMs = 0 applies immediately; > 0 defers.
let _nowPlayingTimer: ReturnType<typeof setTimeout> | null = null;

function suppressNowPlaying(delayMs = 0): void {
  if (!('mediaSession' in navigator)) return;
  if (_nowPlayingTimer) { clearTimeout(_nowPlayingTimer); _nowPlayingTimer = null; }
  const apply = () => {
    try {
      navigator.mediaSession.metadata      = null;
      navigator.mediaSession.playbackState = 'none';
    } catch { /* ignore on older browsers */ }
  };
  if (delayMs <= 0) { apply(); return; }
  _nowPlayingTimer = setTimeout(() => { _nowPlayingTimer = null; apply(); }, delayMs);
}

/** Call when the metronome stops so it releases the Now Playing widget. */
export function releaseNowPlaying(): void { suppressNowPlaying(); }

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
// NOT called on browsers that have navigator.audioSession (iOS 16.4+) because
// el.play() consumes the user-activation token there, leaving ctx.resume() without
// one on the same gesture — which silently prevents the AudioContext from starting.
function playSilentElement(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((navigator as any).audioSession) return; // handled by setPlaybackSession() instead
  if (_silentPlayed) return;
  _silentPlayed = true;
  try {
    const el = document.createElement('audio');
    // Minimal valid WAV: 44-byte header, 0 PCM samples, 44100 Hz mono 16-bit.
    el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    el.volume = 0;
    el.play().catch(() => { _silentPlayed = false; });
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
  suppressNowPlaying(); // prevent initial context creation from registering Now Playing
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

  // Always fire a 1-sample buffer on every call — this is both the iOS gesture
  // unlock trick AND a heartbeat that keeps the context alive between interactions.
  // Connect through masterGain to warm up the entire audio graph.
  try {
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(_masterGain!);
    src.start(0);
  } catch { /* best-effort */ }

  if (ctx.state === 'running') return Promise.resolve();

  // Coalesce concurrent unlock calls into one promise.
  if (_unlocking) return _unlocking;

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
    // Use 0.3s start offset to give the context time to start after unlock
    midiNotes.forEach((midi, i) => {
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      synthesizeScaleNote(ctx, freq, ctx.currentTime + 0.3 + i * 0.35);
    });
    // Dismiss Now Playing after last note finishes: 0.3 + n*0.35 + 0.4s
    suppressNowPlaying(midiNotes.length * 350 + 750);
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
    // Use 0.3s start offset to give the context time to start after unlock
    sorted.forEach((pos, i) => {
      const freq = openFreqs[pos.string] * Math.pow(2, (pos.fret + capo) / 12);
      synthesizeNote(ctx, freq, ctx.currentTime + 0.3 + i * 0.065);
    });
    // Dismiss Now Playing after all strings finish: 0.3 + 5*0.065 + 1.6s ≈ 2.2s
    suppressNowPlaying(2500);
  });
}
