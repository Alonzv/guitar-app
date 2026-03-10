import React, { useState, useMemo } from 'react';
import { Note as TonalNote, Interval, Scale } from '@tonaljs/tonal';
import { T, card } from '../../theme';
import type { Tuning } from '../../types/music';
import { exportHarmonyPDF } from '../../utils/pdfExport';

// ── Types ──────────────────────────────────────────────────────────────────

type HarmonyType = 'diatonic3rd' | 'minor3rd' | 'perfect5th';

const HARMONY_OPTIONS: { value: HarmonyType; label: string }[] = [
  { value: 'diatonic3rd', label: 'Diatonic 3rd' },
  { value: 'minor3rd',    label: 'Minor 3rd (+3)' },
  { value: 'perfect5th',  label: 'Perfect 5th (+7)' },
];

const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const SCALE_TYPES: { value: string; label: string }[] = [
  { value: 'minor pentatonic', label: 'Minor Pentatonic' },
  { value: 'major pentatonic', label: 'Major Pentatonic' },
  { value: 'blues',            label: 'Blues' },
  { value: 'natural minor',    label: 'Natural Minor' },
  { value: 'major',            label: 'Major' },
  { value: 'dorian',           label: 'Dorian' },
  { value: 'mixolydian',       label: 'Mixolydian' },
];

// String labels and corresponding tuning indices (high e to low E)
const STRINGS: { label: string; tuningIdx: number }[] = [
  { label: 'e', tuningIdx: 5 },
  { label: 'B', tuningIdx: 4 },
  { label: 'G', tuningIdx: 3 },
  { label: 'D', tuningIdx: 2 },
  { label: 'A', tuningIdx: 1 },
  { label: 'E', tuningIdx: 0 },
];

const MAX_FRET = 17;

// ── Music helpers ──────────────────────────────────────────────────────────

function sameChroma(a: string, b: string): boolean {
  const ca = TonalNote.chroma(a);
  const cb = TonalNote.chroma(b);
  return ca !== undefined && cb !== undefined && ca === cb;
}

function getFretNote(tuningIdx: number, fret: number, tuningNotes: string[]): string {
  const openNote = tuningNotes[tuningIdx];
  if (fret === 0) return TonalNote.pitchClass(openNote) ?? openNote;
  const transposed = TonalNote.transpose(openNote, Interval.fromSemitones(fret));
  return TonalNote.pitchClass(transposed) ?? transposed;
}

function getScaleFrets(tuningIdx: number, scaleNotes: string[], tuningNotes: string[]): number[] {
  const result: number[] = [];
  for (let f = 0; f <= MAX_FRET; f++) {
    const note = getFretNote(tuningIdx, f, tuningNotes);
    if (scaleNotes.some(n => sameChroma(n, note))) result.push(f);
  }
  return result;
}

function findFretForChroma(
  chroma: number,
  tuningIdx: number,
  minFret: number,
  tuningNotes: string[],
): number | null {
  for (let f = minFret; f <= 24; f++) {
    if (TonalNote.chroma(getFretNote(tuningIdx, f, tuningNotes)) === chroma) return f;
  }
  return null;
}

function harmonizeFret(
  tuningIdx: number,
  fret: number,
  harmonyType: HarmonyType,
  scaleNotes: string[],
  tuningNotes: string[],
): number | null {
  if (harmonyType === 'diatonic3rd') {
    const note = getFretNote(tuningIdx, fret, tuningNotes);
    const scaleIdx = scaleNotes.findIndex(n => sameChroma(n, note));
    if (scaleIdx === -1) return null;
    const targetPC = scaleNotes[(scaleIdx + 2) % scaleNotes.length];
    const chroma = TonalNote.chroma(targetPC);
    if (chroma === undefined) return null;
    return findFretForChroma(chroma, tuningIdx, fret + 1, tuningNotes);
  }
  const semitones = harmonyType === 'minor3rd' ? 3 : 7;
  const result = fret + semitones;
  return result <= 24 ? result : null;
}

