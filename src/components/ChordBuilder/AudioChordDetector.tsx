import { useState, useRef, useCallback, useEffect } from 'react';
import { Chord as TonalChord } from '@tonaljs/tonal';
import type { ChordInProgression } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { T, card } from '../../theme';

// ── DSP ───────────────────────────────────────────────────────────────────

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function freqToPitchClass(freq: number): string {
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  return PITCH_CLASSES[((midi % 12) + 12) % 12];
}

interface Peak { freq: number; amp: number; }

function findRawPeaks(data: Float32Array<ArrayBuffer>, sampleRate: number, fftSize: number): Peak[] {
  const binHz = sampleRate / fftSize;
  const minBin = Math.max(4, Math.floor(75  / binHz));
  const maxBin = Math.min(data.length - 4, Math.ceil(1400 / binHz));

  // Adaptive threshold: find the loudest bin in the guitar range first.
  // Peaks must be within 26 dB of that maximum — this adapts to any mic level.
  let maxAmp = -Infinity;
  for (let i = minBin; i <= maxBin; i++) if (data[i] > maxAmp) maxAmp = data[i];
  if (maxAmp < -62) return []; // absolute silence / no signal at all
  const THRESHOLD = Math.max(-75, maxAmp - 26);

  const peaks: Peak[] = [];
  for (let i = minBin + 3; i <= maxBin - 3; i++) {
    const v = data[i];
    if (
      v > THRESHOLD &&
      v >= data[i-1] && v >= data[i+1] &&
      v >= data[i-2] && v >= data[i+2] &&
      v >= data[i-3] && v >= data[i+3]
    ) {
      peaks.push({ freq: i * binHz, amp: v });
    }
  }
  return peaks;
}

/**
 * Score peaks by harmonic support: a peak that has other peaks at 2×, 3×, 4×, 5× above it
 * is likely a FUNDAMENTAL (not a harmonic itself). This reverses the guitar problem where
 * the 2nd harmonic is often louder than the fundamental.
 */
function selectFundamentals(peaks: Peak[]): Peak[] {
  if (peaks.length === 0) return [];

  const scored = peaks.map(p => {
    const harmonicsAbove = peaks.filter(q =>
      q.freq > p.freq &&
      [2, 3, 4, 5].some(n => Math.abs(q.freq / p.freq - n) < 0.07)
    ).length;
    // Peaks with harmonics score higher; amplitude as tie-breaker
    return { ...p, score: harmonicsAbove * 20 + (p.amp + 100) };
  });

  scored.sort((a, b) => b.score - a.score);

  // Greedily collect fundamentals — skip anything that is a harmonic of a chosen fundamental
  const chosen: Peak[] = [];
  for (const c of scored) {
    if (chosen.length >= 4) break;
    const isHarmonic = chosen.some(f =>
      [2, 3, 4, 5].some(n => Math.abs(c.freq / f.freq - n) < 0.07)
    );
    if (!isHarmonic) chosen.push(c);
  }
  return chosen;
}

function detectFrame(
  data: Float32Array<ArrayBuffer>,
  sampleRate: number,
  fftSize: number,
): string | null {
  const rawPeaks = findRawPeaks(data, sampleRate, fftSize);
  const top12    = [...rawPeaks].sort((a, b) => b.amp - a.amp).slice(0, 12);
  const funds    = selectFundamentals(top12);
  const notes    = [...new Set(funds.map(p => freqToPitchClass(p.freq)))];
  if (notes.length < 2) return null;
  const chords   = TonalChord.detect(notes);
  return chords[0] ?? null;
}

// ── Stability ─────────────────────────────────────────────────────────────

const HISTORY    = 12;  // rolling window length
const LOCK_AT    = 5;   // chord must appear ≥ 5 / 12 frames to lock

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  onAddToProgression: (item: ChordInProgression) => void;
}

