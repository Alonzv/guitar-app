import { useState, useRef, useCallback, useEffect } from 'react';
import { Chord as TonalChord } from '@tonaljs/tonal';
import type { ChordInProgression } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { T, card } from '../../theme';

// ── Pitch classes ─────────────────────────────────────────────────────────────
const PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'] as const;

// ── Chromagram settings ────────────────────────────────────────────────────────
const CHROMA_LO_HZ = 60;
const CHROMA_HI_HZ = 2000;
const MAG_GATE_DB  = -70;  // lenient gate — captures quieter guitar signals

// ── Stability settings ────────────────────────────────────────────────────────
const IIR_ALPHA    = 0.35;  // fast chroma convergence
const CONF_HISTORY = 4;     // ~600 ms before locking
const LOCK_CONF    = 0.45;  // confidence threshold to lock
const SILENT_RESET = 20;    // silent frames before clearing state

// ── Chord templates (12 roots × 19 types = 228) ───────────────────────────────
interface Template { name: string; pcs: number[]; w: number[] }

function buildTemplates(): Template[] {
  const IW: Record<number, number> = {
    0: 1.0, 2: 0.55, 3: 0.85, 4: 0.85, 5: 0.70,
    6: 0.50, 7: 0.45, 8: 0.60, 9: 0.60, 10: 0.75, 11: 0.75,
  };
  const TYPES: { s: string; iv: number[] }[] = [
    { s: '',      iv: [0,4,7]      }, { s: 'm',     iv: [0,3,7]      },
    { s: '7',     iv: [0,4,7,10]   }, { s: 'maj7',  iv: [0,4,7,11]   },
    { s: 'm7',    iv: [0,3,7,10]   }, { s: 'mMaj7', iv: [0,3,7,11]   },
    { s: 'sus2',  iv: [0,2,7]      }, { s: 'sus4',  iv: [0,5,7]      },
    { s: '7sus4', iv: [0,5,7,10]   }, { s: 'dim',   iv: [0,3,6]      },
    { s: 'dim7',  iv: [0,3,6,9]    }, { s: 'm7b5',  iv: [0,3,6,10]   },
    { s: 'aug',   iv: [0,4,8]      }, { s: '6',     iv: [0,4,7,9]    },
    { s: 'm6',    iv: [0,3,7,9]    }, { s: 'add9',  iv: [0,2,4,7]    },
    { s: '9',     iv: [0,2,4,7,10] }, { s: 'maj9',  iv: [0,2,4,7,11] },
    { s: 'm9',    iv: [0,2,3,7,10] },
  ];
  const out: Template[] = [];
  for (let root = 0; root < 12; root++) {
    for (const t of TYPES) {
      out.push({
        name: `${PC[root]}${t.s}`,
        pcs:  t.iv.map(iv => (root + iv) % 12),
        w:    t.iv.map(iv => IW[iv] ?? 0.5),
      });
    }
  }
  return out;
}
const TEMPLATES = buildTemplates();

// ── DSP helpers ───────────────────────────────────────────────────────────────

/**
 * Direct FFT → chromagram.
 * Each bin whose frequency is in range and level is above the gate
 * contributes its linear magnitude to the matching pitch class.
 * Summing across all octaves dilutes spectral leakage and captures
 * all harmonics of every string.
 */
function computeChroma(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  sampleRate: number,
  fftSize: number,
): Float64Array {
  const binHz  = sampleRate / fftSize;
  const chroma = new Float64Array(12);
  for (let i = 1; i < data.length; i++) {
    if (data[i] <= MAG_GATE_DB) continue;
    const freq = i * binHz;
    if (freq < CHROMA_LO_HZ || freq > CHROMA_HI_HZ) continue;
    const mag  = Math.pow(10, data[i] / 20);
    const midi = 12 * Math.log2(freq / 440) + 69;
    const pc   = ((Math.round(midi) % 12) + 12) % 12;
    // 1/f weighting: emphasises string fundamentals (low freq) over harmonics (high freq).
    // e.g. B2 (123 Hz) × 0.49  vs  A4 (440 Hz) × 0.14 — kills false harmonic PCs.
    chroma[pc] += mag * (CHROMA_LO_HZ / freq);
  }
  return chroma;
}