// Render two aligned tab lines from parallel sequences.
// Each note slot is padded to the same width so both lines align column-by-column.
function renderAligned(
  original: number[],
  harmony: (number | null)[],
): { origLine: string; harmLine: string } {
  if (original.length === 0) return { origLine: '', harmLine: '' };
  const slots = original.map((orig, i) => {
    const h = harmony[i];
    const os = String(orig);
    const hs = h === null ? '?' : String(h);
    const w = Math.max(os.length, hs.length);
    return { orig: os.padStart(w, '-'), harm: hs.padStart(w, '-') };
  });
  return {
    origLine: '--' + slots.map(s => s.orig).join('--') + '--',
    harmLine: '--' + slots.map(s => s.harm).join('--') + '--',
  };
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  tuning: Tuning;
}

export const HarmonyBuilder: React.FC<Props> = ({ tuning }) => {
  const [root, setRoot] = useState('A');
  const [scaleType, setScaleType] = useState('minor pentatonic');
  const [harmonyType, setHarmonyType] = useState<HarmonyType>('diatonic3rd');
  const [sequences, setSequences] = useState<number[][]>(() => Array.from({ length: 6 }, () => []));
  const [result, setResult] = useState<{ origLine: string; harmLine: string }[] | null>(null);
  const [exporting, setExporting] = useState(false);

  const tuningNotes = tuning.notes;
  const scaleNotes = useMemo(
    () => Scale.get(`${root} ${scaleType}`).notes,
    [root, scaleType],
  );

  const scaleFretsByString = useMemo(
    () => STRINGS.map(({ tuningIdx }) => getScaleFrets(tuningIdx, scaleNotes, tuningNotes)),
    [scaleNotes, tuningNotes],
  );

  const hasAnyNotes = sequences.some(seq => seq.length > 0);

  const addNote = (strIdx: number, fret: number) => {
    setSequences(prev => {
      const next = prev.map(s => [...s]);
      next[strIdx] = [...next[strIdx], fret];
      return next;
    });
    setResult(null);
  };

  const removeLast = (strIdx: number) => {
    setSequences(prev => {
      const next = prev.map(s => [...s]);
      next[strIdx] = next[strIdx].slice(0, -1);
      return next;
    });
    setResult(null);
  };

  const handleClear = () => {
    setSequences(Array.from({ length: 6 }, () => []));
    setResult(null);
  };

  const handleGenerate = () => {
    if (!hasAnyNotes) return;
    const generated = STRINGS.map(({ tuningIdx }, i) => {
      const seq = sequences[i];
      if (seq.length === 0) return { origLine: '', harmLine: '' };
      const harmSeq = seq.map(fret =>
        harmonizeFret(tuningIdx, fret, harmonyType, scaleNotes, tuningNotes),
      );
      return renderAligned(seq, harmSeq);
    });
    setResult(generated);
  };

  const handleExportPDF = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const label = HARMONY_OPTIONS.find(o => o.value === harmonyType)?.label ?? harmonyType;
      const activeIndices = sequences.map((_seq, i) => i).filter(i => sequences[i].length > 0);
      await exportHarmonyPDF(
        `${root} ${SCALE_TYPES.find(s => s.value === scaleType)?.label ?? scaleType} — ${label}`,
        activeIndices.map(i => STRINGS[i].label),
        activeIndices.map(i => result[i].origLine),
        activeIndices.map(i => result[i].harmLine),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Scale selection ── */}
      <div style={{ ...card() }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, marginBottom: 10, letterSpacing: '0.5px' }}>
          SCALE
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={root}
            onChange={e => { setRoot(e.target.value); setResult(null); }}
            style={{
              flex: '0 0 72px', padding: '9px 8px', borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.bgInput,
              color: T.text, fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={scaleType}
            onChange={e => { setScaleType(e.target.value); setResult(null); }}
            style={{
              flex: 1, padding: '9px 10px', borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.bgInput,
              color: T.text, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            {SCALE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: T.secondary }}>
          Notes: <strong>{scaleNotes.join('  ')}</strong>
        </div>
      </div>

      {/* ── Fretboard input ── */}
      <div style={{ ...card() }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, marginBottom: 12, letterSpacing: '0.5px' }}>
          BUILD YOUR RIFF — click fret numbers to add notes
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {STRINGS.map(({ label }, strIdx) => {
            const seq = sequences[strIdx];
            const frets = scaleFretsByString[strIdx];
            const preview = seq.length > 0
              ? '--' + seq.join('--') + '--'
              : '';

            return (
              <div key={label}>
                {/* String label + preview + backspace */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{
                    width: 18, fontWeight: 800, fontSize: 13, color: T.text,
                    flexShrink: 0, fontFamily: 'monospace',
                  }}>{label}</span>
                  <span style={{ color: T.textDim, fontSize: 13, fontFamily: 'monospace' }}>|</span>
                  <span style={{
                    flex: 1, fontFamily: 'monospace', fontSize: 13,
                    color: seq.length > 0 ? T.text : T.textDim,
                    background: T.bgDeep, borderRadius: 6,
                    padding: '4px 8px', minHeight: 26,
                    border: `1px solid ${seq.length > 0 ? T.border : 'transparent'}`,
                    letterSpacing: '0.5px',
                  }}>
                    {preview || <span style={{ opacity: 0.35 }}>——</span>}
                  </span>
                  <button
                    onClick={() => removeLast(strIdx)}
                    disabled={seq.length === 0}
                    title="Remove last note"
                    style={{
                      width: 28, height: 28, borderRadius: 7,
                      border: `1px solid ${T.border}`,
                      background: seq.length > 0 ? T.bgInput : T.bgDeep,
                      color: seq.length > 0 ? T.text : T.textDim,
                      fontSize: 14, cursor: seq.length > 0 ? 'pointer' : 'default',
                      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >⌫</button>
                </div>

                {/* Fret buttons */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingLeft: 24 }}>
                  {frets.map(fret => (
                    <button
                      key={fret}
                      onClick={() => addNote(strIdx, fret)}
                      style={{
                        padding: '4px 10px', borderRadius: 7,
                        border: `1px solid ${T.secondary}`,
                        background: T.secondaryBg,
                        color: T.secondary, fontWeight: 700, fontSize: 12,
                        cursor: 'pointer', fontFamily: 'monospace',
                        transition: 'background 0.1s',
                      }}
                      onMouseOver={e => (e.currentTarget.style.background = T.secondary, e.currentTarget.style.color = T.white)}
                      onMouseOut={e => (e.currentTarget.style.background = T.secondaryBg, e.currentTarget.style.color = T.secondary)}
                    >
                      {fret}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Harmony type + actions ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <select
          value={harmonyType}
          onChange={e => { setHarmonyType(e.target.value as HarmonyType); setResult(null); }}
          style={{
            flex: 1, padding: '10px 10px', borderRadius: 10,
            border: `1px solid ${T.border}`, background: T.bgInput,
            color: T.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {HARMONY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={handleGenerate}
          disabled={!hasAnyNotes}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
            background: hasAnyNotes ? T.secondary : T.border,
            color: hasAnyNotes ? T.white : T.textDim,
            fontWeight: 700, fontSize: 13, cursor: hasAnyNotes ? 'pointer' : 'default',
            transition: 'background 0.15s',
          }}
        >
          Generate Harmony
        </button>
        <button
          onClick={handleClear}
          style={{
            padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.border}`,
            background: T.bgInput, color: T.textMuted, fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>

      {/* ── Result ── */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Original tab */}
          <div style={{ ...card() }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: '0.5px', marginBottom: 8 }}>
              YOUR RIFF
            </div>
            <div style={{
              fontFamily: 'monospace', fontSize: 13, color: T.text,
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              {STRINGS.map(({ label }, i) => (
                result[i].origLine
                  ? <div key={label}><span style={{ color: T.textMuted, fontWeight: 700 }}>{label}</span>|{result[i].origLine}</div>
                  : null
              ))}
            </div>
          </div>

          {/* Harmony tab */}
          <div style={{ ...card(), border: `1px solid ${T.secondary}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.secondary, letterSpacing: '0.5px', marginBottom: 8 }}>
              HARMONY — {HARMONY_OPTIONS.find(o => o.value === harmonyType)?.label}
            </div>
            <div style={{
              fontFamily: 'monospace', fontSize: 13, color: T.text,
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              {STRINGS.map(({ label }, i) => (
                result[i].harmLine
                  ? <div key={label}><span style={{ color: T.secondary, fontWeight: 700 }}>{label}</span>|{result[i].harmLine}</div>
                  : null
              ))}
            </div>
          </div>

          <button
            onClick={handleExportPDF}
            disabled={exporting}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10,
              border: `1px solid ${T.border}`,
              background: exporting ? T.bgCard : T.bgInput,
              color: exporting ? T.textDim : T.text,
              fontWeight: 600, fontSize: 13,
              cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {exporting ? 'Creating PDF…' : '📄 Export PDF'}
          </button>
        </div>
      )}
    </div>
  );
};
