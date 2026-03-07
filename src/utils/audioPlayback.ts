// Guitar open-string frequencies — standard tuning E-A-D-G-B-E
const OPEN_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AudioCtx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AudioCtx();
  return sharedCtx;
}

/** Must be called inside an onClick handler (user gesture) to unlock iOS audio. */
function unlockCtx(ctx: AudioContext): void {
  // Play a 1-sample silent buffer — switches iOS audio session to "playback"
  // so Web Audio API works even when the hardware silent switch is on.
  const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
  ctx.resume().catch(() => {});
}

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

/** Arpeggiate a chord low → high string */
export function playChord(fretPositions: FretPos[]): void {
  if (fretPositions.length === 0) return;
  const ctx = getCtx();
  unlockCtx(ctx);
  const sorted = [...fretPositions].sort((a, b) => a.string - b.string);
  sorted.forEach((pos, i) => {
    const freq = OPEN_FREQS[pos.string] * Math.pow(2, pos.fret / 12);
    synthesizeNote(ctx, freq, ctx.currentTime + i * 0.065);
  });
}