/**
 * Normalise chroma to [0,1] and reject silent / uniform frames.
 * No noise-floor subtraction — the hard gate + uniformity guard suffice.
 */
function cleanChroma(chroma: Float64Array): Float64Array | null {
  const maxVal = Math.max(...chroma);
  if (maxVal <= 0) return null;

  // Uniformity guard: silence/noise spreads energy evenly; chords don't.
  const sorted = [...chroma].sort((a, b) => a - b);
  const median = (sorted[5] + sorted[6]) / 2;
  if (median > 0 && maxVal / median < 2.5) return null;

  const norm = new Float64Array(12);
  for (let i = 0; i < 12; i++) norm[i] = chroma[i] / maxVal;
  return norm;
}

/** Weighted hit average minus off-template penalty. */
function scoreTemplates(chroma: Float64Array): { chord: string; score: number }[] {
  return TEMPLATES.map(t => {
    const inSet = new Set(t.pcs);
    let hitSum = 0, wSum = 0;
    for (let k = 0; k < t.pcs.length; k++) {
      hitSum += chroma[t.pcs[k]] * t.w[k];
      wSum   += t.w[k];
    }
    let penSum = 0, penCount = 0;
    for (let i = 0; i < 12; i++) {
      if (!inSet.has(i)) { penSum += chroma[i]; penCount++; }
    }
    const score = (hitSum / wSum) - 0.35 * (penSum / (penCount || 1));
    return { chord: t.name, score };
  }).sort((a, b) => b.score - a.score);
}

