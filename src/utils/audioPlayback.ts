// Guitar open-string frequencies — standard tuning E-A-D-G-B-E
const STANDARD_OPEN_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AudioCtxClass: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;

// ── Audio graph ───────────────────────────────────────────────────────────
// All synthesis connects to _masterGain → MediaStreamDestinationNode → <audio>.
// The <audio> element runs in iOS "playback" AVAudioSession category,
// which ignores the mute/silent switch — unlike AudioContext alone.
let _ctx: AudioContext | null = null;
let _masterGain: GainNode | null = null;
let _mediaEl: HTMLAudioElement | null = null;

function initAudioGraph(): void {
  if (_ctx && _ctx.state !== 'closed') return;

  _ctx = new AudioCtxClass();
  _masterGain = _ctx.createGain();

  try {
    const dest = _ctx.createMediaStreamDestination();
    _masterGain.connect(dest);

    if (!_mediaEl) {
      _mediaEl = document.createElement('audio');
      _mediaEl.setAttribute('playsinline', '');
      _mediaEl.setAttribute('webkit-playsinline', '');
      document.body.appendChild(_mediaEl);
    }
    _mediaEl.srcObject = dest.stream;
  } catch {
    // Fallback for browsers without createMediaStreamDestination
    _masterGain.connect(_ctx.destination);
  }
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
// Call from every user-gesture handler. Resumes AudioContext AND starts
// the <audio> element (which switches iOS AVAudioSession → "playback").
export function unlockAudio(): void {
  initAudioGraph();
  _ctx!.resume().catch(() => {});

  if (_mediaEl) {
    _mediaEl.play().catch(() => {});
  }

  // Tell iOS this is a media-playback app (reinforces AVAudioSession category).
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'ScaleUp' });
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
