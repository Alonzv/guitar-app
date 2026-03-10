import React, { useState, useRef, useCallback, useEffect } from 'react';
import { T, card } from '../../theme';
import type { Tuning } from '../../types/music';
import { TUNINGS } from '../../utils/musicTheory';

const noteName = (s: string) => s.replace(/\d/g, '');

interface Props { tuning?: Tuning }

interface PitchResult { freq: number; confidence: number }

/**
 * Normalized autocorrelation — guitar range only.
 * Finds the FIRST strong peak (avoids octave errors where harmonics
 * score higher than the fundamental).
 */
function detectPitch(buf: Float32Array, sampleRate: number): PitchResult {
  const SIZE = buf.length;

  // RMS gate — silence rejection
  let rmsSum = 0;
  for (let i = 0; i < SIZE; i++) rmsSum += buf[i] * buf[i];
  if (Math.sqrt(rmsSum / SIZE) < 0.015) return { freq: -1, confidence: 0 };

  // Guitar range: 70 Hz (below low E) → 380 Hz (above high E)
  const lagMin = Math.floor(sampleRate / 380); // ≈ 116
  const lagMax = Math.ceil(sampleRate / 70);   // ≈ 630

  // Only autocorrelate over first 2048 samples to keep it fast
  const N = Math.min(SIZE, 2048);

  // Normalisation constant (c[0])
  let c0 = 0;
  for (let i = 0; i < N; i++) c0 += buf[i] * buf[i];
  if (c0 === 0) return { freq: -1, confidence: 0 };

  // Compute normalised autocorrelation for relevant lags
  const numLags = lagMax - lagMin + 1;
  const c = new Float32Array(numLags);
  for (let k = 0; k < numLags; k++) {
    const lag = lagMin + k;
    let sum = 0;
    const end = N - lag;
    for (let j = 0; j < end; j++) sum += buf[j] * buf[j + lag];
    c[k] = sum / c0;
  }

  // Track best confidence even if below threshold (for "play louder" hint)
  let bestC = 0;
  for (let k = 0; k < numLags; k++) if (c[k] > bestC) bestC = c[k];

  // Find the FIRST local peak above confidence threshold (lowered to 0.3)
  // "First peak" avoids octave errors — harmonics appear at later lags
  const CONFIDENCE = 0.3;
  let peakK = -1;
  for (let k = 1; k < numLags - 1; k++) {
    if (c[k] > c[k - 1] && c[k] >= c[k + 1] && c[k] > CONFIDENCE) {
      peakK = k;
      break;
    }
  }
  if (peakK < 0) return { freq: -1, confidence: bestC };

  // Parabolic interpolation for sub-sample precision
  const y0 = c[peakK - 1], y1 = c[peakK], y2 = c[peakK + 1];
  const denom = 2 * (y0 - 2 * y1 + y2);
  const frac = denom !== 0 ? (y0 - y2) / denom : 0;
  const T0 = lagMin + peakK + Math.max(-0.5, Math.min(0.5, frac));

  return { freq: sampleRate / T0, confidence: c[peakK] };
}

function findClosest(freq: number, strings: { name: string; freq: number }[]) {
  let best = strings[0];
  let bestCents = Infinity;
  for (const s of strings) {
    const cents = 1200 * Math.log2(freq / s.freq);
    if (Math.abs(cents) < Math.abs(bestCents)) { bestCents = cents; best = s; }
  }
  return { string: best, cents: bestCents };
}

const MEDIAN_BUF = 24;   // rolling window size
const OUTLIER_CENTS = 80; // reject readings more than this far from median

