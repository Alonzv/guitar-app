import { useState, useRef, useCallback, useEffect } from 'react';
import { Chord as TonalChord } from '@tonaljs/tonal';
import type { ChordInProgression } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { T, card } from '../../theme';

// ── DSP — Chromagram ──────────────────────────────────────────────────────
//
// Previous approach (peak-picking + harmonic scoring) had two fatal flaws:
//   1. Whether a harmonic was found depended on which peaks were in top-N,
//      making the score unstable frame-to-frame.
//   2. The 3rd harmonic of A2 (110 Hz) is at 330 Hz = E4, indistinguishable
//      from a real E string — no scoring trick can resolve this.
//
// Chromagram collapses every FFT bin into its pitch class (mod 12), so
// A2=110, A3=220, A4=440 Hz all accumulate into the same "A" bucket.
// A played note dominates its bucket regardless of which octave rings loudest.
// A false harmonic (e.g. A's 3rd harmonic → E bucket) contributes ≤15% of
// the maximum bucket energy and is filtered by the threshold below.

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function buildChroma(
  data: Float32Array<ArrayBuffer>,
  sampleRate: number,
  fftSize: number,
): Float64Array {
  const binHz  = sampleRate / fftSize;
  const minBin = Math.max(1, Math.floor(70  / binHz));   // just below E2 (82 Hz)
  const maxBin = Math.min(data.length - 1, Math.ceil(2000 / binHz));

  let maxDb = -Infinity;
  for (let i = minBin; i <= maxBin; i++) if (data[i] > maxDb) maxDb = data[i];
  if (maxDb < -58) return new Float64Array(12);           // silence

  const chroma = new Float64Array(12);
  for (let i = minBin; i <= maxBin; i++) {
    const db = data[i];
    if (db < maxDb - 40) continue;                        // skip bins > 40 dB below peak
    const freq = i * binHz;
    const midi  = 12 * Math.log2(freq / 440) + 69;
    const pc    = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += Math.pow(10, db / 20);                  // accumulate linear amplitude
  }
  return chroma;
}

/** Returns pitch classes present this frame, sorted by chroma energy (strongest = likely root). */
function detectNotes(
  data: Float32Array<ArrayBuffer>,
  sampleRate: number,
  fftSize: number,
): string[] {
  const chroma = buildChroma(data, sampleRate, fftSize);
  const maxVal = Math.max(...chroma);
  if (maxVal <= 0) return [];
  // 15 % threshold: real note harmonics contribute ≤ 12 % to other pitch classes
  return Array.from({ length: 12 }, (_, i) => i)
    .filter(i => chroma[i] / maxVal >= 0.15)
    .sort((a, b) => chroma[b] - chroma[a])               // strongest first = likely root
    .map(i => PITCH_CLASSES[i]);
}

/** Derive best chord name from a stable set of pitch classes. */
function chordFromNotes(notes: string[]): string | null {
  if (notes.length < 2) return null;
  const suspectedRoot = notes[0];                         // highest chroma = likely root/bass
  const chords = TonalChord.detect(notes);
  if (chords.length === 0) return null;
  const rootMatch = chords.find(c => {
    const m = c.match(/^([A-G][b#]?)/);
    return m && m[1] === suspectedRoot;
  });
  return rootMatch ?? chords[0];
}

// ── Stability ─────────────────────────────────────────────────────────────

const HISTORY      = 6;    // rolling window (~0.9 s at 150 ms / frame)
const STABLE_RATIO = 0.40; // note must appear in ≥ 40 % of frames to be "stable"

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
  const historyRef  = useRef<string[][]>([]);       // per-frame note arrays
  // When a chord is locked, ignore new frames until the user adds / resets it
  const lockedRef   = useRef(false);

  const analyze = useCallback(() => {
    if (!analyserRef.current || !freqBufRef.current || !ctxRef.current) return;

    analyserRef.current.getFloatFrequencyData(freqBufRef.current);

    if (!lockedRef.current) {
      // ── Collect this frame's notes ──────────────────────────────────────
      const frameNotes = detectNotes(
        freqBufRef.current,
        ctxRef.current.sampleRate,
        analyserRef.current.fftSize,
      );
      historyRef.current = [...historyRef.current, frameNotes].slice(-HISTORY);

      const filled = historyRef.current.length;
      // Show progress as % of window filled
      setLockProgress(Math.min(99, Math.round((filled / HISTORY) * 100)));

      // ── Vote on individual notes ─────────────────────────────────────────
      // A note is "stable" if it appeared in ≥ STABLE_RATIO of frames.
      // We vote on atomic pitch-classes, not derived chord names, so variation
      // in which inversion/name Chord.detect() picks doesn't matter.
      const noteCounts = new Map<string, number>();
      for (const frame of historyRef.current) {
        for (const n of frame) noteCounts.set(n, (noteCounts.get(n) ?? 0) + 1);
      }
      const stableNotes = [...noteCounts.entries()]
        .filter(([, c]) => c / filled >= STABLE_RATIO)
        .map(([note]) => note);

      // Show stable notes live while building up
      setLiveNotes(stableNotes);

      // ── Try to lock once the window is full ──────────────────────────────
      if (filled >= HISTORY) {
        const chord = chordFromNotes(stableNotes);
        if (chord) {
          lockedRef.current = true;
          setStableChord(chord);
          setLockProgress(100);
        } else {
          // Not enough stable notes — reset and listen for a new chord
          historyRef.current = [];
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
      analyser.smoothingTimeConstant = 0.85; // chroma benefits from stable FFT
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
