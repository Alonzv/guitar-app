import React, { useState, useMemo } from 'react';
import { Note as TonalNote, Interval, Scale } from '@tonaljs/tonal';
import { T, card } from '../../theme';
import type { Tuning } from '../../types/music';
import { exportHarmonyPDF } from '../../utils/pdfExport';

// ── Types ──────────────────────────────────────────────────────────────────

type HarmonyType = 'diatonic3rd' | 'minor3rd' | 'perfect5th';

// A single note in the global sequence: which string + which fret
interface TabNote { stringIdx: number; fret: number; }

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

// ── Tab rendering ──────────────────────────────────────────────────────────

// Render a global sequence as 6 tab lines.
// Each note occupies one column; other strings get dashes of the same width.
function renderTabLines(sequence: TabNote[]): string[] {
  if (sequence.length === 0) return STRINGS.map(() => '');
  const lines = STRINGS.map(() => '--');
  for (const { stringIdx, fret } of sequence) {
    const fs = String(fret);
    for (let s = 0; s < STRINGS.length; s++) {
      lines[s] += (s === stringIdx ? fs : '-'.repeat(fs.length)) + '--';
    }
  }
  return lines;
}

// Render both original and harmony tabs together, with per-column alignment.
function renderBothTabs(
  sequence: TabNote[],
  harmonyFrets: (number | null)[],
): { origLines: string[]; harmLines: string[] } {
  if (sequence.length === 0) {
    return { origLines: STRINGS.map(() => ''), harmLines: STRINGS.map(() => '') };
  }
  const origLines = STRINGS.map(() => '--');
  const harmLines = STRINGS.map(() => '--');

  for (let i = 0; i < sequence.length; i++) {
    const { stringIdx, fret } = sequence[i];
    const hFret = harmonyFrets[i];
    const origStr = String(fret);
    const harmStr = hFret === null ? '?' : String(hFret);
    const slotWidth = Math.max(origStr.length, harmStr.length);
    const origPad = origStr.padStart(slotWidth, '-');
    const harmPad = harmStr.padStart(slotWidth, '-');
    const dashPad = '-'.repeat(slotWidth);

    for (let s = 0; s < STRINGS.length; s++) {
      if (s === stringIdx) {
        origLines[s] += origPad + '--';
        harmLines[s] += harmPad + '--';
      } else {
        origLines[s] += dashPad + '--';
        harmLines[s] += dashPad + '--';
      }
    }
  }
  return { origLines, harmLines };
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  tuning: Tuning;
}