// ── Component ─────────────────────────────────────────────────────────────────

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

  const accumChromaRef = useRef<Float64Array>(new Float64Array(12));
  const confHistoryRef = useRef<number[]>([]);
  const silentRef      = useRef(0);
  const lockedRef      = useRef(false);
  const frameCountRef  = useRef(0);

  const analyze = useCallback(() => {
    if (!analyserRef.current || !freqBufRef.current || !ctxRef.current) return;
    analyserRef.current.getFloatFrequencyData(freqBufRef.current);

    if (!lockedRef.current) {
      frameCountRef.current++;
      const rawChroma = computeChroma(
        freqBufRef.current,
        ctxRef.current.sampleRate,
        analyserRef.current.fftSize,
      );
      const norm = cleanChroma(rawChroma);

      if (!norm) {
        silentRef.current++;
        if (frameCountRef.current % 5 === 0) {
          console.log(`[ACD] silent (${silentRef.current} frames)`);
        }
        if (silentRef.current >= SILENT_RESET) {
          accumChromaRef.current = new Float64Array(12);
          confHistoryRef.current = [];
          silentRef.current = 0;
          setLockProgress(0);
          setLiveNotes([]);
          console.log('[ACD] reset — silence timeout');
        }
        timerRef.current = setTimeout(analyze, 150);
        return;
      }

      silentRef.current = 0;

      // IIR blend
      const accum = accumChromaRef.current;
      for (let i = 0; i < 12; i++) {
        accum[i] = accum[i] * (1 - IIR_ALPHA) + norm[i] * IIR_ALPHA;
      }

      // Live notes
      const accumMax = Math.max(...accum);
      const liveNotesList = Array.from({ length: 12 }, (_, i) => i)
        .filter(i => accumMax > 0 && accum[i] / accumMax >= 0.30)
        .sort((a, b) => accum[b] - accum[a])
        .map(i => PC[i]);
      setLiveNotes(liveNotesList);

      const ranked = scoreTemplates(accum);
      const best   = ranked[0];
      const top3   = ranked.slice(0, 3);

      confHistoryRef.current = [...confHistoryRef.current, best.score].slice(-CONF_HISTORY);
      const avgConf = confHistoryRef.current.reduce((s, v) => s + v, 0) / confHistoryRef.current.length;
      const pct = Math.min(99, Math.round((avgConf / LOCK_CONF) * 100));
      setLockProgress(Math.max(0, pct));

      if (frameCountRef.current % 5 === 0) {
        const chromaStr = liveNotesList
          .map(n => `${n}:${accum[PC.indexOf(n as typeof PC[number])].toFixed(2)}`)
          .join(' ');
        console.log(`[ACD] chroma → ${chromaStr || '(none)'}`);
        console.log(`[ACD] top → ${top3.map(t => `${t.chord}(${t.score.toFixed(3)})`).join(' | ')}`);
        console.log(`[ACD] avgConf=${avgConf.toFixed(3)} / ${LOCK_CONF} → ${pct}%`);
      }

      if (confHistoryRef.current.length >= CONF_HISTORY && avgConf >= LOCK_CONF) {
        lockedRef.current = true;
        setStableChord(best.chord);
        setLockProgress(100);
        console.log(`[ACD] ✅ LOCKED → ${best.chord} (conf=${avgConf.toFixed(3)}, top3: ${top3.map(t => t.chord).join(' / ')})`);
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
      analyser.fftSize               = 16384;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;
      freqBufRef.current  = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>;
      ctx.createMediaStreamSource(stream).connect(analyser);

      accumChromaRef.current = new Float64Array(12);
      confHistoryRef.current = [];
      silentRef.current      = 0;
      lockedRef.current      = false;
      frameCountRef.current  = 0;

      setStableChord(null);
      setLockProgress(0);
      setLiveNotes([]);
      setListening(true);

      console.log(`[ACD] started — sampleRate=${ctx.sampleRate} fftSize=${analyser.fftSize} binHz=${(ctx.sampleRate / analyser.fftSize).toFixed(2)} gate=${MAG_GATE_DB}dB`);
      timerRef.current = setTimeout(analyze, 200);
    } catch {
      setError('Could not access microphone — allow permission and try again.');
    }
  }, [analyze]);

  const stopListening = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = analyserRef.current = freqBufRef.current = null;
    accumChromaRef.current = new Float64Array(12);
    confHistoryRef.current = [];
    silentRef.current = 0;
    console.log('[ACD] stopped');
    setListening(false);
    setLiveNotes([]);
    setLockProgress(0);
  }, []);

  const resetLock = () => {
    lockedRef.current      = false;
    accumChromaRef.current = new Float64Array(12);
    confHistoryRef.current = [];
    silentRef.current      = 0;
    setStableChord(null);
    setLockProgress(0);
    setLiveNotes([]);
    console.log('[ACD] reset — ready for next chord');
  };

  useEffect(() => () => { stopListening(); }, [stopListening]);

  const handleAdd = () => {
    if (!stableChord) return;
    const cleanName = formatChordName(stableChord);
    const info = TonalChord.get(cleanName);
    onAddToProgression({
      id: `chord-${Date.now()}`,
      chord: { name: cleanName, notes: info.notes ?? [], aliases: info.aliases ?? [] },
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
            ? 'Chord detected 🔒 — press Add to save, or play a new chord'
            : listening
              ? 'Play a chord and strum hard… 🎸'
              : 'Press Start → play a chord → the app will lock'}
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
              <span style={{ fontSize: 13, color: T.textDim }}>Waiting for sound…</span>
            )
          ) : (
            <span style={{ fontSize: 13, color: T.textDim }}>—</span>
          )}
        </div>

        {/* Lock progress bar */}
        {listening && !isLocked && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 5 }}>
              {lockProgress > 0 ? `Stabilizing… ${lockProgress}%` : 'Waiting for chord'}
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

        {/* Add + Reset */}
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
              {added ? '✓ Added' : `+ Add ${formatChordName(stableChord!)}`}
            </button>
            <button
              onClick={resetLock}
              style={{
                flex: 1, padding: '13px 0', borderRadius: 12,
                border: `1px solid ${T.border}`,
                background: T.bgInput, color: T.textMuted,
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
              title="New chord"
            >↺ New</button>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: T.textDim, textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
        Press Start → play a chord · press ↺ for a new chord
      </p>
    </div>
  );
}
