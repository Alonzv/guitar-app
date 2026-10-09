import React, { useState, useRef, useCallback, useEffect } from 'react';
import { T } from '../../theme';
import type { Tuning } from '../../types/music';
import { TUNINGS } from '../../utils/musicTheory';
import { IconMic } from '../Icons';
import { getSharedContext, unlockAudio, setMicSession, clearMicSession } from '../../utils/audioPlayback';
import { previewFret } from '../../utils/previewSound';
import { detectPitch } from '../../utils/pitch';

const noteName = (s: string) => s.replace(/\d/g, '');

interface Props { tuning?: Tuning }

function findClosest(freq: number, strings: { name: string; freq: number }[]) {
  let best = strings[0];
  let bestCents = Infinity;
  for (const s of strings) {
    const cents = 1200 * Math.log2(freq / s.freq);
    if (Math.abs(cents) < Math.abs(bestCents)) { bestCents = cents; best = s; }
  }
  return { string: best, cents: bestCents };
}

const MEDIAN_BUF    = 10;
const OUTLIER_CENTS = 50;

// Standard tuning string labels and open frequencies (low to high)
const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];

const SECTION: React.CSSProperties = {
  fontFamily: 'var(--gc-mono)', fontSize: 11, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: '#9C958C', margin: '0 0 14px',
};

