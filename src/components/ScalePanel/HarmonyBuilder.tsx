import React, { useState } from 'react';
import { Note as TonalNote, Interval, Scale } from '@tonaljs/tonal';
import { T, card } from '../../theme';
import type { ScaleMatch, Tuning } from '../../types/music';
import { exportHarmonyPDF } from '../../utils/pdfExport';

// ── Types ──────────────────────────────────────────────────────────────────

type HarmonyType = 'diatonic3rd' | 'minor3rd' | 'major3rd' | 'perfect4th' | 'perfect5th' | 'octave';

const HARMONY_OPTIONS: { value: HarmonyType; label: string }[] = [
  { value: 'diatonic3rd', label: '🎼 Diatonic 3rd (follows scale)' },
  { value: 'minor3rd',    label: '🎵 Minor 3rd (+3 semitones)' },
  { value: 'major3rd',    label: '🎵 Major 3rd (+4 semitones)' },
  { value: 'perfect4th',  label: '🎵 Perfect 4th (+5 semitones)' },
  { value: 'perfect5th',  label: '🎵 Perfect 5th (+7 semitones)' },
  { value: 'octave',      label: '🎵 Octave (+12 semitones)' },
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

// ── Music helpers ──────────────────────────────────────────────────────────

// Compare two pitch classes enharmonically (C# === Db)
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
    const targetChroma = TonalNote.chroma(targetPC);
    if (targetChroma === undefined) return null;
    return findFretForChroma(targetChroma, tuningIdx, fret + 1, tuningNotes);
  }

  const semitoneMap: Record<Exclude<HarmonyType, 'diatonic3rd'>, number> = {
    minor3rd:   3,
    major3rd:   4,
    perfect4th: 5,
    perfect5th: 7,
    octave:     12,
  };
  const result = fret + semitoneMap[harmonyType as Exclude<HarmonyType, 'diatonic3rd'>];
  return result <= 24 ? result : null;
}

// Replace every fret number in a tab line with its harmony fret.
// Pads with '-' when replacement is shorter to preserve alignment.
function processLine(
  line: string,
  tuningIdx: number,
  harmonyType: HarmonyType,
  scaleNotes: string[],
  tuningNotes: string[],
): string {
  return line.replace(/\d+/g, match => {
    const fret = parseInt(match, 10);
    const h = harmonizeFret(tuningIdx, fret, harmonyType, scaleNotes, tuningNotes);
    if (h === null) return '?'.padStart(match.length, '-');
    return String(h).padStart(match.length, '-');
  });
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  selectedScale: ScaleMatch | null;
  tuning: Tuning;
}

const EMPTY_STRINGS = Array(6).fill('');

