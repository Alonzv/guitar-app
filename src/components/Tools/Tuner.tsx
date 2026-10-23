import React, { useState, useRef, useCallback, useEffect } from 'react';
import { riseIn, breathe, useOnChange } from '../../utils/motion';
import { T } from '../../theme';
import type { Tuning } from '../../types/music';
import { TUNINGS } from '../../utils/musicTheory';
import { useLang } from '../../contexts/LanguageContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { PosterTitle, Meta, Pill, Cta } from '../Transit/parts';
import { keyStyle } from '../Transit/styles';
import { NightStage, NightToggle } from './NightStage';
import { StopActions } from '../Transit/StopActions';
import { useNight } from './useNight';
import { getSharedContext, unlockAudio, setMicSession, clearMicSession } from '../../utils/audioPlayback';
import { previewFret } from '../../utils/previewSound';
import { detectPitch } from '../../utils/pitch';
import { chime } from '../../practice/feedback';

const noteName = (s: string) => s.replace(/\d/g, '');

interface Props { tuning?: Tuning }

const LOCK_MS = 700;

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

export const Tuner: React.FC<Props> = ({ tuning = TUNINGS[0] }) => {
  const { lang } = useLang();
  const he = lang === 'he';
  const desktop = useIsDesktop();
  const [night, toggleNight] = useNight('scaleup_tuner_night');
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
  // Strings that have been brought in tune this session — a string locks once
  // it has held within ±5¢ for LOCK_MS; all six earn the TUNED stamp.
  const [tuned, setTuned] = useState<Set<number>>(new Set());
  const tunedRef = useRef(tuned);
  const lockRef  = useRef<{ idx: number; since: number }>({ idx: -1, since: 0 });
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
          const idx = stringsRef.current.indexOf(string);
          const now = Date.now();
          if (Math.abs(cents) <= 5) {
            if (lockRef.current.idx !== idx) lockRef.current = { idx, since: now };
            else if (now - lockRef.current.since > LOCK_MS && !tunedRef.current.has(idx)) {
              const next = new Set(tunedRef.current).add(idx);
              tunedRef.current = next;
              setTuned(next);
              chime();
            }
          } else lockRef.current = { idx: -1, since: 0 };
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

  // The lowest string not yet in tune — the one to play next.
  const nextString = [0, 1, 2, 3, 4, 5].find(i => !tuned.has(i)) ?? -1;

  // Detect which string is currently active (note match)
  const activeStringIdx = display
    ? tuning.notes.findIndex(n => n.replace(/\d/g, '') === display.note)
    : -1;

  // The letter turns cobalt only when the string is dead on (|cents| < 2).
  const letterColor = !display ? T.textMuted : absCents < 2 ? T.primary : T.text;
  // Idle, the letter shows the string to play next, dimmed.
  const letter = display ? display.note : STRING_LABELS[nextString >= 0 ? nextString : 0];
  // A new string: the letter rises from below. Landing in tune (inside ±2
  // cents) on the same string: it breathes once.
  const letterRef = useRef<HTMLDivElement>(null);
  const inTune = !!display && absCents < 2;
  useOnChange(`${letter}|${inTune}`, (prev, next) => {
    const [pl, pt] = prev.split('|'), [nl, nt] = next.split('|');
    if (pl !== nl) riseIn(letterRef.current);
    else if (pt === 'false' && nt === 'true') breathe(letterRef.current);
  });
  const readout = !display ? '—' : absCents <= 5 ? (he ? 'מכוון' : 'IN TUNE') : cents > 0 ? `+${cents}¢` : `${cents}¢`;

  const startStop = (style: React.CSSProperties) => listening
    ? <Pill onClick={stop} style={style}>{he ? 'עצירה' : 'Stop'}</Pill>
    : <Cta onClick={start} style={style}>{he ? 'התחלת כיוון' : 'Start tuning'}</Cta>;

  // Ruler −50…+50 cents
  const RW = 600, RX = 20, RSPAN = RW - RX * 2;
  const cx = (c: number) => RX + ((Math.max(-50, Math.min(50, c)) + 50) / 100) * RSPAN;

  return (
    <NightStage on={night}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="su-label">{he ? 'טיונר' : 'Tuner'} · {tuning.name}</span>
        <NightToggle on={night} onToggle={toggleNight} />
      </div>

      {/* The giant letter — readable from across the room */}
      <div ref={letterRef} aria-live="polite" style={{ textAlign: 'center', color: letterColor, transition: 'color .25s var(--ease)' }}>
        <PosterTitle head={letter} max={desktop ? 400 : 300} min={120} as="div"
          style={{ display: 'flex', justifyContent: 'center' }} />
      </div>

      <Meta items={[
        { label: 'Hz', value: display ? display.hz.toFixed(1) : (loudnessHint ? (he ? 'חזק יותר' : 'louder') : '—') },
        { label: he ? 'סנט' : 'Cents', value: readout },
        { label: he ? 'מיתר' : 'String', value: activeStringIdx >= 0 ? tuning.notes[activeStringIdx] : listening && nextString >= 0 ? tuning.notes[nextString] : '—' },
      ]} />

      {/* Ruler with the one cobalt needle */}
      <svg viewBox={`0 0 ${RW} 64`} role="img" aria-label={display ? `${readout}` : (he ? 'נגנו מיתר' : 'Play a string')}
        style={{ width: '100%', display: 'block', overflow: 'visible' }}>
        <line x1={RX} y1={30} x2={RW - RX} y2={30} stroke={T.text} strokeWidth={2} />
        {Array.from({ length: 21 }, (_, i) => -50 + i * 5).map(c => {
          const h = c % 25 === 0 ? 22 : c % 10 === 0 ? 14 : 8;
          return <line key={c} x1={cx(c)} y1={30 - h} x2={cx(c)} y2={30} stroke={c === 0 ? T.text : T.textMuted} strokeWidth={c === 0 ? 3 : 1.5} />;
        })}
        {[-50, -25, 0, 25, 50].map(c => (
          <text key={c} x={cx(c)} y={50} textAnchor="middle" fontSize={11} fill={T.textMuted} fontFamily="var(--gc-mono)" letterSpacing="0.06em">
            {c > 0 ? `+${c}` : c}
          </text>
        ))}
        {display && (
          <g style={{ transform: `translateX(${cx(cents)}px)`, transition: 'transform .3s cubic-bezier(.25,.1,.25,1)' }}>
            <rect x={-2.5} y={0} width={5} height={36} fill={T.primary} />
          </g>
        )}
      </svg>

      {/* Strings — tap one to hear its reference pitch */}
      <div>
        <p className="su-label" style={{ margin: '0 0 8px' }}>{he ? 'מיתרים' : 'Strings'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 4 }}>
          {STRING_LABELS.map((label, i) => {
            const active = activeStringIdx === i;
            const locked = tuned.has(i);
            const next = listening && !locked && i === nextString;
            return (
              <button key={label} className="gc-notation gc-no-bar" onClick={() => previewFret({ string: i, fret: 0 }, tuning.openFreqs)}
                aria-label={`${he ? 'השמע' : 'Hear'} ${tuning.notes[i] ?? label}${locked ? (he ? ', מכוון' : ', in tune') : ''}`}
                aria-pressed={active}
                style={{
                  ...keyStyle(active), minHeight: 64, flexDirection: 'column', gap: 2, letterSpacing: 'normal',
                  outline: next && !active ? `2px solid ${T.text}` : undefined, outlineOffset: -2,
                }}>
                <span style={{ fontSize: 24, lineHeight: 1 }}>{label}</span>
                <span key={locked ? 'l' : 'u'} className={locked ? 'gc-pop' : undefined}
                  style={{ fontFamily: 'var(--gc-mono)', fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, minHeight: 12, opacity: locked ? 1 : 0 }}>
                  OK
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 14, textAlign: 'center', fontFamily: 'var(--gc-mono)', fontSize: 11, color: T.textMuted, letterSpacing: '0.08em', position: 'relative', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {tuned.size === 6
            ? <Pill size="sm" onClick={() => { tunedRef.current = new Set(); setTuned(new Set()); }}>{he ? 'כיוון מחדש' : 'Tune again'}</Pill>
            : listening && nextString >= 0
              ? (he ? `הבא: נגנו את מיתר ${STRING_LABELS[nextString]} הפתוח` : `Next: play the open ${STRING_LABELS[nextString]} string`)
              : (he ? 'נגנו מיתר פתוח כדי לכוון אותו' : 'Play the open string to tune it')}
          {tuned.size === 6 && (
            <div className="gc-stamp su-poster" style={{
              position: 'absolute', left: '50%', top: -70, padding: '10px 18px 6px', border: `var(--su-rule) solid ${T.text}`,
              background: T.bgDeep, color: T.text, fontSize: 40, whiteSpace: 'nowrap',
            }}>{he ? 'מכוון' : 'Tuned'}</div>
          )}
        </div>
      </div>

      {error && <p role="alert" style={{ color: T.text, fontSize: 12, margin: 0 }}>{error}</p>}
      {/* Start / stop: in the top bar on desktop (always in view), a wide
          button at the bottom on the phone, under the thumb. */}
      {desktop ? <StopActions>{startStop({})}</StopActions> : (
        <div style={{ marginTop: 'auto' }}>{startStop({ width: '100%', height: 56 })}</div>
      )}
    </NightStage>
  );
};
