import { useState, useRef, useCallback, useEffect } from 'react';
import { Chord as TonalChord } from '@tonaljs/tonal';
import type { ChordInProgression } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { T, card } from '../../theme';

// ── Pitch classes ─────────────────────────────────────────────────────────────
const PC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'] as const;

// ── HPS settings ──────────────────────────────────────────────────────────────
// Harmonic Product Spectrum: multiply the spectrum with downsampled copies of
// itself. Each harmonic of a fundamental appears as a peak at every harmonic
// order, so the product naturally emphasises fundamentals over harmonics.
const HPS_H     = 5;    // number of harmonic layers to multiply
const HPS_LO_HZ = 60;   // below open low-E (~82 Hz)
const HPS_HI_HZ = 600;  // above highest open string (E4 = 330 Hz, with margin)

// ── Stability settings ────────────────────────────────────────────────────────
const CALIB_FRAMES  = 10;   // frames to measure noise floor  (10 × 150 ms = 1.5 s)
const IIR_ALPHA     = 0.22; // new-frame weight in decaying chroma average
const CONF_HISTORY  = 6;    // rolling window of confidence scores
const LOCK_CONF     = 0.52; // avg confidence threshold to lock
const SILENT_RESET  = 15;   // consecutive silent frames before clearing (~2.3 s)

// ── Chord templates (12 roots × 19 types = 228 templates) ────────────────────
interface Template { name: string; pcs: number[]; w: number[] }

function buildTemplates(): Template[] {
  // How "defining" is each interval above the root?
  // Root and 3rd matter most; 5th is nearly universal so less distinguishing.
  const IW: Record<number, number> = {
    0: 1.0,   // root
    2: 0.55,  // major 2nd / 9th
    3: 0.85,  // minor 3rd
    4: 0.85,  // major 3rd
    5: 0.70,  // perfect 4th
    6: 0.50,  // tritone / dim 5th
    7: 0.45,  // perfect 5th (universal, low discrimination)
    8: 0.60,  // augmented 5th
    9: 0.60,  // major 6th / dim 7th
    10: 0.75, // minor 7th
    11: 0.75, // major 7th
  };

  const TYPES: { s: string; iv: number[] }[] = [
    { s: '',      iv: [0,4,7]         }, // major
    { s: 'm',     iv: [0,3,7]         }, // minor
    { s: '7',     iv: [0,4,7,10]      }, // dominant 7
    { s: 'maj7',  iv: [0,4,7,11]      }, // major 7
    { s: 'm7',    iv: [0,3,7,10]      }, // minor 7
    { s: 'mMaj7', iv: [0,3,7,11]      }, // minor major 7
    { s: 'sus2',  iv: [0,2,7]         }, // sus 2
    { s: 'sus4',  iv: [0,5,7]         }, // sus 4
    { s: '7sus4', iv: [0,5,7,10]      }, // 7sus4
    { s: 'dim',   iv: [0,3,6]         }, // diminished
    { s: 'dim7',  iv: [0,3,6,9]       }, // diminished 7
    { s: 'm7b5',  iv: [0,3,6,10]      }, // half-diminished
    { s: 'aug',   iv: [0,4,8]         }, // augmented
    { s: '6',     iv: [0,4,7,9]       }, // major 6
    { s: 'm6',    iv: [0,3,7,9]       }, // minor 6
    { s: 'add9',  iv: [0,2,4,7]       }, // add 9
    { s: '9',     iv: [0,2,4,7,10]    }, // dominant 9
    { s: 'maj9',  iv: [0,2,4,7,11]    }, // major 9
    { s: 'm9',    iv: [0,2,3,7,10]    }, // minor 9
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

const TEMPLATES = buildTemplates(); // built once at module load

// ── DSP helpers ───────────────────────────────────────────────────────────────

/**
 * Harmonic Product Spectrum chromagram.
 * For each candidate fundamental bin, multiply its magnitude with the
 * magnitudes at 2×, 3×, 4×, 5× that frequency. Real fundamentals
 * produce a strong product; harmonics of other notes do not.
 * Returns a raw (un-normalised) 12-bin pitch-class accumulation.
 */
function computeHPSChroma(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  sampleRate: number,
  fftSize: number,
): Float64Array {
  const binHz  = sampleRate / fftSize;
  const n      = data.length;
  const minBin = Math.max(1, Math.floor(HPS_LO_HZ / binHz));
  // Cap so that bin*HPS_H never exceeds the array
  const maxBin = Math.min(Math.floor(n / HPS_H) - 1, Math.ceil(HPS_HI_HZ / binHz));

  // dB → linear magnitude
  const mag = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    mag[i] = data[i] <= -90 ? 0 : Math.pow(10, data[i] / 20);
  }

  // Compute HPS product at each fundamental-range bin
  const hps = new Float64Array(n);
  for (let i = minBin; i <= maxBin; i++) {
    let p = mag[i];
    for (let h = 2; h <= HPS_H; h++) p *= mag[Math.round(i * h)];
    hps[i] = p;
  }

  // Accumulate HPS value into pitch class bins
  const chroma = new Float64Array(12);
  for (let i = minBin; i <= maxBin; i++) {
    if (hps[i] <= 0) continue;
    const freq = i * binHz;
    const midi = 12 * Math.log2(freq / 440) + 69;
    const pc   = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += hps[i];
  }

  return chroma;
}

/**
 * Subtract noise floor (×1.5 safety margin), apply uniformity guard,
 * and normalise to [0, 1]. Returns null when the signal is too weak or
 * too uniform (background noise / silence).
 */
function cleanChroma(
  chroma: Float64Array,
  noiseFloor: Float64Array,
): Float64Array | null {
  const adj = new Float64Array(12);
  for (let i = 0; i < 12; i++) adj[i] = Math.max(0, chroma[i] - noiseFloor[i] * 1.5);

  const maxVal = Math.max(...adj);
  if (maxVal <= 0) return null;

  // Uniformity guard: real audio has a dominant pitch class;
  // noise/hum spreads energy evenly across all bins.
  const sorted = [...adj].sort((a, b) => a - b);
  const median = (sorted[5] + sorted[6]) / 2;
  if (median > 0 && maxVal / median < 2.5) return null;

  // Normalise
  const norm = new Float64Array(12);
  for (let i = 0; i < 12; i++) norm[i] = adj[i] / maxVal;
  return norm;
}

/**
 * Score every chord template against the normalised chromagram.
 * Hit score = weighted average chroma at template positions.
 * Penalty  = average chroma at non-template positions (scaled by 0.25).
 * Returns the ranked list (highest score first).
 */
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

    const score = (hitSum / wSum) - 0.25 * (penSum / (penCount || 1));
    return { chord: t.name, score };
  }).sort((a, b) => b.score - a.score);
}