export const HarmonyBuilder: React.FC<Props> = ({ tuning }) => {
  const [root, setRoot] = useState('A');
  const [scaleType, setScaleType] = useState('minor pentatonic');
  const [harmonyType, setHarmonyType] = useState<HarmonyType>('diatonic3rd');
  // Single ordered sequence across all strings
  const [sequence, setSequence] = useState<TabNote[]>([]);
  const [result, setResult] = useState<{ origLines: string[]; harmLines: string[] } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showPassing, setShowPassing] = useState(false);

  const tuningNotes = tuning.notes;
  const scaleNotes = useMemo(
    () => Scale.get(`${root} ${scaleType}`).notes,
    [root, scaleType],
  );

  const scaleFretsByString = useMemo(
    () => STRINGS.map(({ tuningIdx }) => getScaleFrets(tuningIdx, scaleNotes, tuningNotes)),
    [scaleNotes, tuningNotes],
  );

  const passingFretsByString = useMemo(
    () => STRINGS.map(({ tuningIdx }) => {
      const inScale = new Set(getScaleFrets(tuningIdx, scaleNotes, tuningNotes));
      const res: number[] = [];
      for (let f = 0; f <= MAX_FRET; f++) {
        if (!inScale.has(f)) res.push(f);
      }
      return res;
    }),
    [scaleNotes, tuningNotes],
  );

  const previewLines = useMemo(() => renderTabLines(sequence), [sequence]);

  const addNote = (strIdx: number, fret: number) => {
    setSequence(prev => [...prev, { stringIdx: strIdx, fret }]);
    setResult(null);
  };

  // Remove the last note that belongs to this string, keeping others in order
  const removeLastOfString = (strIdx: number) => {
    setSequence(prev => {
      const lastIdx = [...prev].map((n, i) => ({ n, i }))
        .filter(({ n }) => n.stringIdx === strIdx)
        .at(-1)?.i;
      if (lastIdx === undefined) return prev;
      return [...prev.slice(0, lastIdx), ...prev.slice(lastIdx + 1)];
    });
    setResult(null);
  };

  const handleClear = () => { setSequence([]); setResult(null); };

  const handleGenerate = () => {
    if (sequence.length === 0) return;
    const harmonyFrets = sequence.map(({ stringIdx, fret }) =>
      harmonizeFret(stringIdx, fret, harmonyType, scaleNotes, tuningNotes),
    );
    setResult(renderBothTabs(sequence, harmonyFrets));
  };

  const handleExportPDF = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const label = HARMONY_OPTIONS.find(o => o.value === harmonyType)?.label ?? harmonyType;
      const scaleName = `${root} ${SCALE_TYPES.find(s => s.value === scaleType)?.label ?? scaleType}`;
      // Only export strings that have content
      const activeIndices = STRINGS.map((_, i) => i).filter(i => result.origLines[i]);
      await exportHarmonyPDF(
        `${scaleName} — ${label}`,
        activeIndices.map(i => STRINGS[i].label),
        activeIndices.map(i => result.origLines[i]),
        activeIndices.map(i => result.harmLines[i]),
      );
    } finally {
      setExporting(false);
    }
  };

  // Count notes per string (for disabling ⌫)
  const noteCountByString = useMemo(
    () => STRINGS.map((_, i) => sequence.filter(n => n.stringIdx === i).length),
    [sequence],
  );

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
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowPassing(p => !p)}
            style={{
              padding: '5px 12px', borderRadius: 20,
              border: `1px solid ${showPassing ? T.primary : T.border}`,
              background: showPassing ? T.primaryBg : T.bgDeep,
              color: showPassing ? T.primary : T.textMuted,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {showPassing ? '✕ Hide passing notes' : '＋ Passing notes'}
          </button>
          {showPassing && (
            <span style={{ fontSize: 11, color: T.textMuted }}>
              Chromatic / blue notes outside the scale
            </span>
          )}
        </div>
      </div>

      {/* ── Sequence chip bar ── */}
      {sequence.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          overflowX: 'auto', padding: '6px 2px',
        }}>
          {sequence.map((note, i) => (
            <span key={i} style={{
              flexShrink: 0, padding: '3px 8px', borderRadius: 6,
              background: T.bgCard, border: `1px solid ${T.border}`,
              fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
              color: T.text, whiteSpace: 'nowrap',
            }}>
              {STRINGS[note.stringIdx].label}:{note.fret}
            </span>
          ))}
          <button
            onClick={handleClear}
            style={{
              flexShrink: 0, padding: '3px 10px', borderRadius: 6,
              border: `1px solid ${T.border}`, background: T.bgInput,
              color: T.textMuted, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Live tab preview ── */}
      {sequence.length > 0 && (
        <div style={{
          background: T.bgDeep, borderRadius: 10, border: `1px solid ${T.border}`,
          padding: '10px 12px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 6, letterSpacing: '0.5px' }}>
            PREVIEW
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, color: T.text, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {STRINGS.map(({ label }, i) => (
              <div key={label}>
                <span style={{ fontWeight: 700, color: T.textMuted }}>{label}</span>
                <span style={{ color: T.textDim }}>|</span>
                {previewLines[i] || '--'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Fretboard input ── */}
      <div style={{ ...card() }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, marginBottom: 12, letterSpacing: '0.5px' }}>
          BUILD YOUR RIFF — click frets in the order you want to play them
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STRINGS.map(({ label }, strIdx) => {
            const hasnotes = noteCountByString[strIdx] > 0;
            return (
              <div key={label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{
                    width: 18, fontWeight: 800, fontSize: 13, color: T.text,
                    flexShrink: 0, fontFamily: 'monospace',
                  }}>{label}</span>
                  <span style={{ flex: 1, fontSize: 11, color: T.textMuted }}>
                    {noteCountByString[strIdx] > 0
                      ? `${noteCountByString[strIdx]} note${noteCountByString[strIdx] > 1 ? 's' : ''}`
                      : ''}
                  </span>
                  <button
                    onClick={() => removeLastOfString(strIdx)}
                    disabled={!hasnotes}
                    title="Remove last note on this string"
                    style={{
                      width: 28, height: 28, borderRadius: 7,
                      border: `1px solid ${T.border}`,
                      background: hasnotes ? T.bgInput : T.bgDeep,
                      color: hasnotes ? T.text : T.textDim,
                      fontSize: 14, cursor: hasnotes ? 'pointer' : 'default',
                      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >⌫</button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingLeft: 24 }}>
                  {scaleFretsByString[strIdx].map(fret => (
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
                  {showPassing && passingFretsByString[strIdx].map(fret => (
                    <button
                      key={`p-${fret}`}
                      onClick={() => addNote(strIdx, fret)}
                      title="Passing / chromatic note"
                      style={{
                        padding: '4px 10px', borderRadius: 7,
                        border: `1px solid ${T.primary}`,
                        background: T.primaryBg,
                        color: T.primary, fontWeight: 700, fontSize: 12,
                        cursor: 'pointer', fontFamily: 'monospace',
                        transition: 'background 0.1s',
                      }}
                      onMouseOver={e => (e.currentTarget.style.background = T.primary, e.currentTarget.style.color = T.white)}
                      onMouseOut={e => (e.currentTarget.style.background = T.primaryBg, e.currentTarget.style.color = T.primary)}
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
          disabled={sequence.length === 0}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
            background: sequence.length > 0 ? T.secondary : T.border,
            color: sequence.length > 0 ? T.white : T.textDim,
            fontWeight: 700, fontSize: 13, cursor: sequence.length > 0 ? 'pointer' : 'default',
            transition: 'background 0.15s',
          }}
        >
          Generate Harmony
        </button>
      </div>

      {/* ── Result ── */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div style={{ ...card() }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: '0.5px', marginBottom: 8 }}>
              YOUR RIFF
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: T.text, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {STRINGS.map(({ label }, i) => result.origLines[i] ? (
                <div key={label}>
                  <span style={{ fontWeight: 700, color: T.textMuted }}>{label}</span>
                  <span style={{ color: T.textDim }}>|</span>
                  {result.origLines[i]}
                </div>
              ) : null)}
            </div>
          </div>

          <div style={{ ...card(), border: `1px solid ${T.secondary}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.secondary, letterSpacing: '0.5px', marginBottom: 8 }}>
              HARMONY — {HARMONY_OPTIONS.find(o => o.value === harmonyType)?.label}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: T.text, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {STRINGS.map(({ label }, i) => result.harmLines[i] ? (
                <div key={label}>
                  <span style={{ fontWeight: 700, color: T.secondary }}>{label}</span>
                  <span style={{ color: T.textDim }}>|</span>
                  {result.harmLines[i]}
                </div>
              ) : null)}
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
