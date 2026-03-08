import { useState, useRef, useCallback, useEffect } from 'react';
import { Chord as TonalChord } from '@tonaljs/tonal';
import type { ChordInProgression } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { T, card } from '../../theme';

// ── DSP helpers ───────────────────────────────────────────────────────────

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function freqToPitchClass(freq: number): string {
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  return PITCH_CLASSES[((midi % 12) + 12) % 12];
}

interface Peak { freq: number; amp: number; }

function findPeaks(freqData: Float32Array<ArrayBuffer>, sampleRate: number, fftSize: number): Peak[] {
  const binHz = sampleRate / fftSize;
  const minBin = Math.max(3, Math.floor(75 / binHz));   // 75 Hz  (below open low-E)
  const maxBin = Math.min(freqData.length - 3, Math.ceil(1400 / binHz)); // 1400 Hz
  const THRESHOLD_DB = -52;
  const peaks: Peak[] = [];

  for (let i = minBin; i <= maxBin; i++) {
    const v = freqData[i];
    if (
      v > THRESHOLD_DB &&
      v >= freqData[i - 1] && v >= freqData[i + 1] &&
      v >= freqData[i - 2] && v >= freqData[i + 2]
    ) {
      peaks.push({ freq: i * binHz, amp: v });
    }
  }
  return peaks;
}

function suppressHarmonics(peaks: Peak[]): Peak[] {
  // Sort strongest first
  const sorted = [...peaks].sort((a, b) => b.amp - a.amp);
  const isHarmonic = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (isHarmonic.has(j)) continue;
      const ratio = sorted[j].freq / sorted[i].freq;
      // If freq j ≈ 2×, 3×, 4×, or 5× of freq i → it's a harmonic
      if ([2, 3, 4, 5].some(n => Math.abs(ratio - n) < 0.08)) {
        isHarmonic.add(j);
      }
    }
  }
  return sorted.filter((_, i) => !isHarmonic.has(i));
}

function detectFromFFT(freqData: Float32Array<ArrayBuffer>, sampleRate: number, fftSize: number) {
  const peaks = findPeaks(freqData, sampleRate, fftSize);
  if (peaks.length === 0) return { notes: [] as string[], chord: null as string | null };

  // Keep top 8 by amplitude, suppress harmonics
  const top8 = [...peaks].sort((a, b) => b.amp - a.amp).slice(0, 8);
  const fundamentals = suppressHarmonics(top8).slice(0, 5);

  const pitchClasses = [...new Set(fundamentals.map(p => freqToPitchClass(p.freq)))];
  if (pitchClasses.length < 2) return { notes: pitchClasses, chord: null };

  const chords = TonalChord.detect(pitchClasses);
  return { notes: pitchClasses, chord: chords[0] ?? null };
}

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  onAddToProgression: (item: ChordInProgression) => void;
}

export function AudioChordDetector({ onAddToProgression }: Props) {
  const [listening, setListening]       = useState(false);
  const [detectedNotes, setDetectedNotes] = useState<string[]>([]);
  const [detectedChord, setDetectedChord] = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [added, setAdded]               = useState(false);

  // Use a dedicated AudioContext (separate from playback) to avoid interference
  const ctxRef      = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const freqBufRef  = useRef<Float32Array<ArrayBuffer> | null>(null);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyze = useCallback(() => {
    if (!analyserRef.current || !freqBufRef.current || !ctxRef.current) return;
    analyserRef.current.getFloatFrequencyData(freqBufRef.current);
    const { notes, chord } = detectFromFFT(
      freqBufRef.current,
      ctxRef.current.sampleRate,
      analyserRef.current.fftSize,
    );
    setDetectedNotes(notes);
    setDetectedChord(chord);
    timerRef.current = setTimeout(analyze, 180);
  }, []);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass() as AudioContext;
      ctxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      freqBufRef.current = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>;

      // Mic → Analyser only. NOT connected to any output → zero feedback risk.
      ctx.createMediaStreamSource(stream).connect(analyser);

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
    ctxRef.current = null;
    analyserRef.current = null;
    freqBufRef.current = null;
    setListening(false);
    setDetectedNotes([]);
    setDetectedChord(null);
  }, []);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  const handleAdd = () => {
    if (!detectedChord) return;
    const info = TonalChord.get(detectedChord);
    onAddToProgression({
      id: `chord-${Date.now()}`,
      chord: { name: detectedChord, notes: info.notes ?? [], aliases: info.aliases ?? [] },
      fretPositions: [],
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const LABEL_STYLE = {
    margin: '0 0 12px', fontSize: 11, fontWeight: 700 as const,
    color: T.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card()}>
        <p style={LABEL_STYLE}>Audio Chord Detection</p>

        <p style={{ margin: '0 0 16px', fontSize: 13, color: T.textMuted, lineHeight: 1.5 }}>
          {listening
            ? '🎸 נגן אקורד — לחץ חזק ומישור'
            : 'לחץ Start, נגן אקורד על הגיטרה, והאפליקציה תזהה אותו בזמן אמת'}
        </p>

        {/* Detected notes */}
        {listening && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 34, marginBottom: 14 }}>
            {detectedNotes.length > 0
              ? detectedNotes.map(n => (
                  <span key={n} style={{
                    padding: '3px 11px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                    background: T.bgInput, border: `1px solid ${T.border}`, color: T.text, direction: 'ltr',
                  }}>{n}</span>
                ))
              : <span style={{ fontSize: 12, color: T.textDim }}>ממתין לצליל…</span>
            }
          </div>
        )}

        {/* Large chord display */}
        {listening && (
          <div style={{
            minHeight: 88, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 12, background: T.bgDeep, border: `1px solid ${T.border}`, marginBottom: 14,
          }}>
            {detectedChord ? (
              <span style={{ fontSize: 46, fontWeight: 800, color: T.primary, direction: 'ltr' }}>
                {formatChordName(detectedChord)}
              </span>
            ) : (
              <span style={{ fontSize: 13, color: T.textDim }}>
                {detectedNotes.length >= 2 ? 'אקורד לא מזוהה' : '…'}
              </span>
            )}
          </div>
        )}

        {error && (
          <p style={{ margin: '0 0 12px', fontSize: 12, color: T.coral }}>{error}</p>
        )}

        <button
          onClick={listening ? stopListening : startListening}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
            background: listening ? T.coral : T.primary,
            color: T.white, fontWeight: 800, fontSize: 16, cursor: 'pointer',
            transition: 'background 0.2s',
            marginBottom: detectedChord ? 10 : 0,
          }}
        >
          {listening ? '■  Stop' : '🎙  Start Listening'}
        </button>

        {detectedChord && (
          <button
            onClick={handleAdd}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 12,
              border: `1px solid ${T.secondary}`,
              background: added ? T.secondaryBg : 'transparent',
              color: T.secondary, fontWeight: 700, fontSize: 14, cursor: 'pointer',
              transition: 'all 0.15s', direction: 'ltr',
            }}
          >
            {added
              ? `✓ ${formatChordName(detectedChord)} נוסף`
              : `+ Add ${formatChordName(detectedChord)} to Progression`}
          </button>
        )}
      </div>

      <p style={{ fontSize: 11, color: T.textDim, textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
        מומלץ לנגן בסביבה שקטה ולהחזיק את הטלפון קרוב לגיטרה
      </p>
    </div>
  );
}