export function AudioChordDetector({ onAddToProgression }: Props) {
  const [listening,    setListening]    = useState(false);
  const [stableChord,  setStableChord]  = useState<string | null>(null);
  const [liveNotes,    setLiveNotes]    = useState<string[]>([]);
  const [lockProgress, setLockProgress] = useState(0);
  const [error,        setError]        = useState<string | null>(null);
  const [added,        setAdded]        = useState(false);

  const ctxRef      = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const freqBufRef  = useRef<Float32Array<ArrayBuffer> | null>(null);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef  = useRef<(string | null)[]>([]);
  // When a chord is locked, ignore new frames until the user adds / resets it
  const lockedRef   = useRef(false);

  const analyze = useCallback(() => {
    if (!analyserRef.current || !freqBufRef.current || !ctxRef.current) return;

    analyserRef.current.getFloatFrequencyData(freqBufRef.current);

    if (!lockedRef.current) {
      const chord = detectFrame(freqBufRef.current, ctxRef.current.sampleRate, analyserRef.current.fftSize);

      // Update rolling history
      historyRef.current = [...historyRef.current, chord].slice(-HISTORY);

      // Vote: find most frequent chord in history
      const counts = new Map<string, number>();
      for (const c of historyRef.current) {
        if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      let bestChord: string | null = null;
      let bestCount = 0;
      for (const [c, n] of counts) {
        if (n > bestCount) { bestChord = c; bestCount = n; }
      }

      const progress = Math.min(100, Math.round((bestCount / LOCK_AT) * 100));
      setLockProgress(progress);

      if (bestCount >= LOCK_AT && bestChord) {
        // Lock — freeze the display until user acts
        lockedRef.current = true;
        setStableChord(bestChord);
        setLockProgress(100);
      } else {
        // Show live notes while building up
        const rawPeaks = findRawPeaks(freqBufRef.current, ctxRef.current.sampleRate, analyserRef.current.fftSize);
        const top = [...rawPeaks].sort((a, b) => b.amp - a.amp).slice(0, 12);
        const notes = [...new Set(selectFundamentals(top).map(p => freqToPitchClass(p.freq)))];
        setLiveNotes(notes);
      }
    }

    timerRef.current = setTimeout(analyze, 150);
  }, []);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      streamRef.current = stream;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      freqBufRef.current = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>;

      // Mic → Analyser only. NOT → output → zero feedback.
      ctx.createMediaStreamSource(stream).connect(analyser);

      historyRef.current = [];
      lockedRef.current  = false;
      setStableChord(null);
      setLockProgress(0);
      setLiveNotes([]);
      setListening(true);
      timerRef.current = setTimeout(analyze, 200);
    } catch {
      setError('לא ניתן לגשת למיקרופון — אשר הרשאה ונסה שוב.');
    }
  }, [analyze]);

  const stopListening = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = analyserRef.current = freqBufRef.current = null;
    historyRef.current = [];
    setListening(false);
    setLiveNotes([]);
    setLockProgress(0);
    // stableChord kept intentionally — user can still tap Add after stopping
  }, []);

  // Reset lock so user can detect a new chord (without stopping mic)
  const resetLock = () => {
    lockedRef.current = false;
    historyRef.current = [];
    setStableChord(null);
    setLockProgress(0);
    setLiveNotes([]);
  };

  useEffect(() => () => { stopListening(); }, [stopListening]);

  const handleAdd = () => {
    if (!stableChord) return;
    const info = TonalChord.get(stableChord);
    onAddToProgression({
      id: `chord-${Date.now()}`,
      chord: { name: stableChord, notes: info.notes ?? [], aliases: info.aliases ?? [] },
      fretPositions: [],
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
    resetLock();
  };

  const isLocked = stableChord !== null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Audio Chord Detection
        </p>

        <p style={{ margin: '0 0 14px', fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>
          {isLocked
            ? '🔒 אקורד זוהה — לחץ Add להוספה, או נגן אקורד חדש'
            : listening
              ? '🎸 נגן אקורד על הגיטרה ולחץ חזק…'
              : 'לחץ Start → נגן אקורד → האפליקציה תתייצב ותנעל'}
        </p>

        {/* Main chord display */}
        <div style={{
          minHeight: 110, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 6,
          borderRadius: 14,
          background: isLocked ? T.primaryBg : T.bgDeep,
          border: `2px solid ${isLocked ? T.primary : T.border}`,
          marginBottom: 14, padding: '14px 0',
          transition: 'all 0.3s',
        }}>
          {isLocked ? (
            <>
              <span style={{ fontSize: 50, fontWeight: 800, color: T.primary, direction: 'ltr' }}>
                {formatChordName(stableChord!)}
              </span>
              <span style={{ fontSize: 11, color: T.primary, fontWeight: 700, letterSpacing: '0.04em' }}>
                🔒 LOCKED
              </span>
            </>
          ) : listening ? (
            liveNotes.length > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', padding: '0 12px' }}>
                {liveNotes.map(n => (
                  <span key={n} style={{
                    padding: '4px 12px', borderRadius: 7, fontSize: 15, fontWeight: 600,
                    background: T.bgInput, border: `1px solid ${T.border}`, color: T.text, direction: 'ltr',
                  }}>{n}</span>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 13, color: T.textDim }}>ממתין לצליל…</span>
            )
          ) : (
            <span style={{ fontSize: 13, color: T.textDim }}>—</span>
          )}
        </div>

        {/* Lock progress bar */}
        {listening && !isLocked && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 5 }}>
              {lockProgress > 0 ? `מייצב… ${lockProgress}%` : 'ממתין לאקורד יציב'}
            </div>
            <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${lockProgress}%`,
                background: T.primary,
                transition: 'width 0.2s',
              }} />
            </div>
          </div>
        )}

        {error && <p style={{ margin: '0 0 12px', fontSize: 12, color: T.coral }}>{error}</p>}

        {/* Start / Stop */}
        <button
          onClick={listening ? stopListening : startListening}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
            background: listening ? T.coral : T.primary,
            color: T.white, fontWeight: 800, fontSize: 16, cursor: 'pointer',
            transition: 'background 0.2s',
            marginBottom: (isLocked) ? 10 : 0,
          }}
        >
          {listening ? '■  Stop' : '🎙  Start Listening'}
        </button>

        {/* Add + Reset (only when locked) */}
        {isLocked && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleAdd}
              style={{
                flex: 3, padding: '13px 0', borderRadius: 12,
                border: `1px solid ${T.secondary}`,
                background: added ? T.secondaryBg : T.secondary,
                color: added ? T.secondary : T.white,
                fontWeight: 800, fontSize: 15, cursor: 'pointer',
                transition: 'all 0.15s', direction: 'ltr',
              }}
            >
              {added ? `✓ נוסף!` : `+ Add ${formatChordName(stableChord!)}`}
            </button>
            <button
              onClick={resetLock}
              style={{
                flex: 1, padding: '13px 0', borderRadius: 12,
                border: `1px solid ${T.border}`,
                background: T.bgInput, color: T.textMuted,
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
              title="זיהוי אקורד חדש"
            >↺ חדש</button>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: T.textDim, textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
        נגן בסביבה שקטה · האקורד נועל לאחר זיהוי יציב · לחץ ↺ לזיהוי אקורד חדש
      </p>
    </div>
  );
}