export const HarmonyBuilder: React.FC<Props> = ({ selectedScale, tuning }) => {
  const [open, setOpen] = useState(false);
  const [harmonyType, setHarmonyType] = useState<HarmonyType>('diatonic3rd');
  const [lines, setLines] = useState<string[]>(EMPTY_STRINGS);
  const [result, setResult] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const tuningNotes = tuning.notes; // e.g. ['E2','A2','D3','G3','B3','E4']

  const scaleNotes: string[] = selectedScale
    ? Scale.get(`${selectedScale.root} ${selectedScale.type}`).notes
    : [];

  const handleGenerate = () => {
    setError(null);
    setResult(null);

    if (harmonyType === 'diatonic3rd' && scaleNotes.length === 0) {
      setError('Please detect or browse a scale first so Diatonic 3rd knows which notes to use.');
      return;
    }

    const hasInput = lines.some(l => /\d/.test(l));
    if (!hasInput) {
      setError('Enter at least one fret number in the tab above.');
      return;
    }

    const harmony = STRINGS.map(({ tuningIdx }, i) =>
      processLine(lines[i] || '', tuningIdx, harmonyType, scaleNotes, tuningNotes),
    );
    setResult(harmony);
  };

  const handleClear = () => {
    setLines(EMPTY_STRINGS);
    setResult(null);
    setError(null);
  };

  const handleExportPDF = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const label = HARMONY_OPTIONS.find(o => o.value === harmonyType)?.label
        .replace(/^[^\w]+/, '')
        ?? harmonyType;

      // Only include strings that have actual content in the original riff
      const activeIndices = STRINGS.map((_, i) => i).filter(i => /\d/.test(lines[i] || ''));
      const activeLabels  = activeIndices.map(i => STRINGS[i].label);
      const activeOriginal = activeIndices.map(i => lines[i] || '');
      const activeHarmony  = activeIndices.map(i => result[i] || '');

      await exportHarmonyPDF(label, activeLabels, activeOriginal, activeHarmony);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ ...card(), padding: 0, overflow: 'hidden' }}>

      {/* ── Collapsible header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🎶</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>Harmony Builder</span>
          <span style={{
            fontSize: 11, fontWeight: 600, color: T.secondary,
            background: T.secondaryBg, borderRadius: 6, padding: '2px 7px',
          }}>
            3rds
          </span>
        </div>
        <span style={{ fontSize: 12, color: T.textMuted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          ▼
        </span>
      </button>

      {/* ── Expandable body ── */}
      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Tuning indicator */}
          <div style={{ fontSize: 11, color: T.textMuted, background: T.bgDeep, borderRadius: 6, padding: '5px 10px' }}>
            Tuning: <strong style={{ color: T.text }}>{tuning.label}</strong>
          </div>

          {/* Harmony type selector */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: 'block', marginBottom: 6 }}>
              HARMONY TYPE
            </label>
            <select
              value={harmonyType}
              onChange={e => { setHarmonyType(e.target.value as HarmonyType); setResult(null); setError(null); }}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${T.border}`, background: T.bgInput,
                color: T.text, fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              {HARMONY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {harmonyType === 'diatonic3rd' && scaleNotes.length === 0 && (
              <p style={{ fontSize: 11, color: T.primary, margin: '5px 0 0', lineHeight: 1.4 }}>
                ⚠ Detect or browse a scale above to use Diatonic 3rd.
              </p>
            )}
            {harmonyType === 'diatonic3rd' && scaleNotes.length > 0 && (
              <p style={{ fontSize: 11, color: T.secondary, margin: '5px 0 0' }}>
                Using scale: <strong>{selectedScale?.name}</strong> ({scaleNotes.join(' – ')})
              </p>
            )}
          </div>

          {/* Tab input */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: 'block', marginBottom: 6 }}>
              YOUR RIFF (tab)
            </label>
            <div style={{
              background: T.bgDeep, borderRadius: 10, border: `1px solid ${T.border}`,
              padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4,
              fontFamily: 'monospace',
            }}>
              {STRINGS.map(({ label }, i) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 14, fontWeight: 700, fontSize: 13, color: T.textMuted, flexShrink: 0 }}>
                    {label}
                  </span>
                  <span style={{ color: T.textDim, fontSize: 13 }}>|</span>
                  <input
                    type="text"
                    value={lines[i]}
                    onChange={e => {
                      const next = [...lines];
                      next[i] = e.target.value;
                      setLines(next);
                      setResult(null);
                      setError(null);
                    }}
                    placeholder="--5--7--9--"
                    style={{
                      flex: 1, border: 'none', background: 'transparent',
                      fontFamily: 'monospace', fontSize: 13, color: T.text,
                      outline: 'none', padding: 0,
                    }}
                  />
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: T.textMuted, margin: '5px 0 0' }}>
              Use dashes between fret numbers, e.g. <code style={{ background: T.bgCard, borderRadius: 3, padding: '1px 4px' }}>--5--7--9--</code>
            </p>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleGenerate}
              style={{
                flex: 1, padding: '11px 0', borderRadius: 10, border: 'none',
                background: T.secondary, color: T.white, fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}
            >
              Generate Harmony
            </button>
            <button
              onClick={handleClear}
              style={{
                padding: '11px 16px', borderRadius: 10, border: `1px solid ${T.border}`,
                background: T.bgInput, color: T.textMuted, fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: '#FEE8E6', border: '1px solid #F5A09A',
              fontSize: 13, color: '#9B2018',
            }}>
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, display: 'block', marginBottom: 6 }}>
                HARMONY TAB
              </label>
              <div style={{
                background: T.bgDeep, borderRadius: 10, border: `1px solid ${T.secondary}`,
                padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4,
                fontFamily: 'monospace',
              }}>
                {STRINGS.map(({ label }, i) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 14, fontWeight: 700, fontSize: 13, color: T.secondary, flexShrink: 0 }}>
                      {label}
                    </span>
                    <span style={{ color: T.textDim, fontSize: 13 }}>|</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: result[i] ? T.text : T.textDim }}>
                      {result[i] || '--'}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: T.textMuted, margin: '5px 0 0', lineHeight: 1.4 }}>
                {harmonyType === 'diatonic3rd'
                  ? '💡 Diatonic: some intervals are major, some minor — follows the scale.'
                  : '💡 Play this tab as a separate voice alongside your original riff.'}
              </p>
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                style={{
                  marginTop: 10, width: '100%', padding: '10px 0', borderRadius: 10,
                  border: `1px solid ${T.border}`, background: exporting ? T.bgCard : T.bgInput,
                  color: exporting ? T.textDim : T.text, fontWeight: 600, fontSize: 13,
                  cursor: exporting ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
                }}
              >
                {exporting ? 'Creating PDF…' : '📄 Export PDF'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
