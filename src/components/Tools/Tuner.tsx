import React, { useState, useRef, useCallback, useEffect } from 'react';
import { T, card } from '../../theme';
import type { Tuning } from '../../types/music';
import { TUNINGS } from '../../utils/musicTheory';

const noteName = (s: string) => s.replace(/\d/g, '');

interface Props { tuning?: Tuning }

interface PitchResult { freq: number; confidence: number }

/**
 * YIN pitch detection algorithm.
 * de Cheveigné & Kawahara (2002) — the gold standard for monophonic pitch.
 * Fixes the normalisation bug in the old autocorrelation approach that caused
 * it to systematically prefer higher-frequency (wrong) readings.
 */
function detectPitch(buf: Float32Array, sampleRate: number): PitchResult {
  const W = 1024; // analysis window — ~2 periods of low-E at 82 Hz

  // RMS silence gate
  let rms = 0;
  for (let i = 0; i < W; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / W);
  if (rms < 0.01) return { freq: -1, confidence: 0 };

  // Guitar range: 55 Hz (A1, below drop-D) → 400 Hz (above high-E)
  const tauMin = Math.floor(sampleRate / 400);
  const tauMax = Math.min(
    Math.ceil(sampleRate / 55),
    buf.length - W - 1,
  );
  if (tauMin >= tauMax) return { freq: -1, confidence: 0 };

  // Step 1 — squared difference function d(tau)
  // d(tau) = Σ (x[j] - x[j+tau])²  for j = 0..W-1
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    for (let j = 0; j < W; j++) {
      const delta = buf[j] - buf[j + tau];
      d[tau] += delta * delta;
    }
  }

  // Step 2 — cumulative mean normalised difference (CMNDF)
  // d'(0) = 1,  d'(tau) = d(tau) * tau / Σ d(1..tau)
  // This normalisation is the key improvement over raw autocorrelation —
  // it removes the bias toward small lags that made the old code go sharp.
  const cmndf = new Float32Array(tauMax + 1);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    runningSum += d[tau];
    cmndf[tau] = runningSum > 0 ? (d[tau] * tau) / runningSum : 1;
  }

  // Step 3 — find first local minimum below threshold in guitar range
  // Threshold 0.12 is conservative: avoids octave errors, rejects noise.
  const THRESHOLD = 0.12;
  let bestTau = -1;
  let tau = tauMin;

  while (tau < tauMax - 1) {
    if (cmndf[tau] < THRESHOLD) {
      // slide right to the local minimum
      while (tau + 1 < tauMax && cmndf[tau + 1] < cmndf[tau]) tau++;
      bestTau = tau;
      break;
    }
    tau++;
  }

  // Nothing below threshold — report confidence for "play louder" hint
  if (bestTau < 0) {
    let minVal = 1;
    for (let t = tauMin; t < tauMax; t++) {
      if (cmndf[t] < minVal) { minVal = cmndf[t]; bestTau = t; }
    }
    return { freq: -1, confidence: Math.max(0, 1 - minVal) };
  }

  // Step 4 — parabolic interpolation for sub-sample accuracy
  let refinedTau = bestTau;
  if (bestTau > tauMin && bestTau < tauMax - 1) {
    const s0 = cmndf[bestTau - 1];
    const s1 = cmndf[bestTau];
    const s2 = cmndf[bestTau + 1];
    const denom = 2 * (s0 - 2 * s1 + s2);
    if (Math.abs(denom) > 1e-10) {
      const frac = (s0 - s2) / denom;
      refinedTau = bestTau + Math.max(-0.5, Math.min(0.5, frac));
    }
  }

  return {
    freq: sampleRate / refinedTau,
    confidence: 1 - cmndf[bestTau],
  };
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

const MEDIAN_BUF  = 10;  // ~330 ms at 30 fps — fast but stable
const OUTLIER_CENTS = 50; // tighter rejection than before

export const Tuner: React.FC<Props> = ({ tuning = TUNINGS[0] }) => {
  const stringsRef = useRef(
    tuning.notes.map((note, i) => ({ name: note, freq: tuning.openFreqs[i] }))
  );
  // Keep stringsRef current when tuning prop changes
  useEffect(() => {
    stringsRef.current = tuning.notes.map((note, i) => ({ name: note, freq: tuning.openFreqs[i] }));
  }, [tuning]);

  const [listening, setListening]       = useState(false);
  const [display, setDisplay]           = useState<{ note: string; hz: number; cents: number } | null>(null);
  const [error, setError]               = useState('');
  const [loudnessHint, setLoudnessHint] = useState(false);

  const ctxRef       = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const rafRef       = useRef<number | null>(null);
  const freqBufRef   = useRef<number[]>([]);
  const lastValidRef = useRef<number>(0);
  const frameRef     = useRef(0);

  const tick = useCallback(() => {
    if (!analyserRef.current || !ctxRef.current) return;

    // Throttle to ~30 fps
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

      if (ring.length >= 4) {
        const sorted = [...ring].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];

        const valid = ring.filter(
          f => Math.abs(1200 * Math.log2(f / median)) < OUTLIER_CENTS
        );

        if (valid.length >= 3) {
          const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
          lastValidRef.current = Date.now();
          const { string, cents } = findClosest(mean, stringsRef.current);
          setDisplay({
            note:  noteName(string.name),
            hz:    Math.round(mean * 10) / 10,
            cents: Math.round(cents),
          });
        }
      }
    } else {
      if (result.confidence > 0.15) setLoudnessHint(true);
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
      analyser.fftSize = 4096;              // 4096 samples — enough for YIN at any guitar pitch
      analyser.smoothingTimeConstant = 0.0; // raw signal; YIN handles its own smoothing
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
  const tuneColor = !display    ? T.border
    : absCents <= 5             ? T.secondary
    : absCents <= 20            ? '#D4A017'
    : T.coral;

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
            transition: 'left 0.15s ease-out, background 0.3s',
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