export const Tuner: React.FC<Props> = ({ tuning = TUNINGS[0] }) => {
  const stringsRef = useRef(
    tuning.notes.map((note, i) => ({ name: note, freq: tuning.openFreqs[i] }))
  );
  useEffect(() => {
    stringsRef.current = tuning.notes.map((note, i) => ({ name: note, freq: tuning.openFreqs[i] }));
  }, [tuning]);

  const [listening, setListening]       = useState(false);
  const [display, setDisplay]           = useState<{ note: string; hz: number; cents: number } | null>(null);
  const [error, setError]               = useState('');
  const [loudnessHint, setLoudnessHint] = useState(false);

  const ctxRef       = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const sourceRef    = useRef<MediaStreamAudioSourceNode | null>(null);
  const sinkRef      = useRef<GainNode | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const rafRef       = useRef<number | null>(null);
  const freqBufRef   = useRef<number[]>([]);
  const lastValidRef = useRef<number>(0);
  const frameRef     = useRef(0);

  const tick = useCallback(() => {
    if (!analyserRef.current || !ctxRef.current) return;

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
      // Both must be called synchronously in the gesture handler, before any await,
      // so iOS audio session is set while the user gesture is still active.
      setMicSession();
      const unlockPromise = unlockAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      await unlockPromise;
      streamRef.current = stream;
      const ctx = getSharedContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.0;
      source.connect(analyser);
      analyserRef.current = analyser;
      // Some browsers (notably iOS Safari) never process a node that isn't part
      // of a path to the destination, so a dead-end analyser reads pure silence
      // and nothing is ever detected. Route it on through a muted gain node so
      // the mic is actually pulled — silent output, real data.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      analyser.connect(sink);
      sink.connect(ctx.destination);
      sinkRef.current = sink;
      setListening(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: unknown) {
      const name = (e instanceof Error) ? e.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Microphone blocked. On iPhone: Settings → Privacy → Microphone → enable for this app.');
      } else if (name === 'NotFoundError') {
        setError('No microphone found on this device.');
      } else {
        setError('Could not access microphone. Check permissions and try again.');
      }
    }
  }, [tick]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    // Disconnect the source node first — on iOS, keeping a MediaStreamSourceNode
    // connected can hold the mic indicator on even after stopping the tracks.
    try { sourceRef.current?.disconnect(); } catch { /* ignore */ }
    try { analyserRef.current?.disconnect(); } catch { /* ignore */ }
    try { sinkRef.current?.disconnect(); } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current = null; analyserRef.current = null;
    sourceRef.current = null; sinkRef.current = null; streamRef.current = null;
    freqBufRef.current = [];
    clearMicSession();
    setListening(false); setDisplay(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const cents    = display?.cents ?? 0;
  const absCents = Math.abs(cents);
  const tuneColor = !display    ? T.textDim
    : absCents <= 5             ? T.secondary
    : absCents <= 20            ? '#8A8378'
    : T.primary;

  const needlePct = display
    ? Math.min(100, Math.max(0, 50 + (cents / 50) * 50))
    : 50;

  // Detect which string is currently active (note match)
  const activeStringIdx = display
    ? tuning.notes.findIndex(n => n.replace(/\d/g, '') === display.note)
    : -1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Section label */}
      <p style={SECTION}>Tuner</p>

      {/* Main display — open, no card */}
      <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>

        {/* Giant note */}
        <div className="gc-tuner-note" style={{
          color: tuneColor,
          marginBottom: 2,
          transition: 'color 0.3s',
          minHeight: 88,
        }}>
          {display ? display.note : ''}
        </div>

        {/* Hz — red mono */}
        <div style={{
          fontFamily: 'var(--gc-mono)', fontSize: 16, fontWeight: 600,
          color: display ? T.primary : T.textDim,
          letterSpacing: '0.04em', marginBottom: 20, minHeight: 22,
          transition: 'color 0.3s',
        }}>
          {display ? `${display.hz} Hz` : (loudnessHint ? 'play louder' : 'play a string…')}
        </div>

        {/* Needle bar */}
        <div style={{ position: 'relative', height: 2, background: T.border, marginBottom: 10, overflow: 'visible' }}>
          {/* Centre mark */}
          <div style={{
            position: 'absolute', left: '50%', top: -8, width: 1, height: 18,
            background: T.border, transform: 'translateX(-50%)',
          }} />
          {/* Needle */}
          <div style={{
            position: 'absolute', top: -10, width: 4, height: 22,
            background: tuneColor, transform: 'translateX(-50%)',
            left: `${needlePct}%`,
            transition: 'left 0.15s ease-out, background 0.3s',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textDim, marginBottom: 4, letterSpacing: '0.06em', fontFamily: 'var(--gc-mono)' }}>
          <span>♭</span>
          <span style={{ color: tuneColor, fontWeight: 600 }}>
            {!display ? '' : absCents <= 5 ? 'IN TUNE' : cents > 0 ? `+${cents}¢` : `${cents}¢`}
          </span>
          <span>♯</span>
        </div>
      </div>

      {/* String buttons — open, no card */}
      <div style={{ padding: '4px 0' }}>
        <p style={{ ...SECTION, marginBottom: 10 }}>String</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
          {STRING_LABELS.map((label, i) => {
            const active = activeStringIdx === i;
            return (
              // Tapping a string plays its reference pitch to tune against by ear.
              <button key={label} className="gc-notation" onClick={() => previewFret({ string: i, fret: 0 }, tuning.openFreqs)} title={`Hear ${label}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 40, cursor: 'pointer',
                background: active ? (absCents <= 5 ? T.secondary : T.primary) : T.bgInput,
                border: `1.5px solid ${active ? (absCents <= 5 ? T.secondary : T.primary) : T.border}`,
                color: active ? '#fff' : T.textMuted,
                fontFamily: 'var(--gc-mono)', fontSize: 13, fontWeight: active ? 700 : 400,
                userSelect: 'none',
              }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* Hint — the surrounding UI is English, so this stays English too;
            it used to be a stray hard-coded Hebrew line (and misspelt מיתר). */}
        <div style={{
          marginTop: 12, textAlign: 'center',
          fontFamily: 'var(--gc-mono)', fontSize: 11, color: T.textDim,
          letterSpacing: '0.05em',
        }}>
          Play the open string to tune it
        </div>
      </div>

      {/* Start / Stop */}
      {error && <p style={{ color: T.coral, fontSize: 12, margin: 0 }}>{error}</p>}
      <button data-active={!!listening}
        onClick={listening ? stop : start}
        className="gc-btn-heavy"
        style={{
          width: '100%', padding: '16px 0', borderRadius: 0,
          background: listening ? T.coral : T.primary,
          color: T.white, fontWeight: 800, fontSize: 16, cursor: 'pointer',
          border: 'none',
          borderLeft: '4px solid var(--gc-bar-color)',
          letterSpacing: '0.06em',
        }}
      >
        {listening ? '■  STOP' : <><IconMic size={14} />  START TUNING</>}
      </button>
    </div>
  );
};
