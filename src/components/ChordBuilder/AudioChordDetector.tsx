import { useState, useRef, useCallback, useEffect } from 'react';
import { Chord as TonalChord } from '@tonaljs/tonal';
import type { ChordInProgression } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { T, card } from '../../theme';

// ── DSP ───────────────────────────────────────────────────────────────────

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Build a raw 12-bin chroma vector from FFT data (no thresholds).
 *  Higher frequencies are gently rolled off so harmonics (which land at
 *  2×, 3×, 5× the fundamental) contribute less than the fundamentals. */
function rawChroma(
  data: Float32Array<ArrayBuffer>,
  sampleRate: number,
  fftSize: number,
): Float64Array {
  const binHz  = sampleRate / fftSize;
  const minBin = Math.max(1, Math.floor(70  / binHz));
  const maxBin = Math.min(data.length - 1, Math.ceil(2000 / binHz));
  const chroma = new Float64Array(12);
  for (let i = minBin; i <= maxBin; i++) {
    const db = data[i];
    if (db <= -100) continue;
    const freq = i * binHz;
    const midi = 12 * Math.log2(freq / 440) + 69;
    const pc   = ((Math.round(midi) % 12) + 12) % 12;
    // Steep rolloff above 350 Hz so harmonics are strongly suppressed:
    //   350 Hz → 1.0,  450 Hz → 0.5,  550 Hz → 0.25,  650 Hz → 0.17
    // Guitar fundamentals for open/1st-pos chords are all ≤ 330 Hz (E4),
    // while their 5th harmonics (which cause major-vs-minor confusion) are
    // at 5× = 660 Hz+ and end up at ≤ 0.17 weight — easily beaten by the
    // real chord tone played on a neighbouring string.
    const weight = 1 / (1 + Math.max(0, freq - 350) / 100);
    chroma[pc] += Math.pow(10, db / 20) * weight;
  }
  return chroma;
}

/**
 * Subtract the measured noise floor (with 1.5× safety margin) from a chroma vector.
 * Returns null when no pitch class rises meaningfully above the noise.
 */
function adjustedChroma(
  chroma: Float64Array,
  noiseFloor: Float64Array,
): Float64Array | null {
  const adj = new Float64Array(12);
  for (let i = 0; i < 12; i++) adj[i] = Math.max(0, chroma[i] - noiseFloor[i] * 1.5);

  const maxVal = Math.max(...adj);
  if (maxVal <= 0) return null;

  // Uniformity guard: a real note makes some buckets dominate.
  // Random noise leaves all buckets similar → reject.
  const sorted = Float64Array.from(adj).sort();
  const median = (sorted[5] + sorted[6]) / 2;
  if (median > 0 && maxVal / median < 3.0) return null;

  return adj;
}

/** Extract pitch classes present above 18 % of max, sorted strongest-first. */
function notesFromChroma(adj: Float64Array): string[] {
  const maxVal = Math.max(...adj);
  if (maxVal <= 0) return [];
  return Array.from({ length: 12 }, (_, i) => i)
    .filter(i => adj[i] / maxVal >= 0.18)
    .sort((a, b) => adj[b] - adj[a])
    .map(i => PITCH_CLASSES[i]);
}

/**
 * Score each candidate note as a potential root based on how many of the
 * other detected notes fall on musically expected chord intervals above it.
 * Returns the note most likely to be the root/bass.
 */
function pickLikelyRoot(notes: string[]): string {
  // Interval weights: how "root-defining" each interval is (semitones above root)
  const W: Record<number, number> = {
    0: 0,   // unison (skip self)
    7: 8,   // perfect 5th — strongest root indicator
    4: 6,   // major 3rd
    3: 6,   // minor 3rd
    11: 4,  // major 7th
    10: 4,  // minor 7th
    9: 2,   // major 6th
    2: 2,   // major 9th
    5: 1,   // perfect 4th (weaker)
    8: -1,  // augmented 5th / minor 6th (unusual)
    1: -2,  // minor 2nd (chromatic, very unusual)
    6: -2,  // tritone (very unusual)
  };
  let bestRoot = notes[0];
  let bestScore = -Infinity;
  for (const root of notes) {
    const rootIdx = PITCH_CLASSES.indexOf(root);
    let score = 0;
    for (const note of notes) {
      const interval = ((PITCH_CLASSES.indexOf(note) - rootIdx) + 12) % 12;
      score += W[interval] ?? 0;
    }
    if (score > bestScore) { bestScore = score; bestRoot = root; }
  }
  return bestRoot;
}