export const Tuner: React.FC<Props> = ({ tuning = TUNINGS[0] }) => {
  const strings = tuning.notes.map((note, i) => ({ name: note, freq: tuning.openFreqs[i] }));
  const [listening, setListening]       = useState(false);
  const [display, setDisplay]           = useState<{ note: string; hz: number; cents: number } | null>(null);
  const [error, setError]               = useState('');
  const [loudnessHint, setLoudnessHint] = useState(false);

  const ctxRef        = useRef<AudioContext | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const rafRef        = useRef<number | null>(null);
  const freqBufRef    = useRef<number[]>([]);        // rolling valid readings
  const lastValidRef  = useRef<number>(0);
  const frameRef      = useRef(0);                   // for throttling

  const tick = useCallback(() => {
    if (!analyserRef.current || !ctxRef.current) return;

    // Throttle to ~30 fps — enough for a tuner display
    frameRef.current++;
    if (frameRef.current % 2 === 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const buf = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(buf);
    const result = detectPitch(buf, ctxRef.current.sampleRate);

    if (result.freq > 0) {
      setLoudnessHint(false);
      const ring = freqBufRef.current;
      ring.push(result.freq);
      if (ring.length > MEDIAN_BUF) ring.shift();

      if (ring.length >= 6) {
        // Median of ring buffer
        const sorted = [...ring].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];

        // Reject outliers more than OUTLIER_CENTS away from median
        const valid = ring.filter(
          f => Math.abs(1200 * Math.log2(f / median)) < OUTLIER_CENTS
        );

        if (valid.length >= 4) {
          // Mean of valid readings
          const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
          lastValidRef.current = Date.now();
          const { string, cents } = findClosest(mean, strings);
          setDisplay({
            note:  noteName(string.name),
            hz:    Math.round(mean * 10) / 10,
            cents: Math.round(cents),
          });
        }
      }
    } else {
      // Show "play louder" hint when there's some signal but below threshold
      if (result.confidence > 0.15) {
        setLoudnessHint(true);
      }
      // Persist display for 2 s after signal drops, then clear
      if (Date.now() - lastValidRef.current > 2000) {
        freqBufRef.current = [];
        setDisplay(null);
        setLoudnessHint(false);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.0; // no smoothing — we do it ourselves
      source.connect(analyser);
      analyserRef.current = analyser;
      setListening(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setError('Microphone access denied. Please allow it in browser settings.');
    }
  }, [tick]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    ctxRef.current?.close().catch(() => {});
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current = null; analyserRef.current = null; streamRef.current = null;
    freqBufRef.current = [];
    setListening(false); setDisplay(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const cents    = display?.cents ?? 0;
  const absCents = Math.abs(cents);
  const tuneColor = !display      ? T.border
    : absCents <= 5               ? T.secondary
    : absCents <= 20              ? '#D4A017'
    : T.coral;

  // ±50 cents → 0–100 %
  const needlePct = display
    ? Math.min(100, Math.max(0, 50 + (cents / 50) * 50))
    : 50;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Main display */}
      <div style={card({ textAlign: 'center', padding: '28px 20px' })}>
        <div className="gc-tuner-note" style={{
          fontWeight: 800, color: tuneColor,
          lineHeight: 1, marginBottom: 4,
          transition: 'color 0.3s', minHeight: 88,
        }}>
          {display ? display.note : '—'}
        </div>
        <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 8, minHeight: 18 }}>
          {display ? `${display.hz} Hz` : 'Play a string…'}
        </div>
        <div style={{ fontSize: 12, color: T.secondary, marginBottom: 16, minHeight: 16 }}>
          {loudnessHint && !display ? 'Play louder for better detection' : ''}
        </div>

        {/* Needle bar */}
        <div style={{ position: 'relative', height: 10, borderRadius: 5, background: T.bgInput, marginBottom: 10, overflow: 'visible' }}>
          <div style={{
            position: 'absolute', left: '50%', top: -6, width: 2, height: 22,
            background: T.border, transform: 'translateX(-50%)', borderRadius: 1,
          }} />
          <div style={{
            position: 'absolute', top: -4, width: 8, height: 18, borderRadius: 4,
            background: tuneColor, transform: 'translateX(-50%)',
            left: `${needlePct}%`,
            // slow transition — the buffer already smooths the data,
            // the CSS transition just makes it look silky
            transition: 'left 0.25s ease-out, background 0.3s',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textDim, marginBottom: 12 }}>
          <span>♭ Flat</span><span>In tune</span><span>Sharp ♯</span>
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, color: tuneColor, transition: 'color 0.3s', minHeight: 22 }}>
          {!display ? ''
            : absCents <= 5  ? '✓ In tune!'
            : cents > 0 ? `+${cents}¢ — Tune down`
            : `${cents}¢ — Tune up`}
        </div>
      </div>

      {/* Start / Stop */}
      <div style={card()}>
        {error && <p style={{ color: T.coral, fontSize: 12, margin: '0 0 12px' }}>{error}</p>}
        <button
          onClick={listening ? stop : start}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
            background: listening ? T.coral : T.primary,
            color: T.white, fontWeight: 800, fontSize: 16, cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {listening ? '■  Stop' : '🎤  Start Tuning'}
        </button>
      </div>
    </div>
  );
};
