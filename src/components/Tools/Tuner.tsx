import React, { useState, useRef, useCallback, useEffect } from 'react';
import { riseIn, breathe, useOnChange } from '../../utils/motion';
import { T } from '../../theme';
import type { Tuning } from '../../types/music';
import { TUNINGS } from '../../utils/musicTheory';
import { useLang } from '../../contexts/LanguageContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { StopActions } from '../Transit/StopActions';
import { getSharedContext, unlockAudio, setMicSession, clearMicSession } from '../../utils/audioPlayback';
import { previewFret } from '../../utils/previewSound';
import { detectPitch } from '../../utils/pitch';
import { chime } from '../../practice/feedback';

const noteName = (s: string) => s.replace(/\d/g, '');

interface Props { tuning?: Tuning; onTuningChange?: (t: Tuning) => void }

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

export const Tuner: React.FC<Props> = ({ tuning = TUNINGS[0], onTuningChange }) => {
  const { lang } = useLang();
  const he = lang === 'he';
  const desktop = useIsDesktop();
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
  const shownIdx = activeStringIdx >= 0 ? activeStringIdx : nextString >= 0 ? nextString : 0;

  // In tune within ±5 cents: the note, the ring and the bead turn green.
  const inTune = !!display && absCents <= 5;
  // Idle, the letter shows the string to play next, dimmed.
  const letter = display ? display.note : noteName(tuning.notes[shownIdx] ?? STRING_LABELS[shownIdx]);
  const octave = (tuning.notes[shownIdx] ?? '').replace(/\D/g, '');
  // A new string: the letter rises from below. Landing in tune on the same
  // string: it breathes once.
  const letterRef = useRef<HTMLDivElement>(null);
  useOnChange(`${letter}|${inTune}`, (prev, next) => {
    const [pl, pt] = prev.split('|'), [nl, nt] = next.split('|');
    if (pl !== nl) riseIn(letterRef.current);
    else if (pt === 'false' && nt === 'true') breathe(letterRef.current);
  });

  const allDone = tuned.size === 6;
  const status = !listening
    ? (he ? 'מוכנים לכוון' : 'Ready to tune')
    : !display ? (loudnessHint ? (he ? 'קצת יותר חזק' : 'A little louder') : (he ? 'מקשיבים…' : 'Listening…'))
    : inTune ? (he ? 'מכוון' : 'In tune')
    : he ? `${cents > 0 ? '+' : '−'}${absCents} סנט` : `${cents > 0 ? '+' : '−'}${absCents} cents`;
  const advice = allDone
    ? (he ? 'כל שישת המיתרים מכוונים.' : 'All six strings are in tune.')
    : !display
      ? (he ? `נגנו את מיתר ${STRING_LABELS[shownIdx]} הפתוח.` : `Play the open ${STRING_LABELS[shownIdx]} string.`)
      : inTune ? (he ? 'עוברים למיתר הבא.' : 'Pluck the next string.')
      : cents > 0 ? (he ? 'קצת גבוה. משחררים מעט.' : 'A little sharp. Loosen slightly.')
      : (he ? 'קצת נמוך. מותחים מעט.' : 'A little flat. Tighten slightly.');

  const IN_TUNE = '#30D158';
  // The pitch track: −50…+50 cents across the width, the bead rides on it.
  const beadPct = 50 + Math.max(-50, Math.min(50, cents));

  const startStop = listening
    ? <button onClick={stop} className="gc-no-bar" style={{ height: 50, padding: '0 26px', borderRadius: 25, background: 'rgba(255,255,255,0.08)', color: T.text, fontSize: 17, fontWeight: 600 }}>{he ? 'עצירה' : 'Stop'}</button>
    : <button onClick={start} className="gc-no-bar" style={{ height: 50, padding: '0 28px', borderRadius: 25, background: T.text, color: '#000', fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        {he ? 'התחלת כיוון' : 'Start tuning'}
      </button>;

  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, width: '100%', maxWidth: 560, margin: '0 auto', flex: 1 }}>
      {/* Tuning, in the glass toolbar */}
      <StopActions>
        {onTuningChange ? (
          <label className="lg" style={{ height: 44, borderRadius: 22, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 0 16px', fontSize: 14, fontWeight: 600, position: 'relative' }}>
            <span>{tuning.label ?? tuning.name} · 440 Hz</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
            <select aria-label={he ? 'כיוון' : 'Tuning'} value={tuning.name}
              onChange={e => { const t = TUNINGS.find(x => x.name === e.target.value); if (t) { onTuningChange(t); tunedRef.current = new Set(); setTuned(new Set()); } }}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}>
              {TUNINGS.map(t => <option key={t.name} value={t.name}>{t.label ?? t.name}</option>)}
            </select>
          </label>
        ) : null}
      </StopActions>

      {/* The note — readable from across the room */}
      <div ref={letterRef} role="status" aria-live="polite" aria-label={`${letter}${octave}, ${status}`}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: desktop ? 8 : 0 }}>
        <span className="gc-notation" dir="ltr" style={{
          fontFamily: 'var(--su-display)', fontSize: desktop ? 200 : 168, lineHeight: desktop ? '206px' : '176px', fontWeight: 700, letterSpacing: '-0.05em',
          color: inTune ? IN_TUNE : display ? T.text : T.textMuted, transition: 'color .3s var(--ease)',
        }}>
          {letter}<span style={{ fontSize: 36, fontWeight: 600, color: T.textDim, letterSpacing: 0 }}>{display ? '' : octave}</span>
        </span>
        <span dir="ltr" style={{ fontSize: 15, color: T.textMuted }}>
          {display ? `${display.hz.toFixed(1)} Hz` : `${(tuning.openFreqs[shownIdx] ?? 0).toFixed(1)} Hz`}
        </span>
      </div>

      {/* Pitch track: flat on the left, sharp on the right, a ring at zero */}
      <div dir="ltr" aria-hidden style={{ position: 'relative', width: '100%', maxWidth: 400, height: 76 }}>
        <span style={{ position: 'absolute', left: 0, right: 0, top: 29, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.22)' }} />
        {[-50, -40, -30, -20, -10, 10, 20, 30, 40, 50].map(c => {
          const major = Math.abs(c) === 50;
          return <span key={c} style={{ position: 'absolute', left: `calc(${50 + c}% - 1px)`, top: major ? 20 : 24, width: 2, height: major ? 20 : 12, borderRadius: 1, background: major ? 'rgba(235,235,245,0.3)' : 'rgba(255,255,255,0.12)' }} />;
        })}
        <span style={{ position: 'absolute', left: 'calc(50% - 24px)', top: 6, width: 48, height: 48, borderRadius: 24, boxShadow: `inset 0 0 0 2px ${inTune ? IN_TUNE : 'rgba(255,255,255,0.25)'}`, transition: 'box-shadow .3s' }} />
        {display && (
          <span style={{
            position: 'absolute', left: `calc(${beadPct}% - 18px)`, top: 12, width: 36, height: 36, borderRadius: 18,
            background: inTune ? IN_TUNE : T.text, boxShadow: 'inset 0 1px 0.5px rgba(255,255,255,0.6)',
            transition: 'left .35s cubic-bezier(.2,.8,.2,1), background .3s',
          }} />
        )}
        <span style={{ position: 'absolute', left: 0, top: 56, fontSize: 13, fontWeight: 600, color: T.textDim }}>♭ {he ? 'נמוך' : 'flat'}</span>
        <span style={{ position: 'absolute', right: 0, top: 56, fontSize: 13, fontWeight: 600, color: T.textDim }}>{he ? 'גבוה' : 'sharp'} ♯</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textAlign: 'center', marginTop: -8 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: inTune ? IN_TUNE : T.text }}>{status}</span>
        <span style={{ fontSize: 15, color: T.textMuted }}>{advice}</span>
      </div>

      {/* Strings — tap one to hear its reference pitch */}
      <div role="group" aria-label={he ? 'מיתרים' : 'Strings'} dir="ltr"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8, width: '100%', maxWidth: 420 }}>
        {STRING_LABELS.map((label, i) => {
          const on = i === activeStringIdx || (!display && listening && i === nextString);
          const done = tuned.has(i);
          return (
            <button key={i} className="gc-notation gc-no-bar" onClick={() => previewFret({ string: i, fret: 0 }, tuning.openFreqs)}
              aria-label={`${he ? 'השמע' : 'Hear'} ${tuning.notes[i] ?? label}${done ? (he ? ', מכוון' : ', in tune') : ''}`}
              aria-pressed={on}
              style={{
                position: 'relative', height: 50, borderRadius: 25, fontSize: 17, fontWeight: 700,
                background: on ? T.text : 'rgba(255,255,255,0.08)', color: on ? '#000' : T.text,
              }}>
              {noteName(tuning.notes[i] ?? label)}
              {done && !on && (
                <span aria-hidden className="gc-pop" style={{
                  position: 'absolute', right: -3, top: -3, width: 18, height: 18, borderRadius: 9, background: IN_TUNE,
                  boxShadow: `0 0 0 2px ${T.bgDeep}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && <p role="alert" style={{ color: T.text, fontSize: 15, margin: 0, textAlign: 'center' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 12, marginTop: desktop ? 4 : 'auto', paddingBottom: 8 }}>
        {startStop}
        {allDone && (
          <button onClick={() => { tunedRef.current = new Set(); setTuned(new Set()); }} className="gc-no-bar"
            style={{ height: 50, padding: '0 22px', borderRadius: 25, background: 'rgba(255,255,255,0.08)', color: T.text, fontSize: 17, fontWeight: 600 }}>
            {he ? 'כיוון מחדש' : 'Tune again'}
          </button>
        )}
      </div>
    </div>
  );
};