/**
 * Derive best chord name. Uses musical root-scoring to pick the right root,
 * then falls back through smaller note subsets if the full set has no match.
 */
function chordFromNotes(notes: string[]): string | null {
  if (notes.length < 2) return null;
  const likelyRoot = pickLikelyRoot(notes);

  const subsets = [notes, notes.slice(0, 5), notes.slice(0, 4), notes.slice(0, 3)];
  for (const subset of subsets) {
    if (subset.length < 2) break;
    const chords = TonalChord.detect(subset);
    if (chords.length === 0) continue;

    // First: find a chord whose root matches our musical root estimate
    const rootMatch = chords.find(c => c.match(/^([A-G][b#]?)/)?.[1] === likelyRoot);
    if (rootMatch) return rootMatch;

    // Fallback: prefer root-position (no slash), then shorter name
    return [...chords].sort((a, b) => {
      if (a.includes('/') !== b.includes('/')) return a.includes('/') ? 1 : -1;
      return a.length - b.length;
    })[0];
  }
  return null;
}

// ── Stability ─────────────────────────────────────────────────────────────

const CALIB_FRAMES = 10;   // 10 × 150 ms = 1.5 s calibration period
const HISTORY      = 5;    // frames needed to attempt lock
const STABLE_RATIO = 0.60; // note must appear in ≥ 60 % of sound frames

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  onAddToProgression: (item: ChordInProgression) => void;
}

export function AudioChordDetector({ onAddToProgression }: Props) {
  const [listening,    setListening]    = useState(false);
  const [calibrating,  setCalibrating]  = useState(false);
  const [stableChord,  setStableChord]  = useState<string | null>(null);
  const [liveNotes,    setLiveNotes]    = useState<string[]>([]);
  const [lockProgress, setLockProgress] = useState(0);
  const [error,        setError]        = useState<string | null>(null);
  const [added,        setAdded]        = useState(false);

  const ctxRef         = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const freqBufRef     = useRef<Float32Array<ArrayBuffer> | null>(null);
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calibBufRef    = useRef<Float64Array[]>([]);       // chroma frames during calibration
  const noiseFloorRef  = useRef<Float64Array | null>(null);// averaged calibration result
  const historyRef     = useRef<string[][]>([]);           // per-frame note arrays
  const silentRef      = useRef(0);                        // consecutive silent frames
  const lockedRef      = useRef(false);

  const analyze = useCallback(() => {
    if (!analyserRef.current || !freqBufRef.current || !ctxRef.current) return;
    analyserRef.current.getFloatFrequencyData(freqBufRef.current);

    if (!lockedRef.current) {
      const chroma = rawChroma(freqBufRef.current, ctxRef.current.sampleRate, analyserRef.current.fftSize);

      // ── Phase 1: Calibration — measure noise floor ──────────────────────
      if (!noiseFloorRef.current) {
        calibBufRef.current.push(chroma);
        if (calibBufRef.current.length >= CALIB_FRAMES) {
          const avg = new Float64Array(12);
          for (const c of calibBufRef.current) {
            for (let i = 0; i < 12; i++) avg[i] += c[i] / CALIB_FRAMES;
          }
          noiseFloorRef.current = avg;
          setCalibrating(false);
        }
        timerRef.current = setTimeout(analyze, 150);
        return;
      }

      // ── Phase 2: Detection — subtract noise floor ───────────────────────
      const adj        = adjustedChroma(chroma, noiseFloorRef.current);
      const frameNotes = adj ? notesFromChroma(adj) : [];

      if (frameNotes.length >= 2) {
        silentRef.current = 0;
        historyRef.current = [...historyRef.current, frameNotes].slice(-HISTORY);
        const filled = historyRef.current.length;
        setLockProgress(Math.min(99, Math.round((filled / HISTORY) * 100)));

        // Vote on individual pitch-classes
        const noteCounts = new Map<string, number>();
        for (const frame of historyRef.current) {
          for (const n of frame) noteCounts.set(n, (noteCounts.get(n) ?? 0) + 1);
        }
        const stableNotes = [...noteCounts.entries()]
          .filter(([, c]) => c / filled >= STABLE_RATIO)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([note]) => note);

        // Semitone conflict resolution: when two notes are 1 semitone apart,
        // the weaker one is almost certainly a phantom harmonic — drop it.
        const resolvedNotes = stableNotes.filter(note => {
          const idx   = PITCH_CLASSES.indexOf(note);
          const count = noteCounts.get(note) ?? 0;
          const lo    = PITCH_CLASSES[(idx + 11) % 12];
          const hi    = PITCH_CLASSES[(idx +  1) % 12];
          if (stableNotes.includes(lo) && (noteCounts.get(lo) ?? 0) > count * 1.3) return false;
          if (stableNotes.includes(hi) && (noteCounts.get(hi) ?? 0) > count * 1.3) return false;
          return true;
        });

        setLiveNotes(resolvedNotes);

        if (filled >= HISTORY) {
          const chord = chordFromNotes(resolvedNotes);
          if (chord) {
            lockedRef.current = true;
            setStableChord(chord);
            setLockProgress(100);
          }
          // No reset on failure — sliding window keeps trying
        }
      } else {
        silentRef.current += 1;
        if (silentRef.current >= 12) { // ~1.8 s of silence → clear stale history
          historyRef.current = [];
          silentRef.current  = 0;
          setLockProgress(0);
          setLiveNotes([]);
        }
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
      analyser.smoothingTimeConstant = 0.85;
      analyserRef.current = analyser;
      freqBufRef.current  = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>;
      ctx.createMediaStreamSource(stream).connect(analyser);

      calibBufRef.current   = [];
      noiseFloorRef.current = null;
      historyRef.current    = [];
      silentRef.current     = 0;
      lockedRef.current     = false;
      setStableChord(null);
      setLockProgress(0);
      setLiveNotes([]);
      setCalibrating(true);
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
    silentRef.current  = 0;
    setListening(false);
    setCalibrating(false);
    setLiveNotes([]);
    setLockProgress(0);
  }, []);

  const resetLock = () => {
    lockedRef.current  = false;
    historyRef.current = [];
    silentRef.current  = 0;
    // Keep noiseFloor — no need to re-calibrate for next chord
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
          {calibrating
            ? '🎙 מכייל מיקרופון — שמור על שקט...'
            : isLocked
              ? '🔒 אקורד זוהה — לחץ Add להוספה, או נגן אקורד חדש'
              : listening
                ? '🎸 נגן אקורד על הגיטרה ולחץ חזק…'
                : 'לחץ Start → שמור שקט → נגן אקורד → האפליקציה תנעל'}
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
          {calibrating ? (
            <span style={{ fontSize: 13, color: T.textDim }}>מכייל…</span>
          ) : isLocked ? (
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

        {/* Calibration progress */}
        {calibrating && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 5 }}>מכייל רעש רקע…</div>
            <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: T.textMuted, width: '100%', opacity: 0.4 }} />
            </div>
          </div>
        )}

        {/* Lock progress bar */}
        {listening && !isLocked && !calibrating && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 5 }}>
              {lockProgress > 0 ? `מייצב… ${lockProgress}%` : 'ממתין לאקורד'}
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
            marginBottom: isLocked ? 10 : 0,
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
        לחץ Start → שמור שקט בזמן הכיול → נגן אקורד · לחץ ↺ לאקורד חדש
      </p>
    </div>
  );
}
