import React, { useState, useRef, useCallback, useEffect } from 'react';
import { T, card } from '../../theme';

const STRINGS = [
  { name: 'E2', freq: 82.41  },
  { name: 'A2', freq: 110.0  },
  { name: 'D3', freq: 146.83 },
  { name: 'G3', freq: 196.0  },
  { name: 'B3', freq: 246.94 },
  { name: 'E4', freq: 329.63 },
];

function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / SIZE) < 0.01) return -1;

  let r1 = 0, r2 = SIZE - 1;
  for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(buf[i]) < 0.2) { r1 = i; break; } }
  for (let i = 1; i < SIZE / 2; i++) { if (Math.abs(buf[SIZE - i]) < 0.2) { r2 = SIZE - i; break; } }

  const t = buf.slice(r1, r2 + 1);
  const len = t.length;
  const c = new Float32Array(len);
  for (let i = 0; i < len; i++) for (let j = 0; j < len - i; j++) c[i] += t[j] * t[j + i];

  let d = 0;
  while (d < len - 1 && c[d] > c[d + 1]) d++;

  let maxVal = -1, maxPos = -1;
  for (let i = d; i < len; i++) { if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; } }
  if (maxPos <= 0 || maxPos >= len - 1) return -1;

  const [x1, x2, x3] = [c[maxPos - 1], c[maxPos], c[maxPos + 1]];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  let T0 = maxPos;
  if (a !== 0) T0 -= b / (2 * a);
  return sampleRate / T0;
}

function findClosest(freq: number) {
  let best = STRINGS[0];
  let bestCents = Infinity;
  for (const s of STRINGS) {
    const cents = 1200 * Math.log2(freq / s.freq);
    if (Math.abs(cents) < Math.abs(bestCents)) { bestCents = cents; best = s; }
  }
  return { string: best, cents: Math.round(bestCents) };
}

export const Tuner: React.FC = () => {
  const [listening, setListening] = useState(false);
  const [freq, setFreq]           = useState<number | null>(null);
  const [closest, setClosest]     = useState<ReturnType<typeof findClosest> | null>(null);
  const [error, setError]         = useState('');

  const ctxRef      = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number | null>(null);

  const tick = useCallback(() => {
    if (!analyserRef.current || !ctxRef.current) return;
    const buf = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(buf);
    const detected = autoCorrelate(buf, ctxRef.current.sampleRate);
    if (detected > 60 && detected < 420) {
      setFreq(Math.round(detected * 10) / 10);
      setClosest(findClosest(detected));
    } else {
      setFreq(null);
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
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
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
    setListening(false); setFreq(null); setClosest(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const cents     = closest?.cents ?? 0;
  const absCents  = Math.abs(cents);
  const tuneColor = !freq ? T.border : absCents <= 5 ? T.secondary : absCents <= 15 ? '#D4A017' : T.coral;
  const needlePct = freq ? Math.min(100, Math.max(0, 50 + (cents / 30) * 50)) : 50;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Main display */}
      <div style={card({ textAlign: 'center', padding: '24px 20px' })}>
        <div style={{ fontSize: 52, fontWeight: 800, color: tuneColor, lineHeight: 1, marginBottom: 6, transition: 'color 0.2s' }}>
          {closest ? closest.string.name : '—'}
        </div>
        <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 20 }}>
          {freq ? `${freq} Hz` : 'Play a string…'}
        </div>

        {/* Needle bar */}
        <div style={{ position: 'relative', height: 8, borderRadius: 4, background: T.bgInput, marginBottom: 10, overflow: 'visible' }}>
          <div style={{ position: 'absolute', left: '50%', top: -5, width: 2, height: 18, background: T.border, transform: 'translateX(-50%)' }} />
          <div style={{
            position: 'absolute', top: -5, width: 6, height: 18, borderRadius: 3,
            background: tuneColor, transform: 'translateX(-50%)',
            left: `${needlePct}%`, transition: 'left 0.1s, background 0.2s',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textDim, marginBottom: 10 }}>
          <span>♭ Flat</span><span>In tune</span><span>Sharp ♯</span>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: tuneColor, transition: 'color 0.2s', minHeight: 20 }}>
          {!freq ? '' : absCents <= 5 ? '✓ In tune!' : cents > 0 ? `+${cents}¢ — Tune down` : `${cents}¢ — Tune up`}
        </div>
      </div>

      {/* String reference + start */}
      <div style={card()}>
        <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Standard Tuning
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {STRINGS.map(s => {
            const active = closest?.string.name === s.name && !!freq;
            return (
              <div key={s.name} style={{
                padding: '8px 4px', borderRadius: 8, textAlign: 'center',
                background: active ? T.primaryBg : T.bgInput,
                border: `1px solid ${active ? tuneColor : T.border}`,
                transition: 'all 0.2s',
              }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{s.name}</div>
                <div style={{ fontSize: 10, color: T.textMuted }}>{s.freq} Hz</div>
              </div>
            );
          })}
        </div>
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
