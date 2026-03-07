// Guitar open-string frequencies — standard tuning E-A-D-G-B-E
const OPEN_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AudioCtxClass: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;

// ── Single shared AudioContext ────────────────────────────────────────────
let _ctx: AudioContext | null = null;

export function getSharedContext(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new AudioCtxClass();
  }
  return _ctx;
}

// ── Generate a valid silent WAV programmatically ──────────────────────────
// (avoids any base64 encoding errors)
function makeSilentWAVUrl(): string {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * 0.1); // 100 ms
  const buf = new ArrayBuffer(44 + numSamples * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) =>
    s.split('').forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + numSamples * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);                         // channels
  v.setUint32(24, sampleRate, true);                // sample rate
  v.setUint32(28, sampleRate * 2, true);            // byte rate
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); // block align, bits
  str(36, 'data'); v.setUint32(40, numSamples * 2, true);
  // audio data stays all zeros = silence
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

let _silentURL: string | null = null;
function getSilentURL() {
  if (!_silentURL) _silentURL = makeSilentWAVUrl();
  return _silentURL;
}

// ── iOS unlock ────────────────────────────────────────────────────────────
// Call from every user-gesture handler before scheduling audio.
let _silentUnlocked = false;

export function unlockAudio(): void {
  const ctx = getSharedContext();

  // 1. Resume Web Audio context within the user gesture.
  ctx.resume().catch(() => {});

  // 2. Warm-up: play a 1-sample silent buffer through the context.
  try {
    const b = ctx.createBuffer(1, 1, ctx.sampleRate);
    const s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
  } catch { /* ignore */ }

  // 3. Tell iOS this is a media-playback app via MediaSession — this switches
  //    AVAudioSession to "playback" category, which ignores the mute switch.
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'ScaleUp' });
    }
  } catch { /* ignore */ }

  // 4. Also play through HTMLAudioElement (belt-and-suspenders for older iOS).
  if (_silentUnlocked) return;
  _silentUnlocked = true;
  try {
    const audio = document.createElement('audio');
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    audio.volume = 0.001;
    audio.src = getSilentURL();
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
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + 1.6);
}

export interface FretPos { string: number; fret: number; }

/** Arpeggiate a chord low → high. Call only from a user-gesture handler. */
export function playChord(fretPositions: FretPos[]): void {
  if (fretPositions.length === 0) return;
  unlockAudio();
  const ctx = getSharedContext();

  const schedule = () => {
    const sorted = [...fretPositions].sort((a, b) => a.string - b.string);
    // +0.1s offset so the context has time to reach "running" state
    sorted.forEach((pos, i) => {
      const freq = OPEN_FREQS[pos.string] * Math.pow(2, pos.fret / 12);
      synthesizeNote(ctx, freq, ctx.currentTime + 0.1 + i * 0.065);
    });
  };

  // Wait for the context to be running before scheduling notes.
  if (ctx.state === 'running') {
    schedule();
  } else {
    ctx.resume().then(schedule).catch(() => {});
  }
}