// ── Component ─────────────────────────────────────────────────────────────────

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

  // Calibration
  const calibBufRef   = useRef<Float64Array[]>([]);
  const noiseFloorRef = useRef<Float64Array | null>(null);

  // Detection state
  const accumChromaRef = useRef<Float64Array>(new Float64Array(12)); // IIR-smoothed chroma
  const confHistoryRef = useRef<number[]>([]);                       // last CONF_HISTORY confidence scores
  const silentRef      = useRef(0);
  const lockedRef      = useRef(false);
  const frameCountRef  = useRef(0); // for log throttling

  const analyze = useCallback(() => {
    if (!analyserRef.current || !freqBufRef.current || !ctxRef.current) return;
    analyserRef.current.getFloatFrequencyData(freqBufRef.current);

    if (!lockedRef.current) {
      const rawChroma = computeHPSChroma(
        freqBufRef.current,
        ctxRef.current.sampleRate,
        analyserRef.current.fftSize,
      );

      // ── Phase 1: Calibration ─────────────────────────────────────────────
      if (!noiseFloorRef.current) {
        calibBufRef.current.push(rawChroma);
        console.log(`[ACD] calibration frame ${calibBufRef.current.length}/${CALIB_FRAMES}`);

        if (calibBufRef.current.length >= CALIB_FRAMES) {
          const floor = new Float64Array(12);
          for (const c of calibBufRef.current) {
            for (let i = 0; i < 12; i++) floor[i] += c[i] / CALIB_FRAMES;
          }
          noiseFloorRef.current = floor;
          const floorStr = PC.map((p, i) => `${p}:${floor[i].toExponential(2)}`).join(' ');
          console.log(`[ACD] noise floor established → ${floorStr}`);
          setCalibrating(false);
        }

        timerRef.current = setTimeout(analyze, 150);
        return;
      }

      // ── Phase 2: Detection ───────────────────────────────────────────────
      frameCountRef.current++;
      const norm = cleanChroma(rawChroma, noiseFloorRef.current);

      if (!norm) {
        // Silent / noise frame
        silentRef.current++;
        if (frameCountRef.current % 5 === 0) {
          console.log(`[ACD] silent (${silentRef.current} consecutive frames)`);
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

      // IIR smoothing: blend new frame into accumulated chroma
      const accum = accumChromaRef.current;
      for (let i = 0; i < 12; i++) {
        accum[i] = accum[i] * (1 - IIR_ALPHA) + norm[i] * IIR_ALPHA;
      }

      // Live notes: pitch classes with significant energy in accumulated chroma
      const accumMax = Math.max(...accum);
      const liveNotesList = Array.from({ length: 12 }, (_, i) => i)
        .filter(i => accumMax > 0 && accum[i] / accumMax >= 0.30)
        .sort((a, b) => accum[b] - accum[a])
        .map(i => PC[i]);
      setLiveNotes(liveNotesList);

      // Score templates against accumulated chroma
      const ranked = scoreTemplates(accum);
      const best   = ranked[0];
      const top3   = ranked.slice(0, 3);

      // Track confidence history
      confHistoryRef.current = [...confHistoryRef.current, best.score].slice(-CONF_HISTORY);
      const avgConf = confHistoryRef.current.reduce((s, v) => s + v, 0) / confHistoryRef.current.length;

      // Progress bar reflects current average confidence vs lock threshold
      const pct = Math.min(99, Math.round((avgConf / LOCK_CONF) * 100));
      setLockProgress(Math.max(0, pct));

      // Log every 5 frames
      if (frameCountRef.current % 5 === 0) {
        const chromaStr = liveNotesList.map(n => `${n}:${accum[PC.indexOf(n as typeof PC[number])].toFixed(2)}`).join(' ');
        console.log(`[ACD] chroma → ${chromaStr || '(none above threshold)'}`);
        console.log(`[ACD] top matches → ${top3.map(t => `${t.chord}(${t.score.toFixed(3)})`).join(' | ')}`);
        console.log(`[ACD] avgConf=${avgConf.toFixed(3)} threshold=${LOCK_CONF} progress=${pct}%`);
      }

      // Lock when average confidence exceeds threshold
      if (confHistoryRef.current.length >= CONF_HISTORY && avgConf >= LOCK_CONF) {
        const chord = best.chord;
        lockedRef.current = true;
        setStableChord(chord);
        setLockProgress(100);
        console.log(`[ACD] ✅ LOCKED → ${chord}  (confidence: ${avgConf.toFixed(3)}, top3: ${top3.map(t => t.chord).join(' / ')})`);
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
      analyser.fftSize              = 8192;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      freqBufRef.current  = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>;
      ctx.createMediaStreamSource(stream).connect(analyser);

      // Reset all state
      calibBufRef.current    = [];
      noiseFloorRef.current  = null;
      accumChromaRef.current = new Float64Array(12);
      confHistoryRef.current = [];
      silentRef.current      = 0;
      lockedRef.current      = false;
      frameCountRef.current  = 0;

      setStableChord(null);
      setLockProgress(0);
      setLiveNotes([]);
      setCalibrating(true);
      setListening(true);

      console.log(`[ACD] started — sampleRate=${ctx.sampleRate} fftSize=${analyser.fftSize} binHz=${(ctx.sampleRate / analyser.fftSize).toFixed(2)}`);
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
    setCalibrating(false);
    setLiveNotes([]);
    setLockProgress(0);
  }, []);

  const resetLock = () => {
    lockedRef.current      = false;
    accumChromaRef.current = new Float64Array(12);
    confHistoryRef.current = [];
    silentRef.current      = 0;
    // Keep noiseFloor — no need to re-calibrate
    setStableChord(null);
    setLockProgress(0);
    setLiveNotes([]);
    console.log('[ACD] lock reset — ready for next chord');
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
          {calibrating
            ? 'Calibrating mic 🎙 — stay quiet…'
            : isLocked
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
          {calibrating ? (
            <span style={{ fontSize: 13, color: T.textDim }}>Calibrating…</span>
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
              <span style={{ fontSize: 13, color: T.textDim }}>Waiting for sound…</span>
            )
          ) : (
            <span style={{ fontSize: 13, color: T.textDim }}>—</span>
          )}
        </div>

        {/* Calibration progress */}
        {calibrating && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 5 }}>Calibrating background noise…</div>
            <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: T.textMuted, width: '100%', opacity: 0.4 }} />
            </div>
          </div>
        )}

        {/* Lock progress bar */}
        {listening && !isLocked && !calibrating && (
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
        Press Start → stay quiet during calibration → play a chord · press ↺ for a new chord
      </p>
    </div>
  );
}
