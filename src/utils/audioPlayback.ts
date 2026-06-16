// Guitar open-string frequencies — standard tuning E-A-D-G-B-E
const STANDARD_OPEN_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AudioCtxClass: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;

// ── Audio graph ───────────────────────────────────────────────────────────
let _ctx: AudioContext | null = null;
let _masterGain: GainNode | null = null;

// iOS 16.4+ exposes navigator.audioSession — setting it to "playback" makes
// Web Audio ignore the hardware mute switch. This is the proper, direct fix.
function setPlaybackSession(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = (navigator as any).audioSession;
    if (session && session.type !== 'playback') session.type = 'playback';
  } catch { /* not supported — silent-audio fallback handles older iOS */ }
}

function initAudioGraph(): void {
  if (_ctx && _ctx.state !== 'closed') return;

  setPlaybackSession();
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

// ── iOS silent-switch bypass ────────────────────────────────────────────────
// Web Audio honours the iOS hardware mute switch unless a media element has
// promoted the page's audio session to the "playback" category. We loop a
// tiny silent clip (started inside a user gesture) to flip that category, so
// the metronome / chord playback stay audible even on silent mode.
let _silentEl: HTMLAudioElement | null = null;

function buildSilentWavUri(): string {
  const sampleRate = 8000, numSamples = 400, dataSize = numSamples; // 8-bit mono, ~0.05s
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128); // 8-bit silence = midpoint
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(binary);
}

function ensureSilentAudio(): void {
  if (_silentEl) return;
  try {
    _silentEl = new Audio(buildSilentWavUri());
    _silentEl.loop = true;
    _silentEl.setAttribute('playsinline', '');
    _silentEl.preload = 'auto';
    _silentEl.volume = 1; // the clip is silent; this just keeps the session alive
    // Some iOS versions only promote the session for an element in the DOM.
    Object.assign(_silentEl.style, {
      position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none',
    });
    document.body.appendChild(_silentEl);
  } catch { /* ignore */ }
}

// ── Unlock ────────────────────────────────────────────────────────────────
// Call from every user-gesture handler to resume AudioContext on iOS.
export function unlockAudio(): void {
  // iOS 16.4+: the direct, proper fix — ignore the mute switch.
  setPlaybackSession();

  initAudioGraph();
  _ctx!.resume().catch(() => {});

  // Fallback for older iOS: loop a silent clip to promote the audio session.
  ensureSilentAudio();
  _silentEl?.play().catch(() => {});

  // Explicitly suppress the iOS Now Playing / media session widget.
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    }
  } catch { /* ignore */ }
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
  unlockAudio();
  const ctx = getSharedContext();
  const schedule = () => {
    midiNotes.forEach((midi, i) => {
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      synthesizeScaleNote(ctx, freq, ctx.currentTime + 0.1 + i * 0.35);
    });
  };
  if (ctx.state === 'running') schedule();
  else ctx.resume().then(schedule).catch(() => {});
}

/** Arpeggiate a chord low → high. Call only from a user-gesture handler. */
export function playChord(
  fretPositions: FretPos[],
  openFreqs = STANDARD_OPEN_FREQS,
  capo = 0,
): void {
  if (fretPositions.length === 0) return;
  unlockAudio();
  const ctx = getSharedContext();

  const schedule = () => {
    const sorted = [...fretPositions].sort((a, b) => a.string - b.string);
    sorted.forEach((pos, i) => {
      const freq = openFreqs[pos.string] * Math.pow(2, (pos.fret + capo) / 12);
      synthesizeNote(ctx, freq, ctx.currentTime + 0.1 + i * 0.065);
    });
  };

  if (ctx.state === 'running') schedule();
  else ctx.resume().then(schedule).catch(() => {});
}
