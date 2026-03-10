import React, { useState, useMemo } from 'react';
import { Note as TonalNote, Interval, Scale } from '@tonaljs/tonal';
import { T, card } from '../../theme';
import type { Tuning } from '../../types/music';
import { exportHarmonyPDF } from '../../utils/pdfExport';

// ── Types ──────────────────────────────────────────────────────────────────

type HarmonyType = 'diatonic3rd' | 'minor3rd' | 'perfect5th';

interface TabNote  { stringIdx: number; fret: number; }
// A slot = one moment in time. 1 note = single note, 2+ = simultaneous (chord/dyad)
type TabSlot = TabNote[];

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
  { value: 'minor',            label: 'Natural Minor' },
  { value: 'major',            label: 'Major' },
  { value: 'dorian',           label: 'Dorian' },
  { value: 'mixolydian',       label: 'Mixolydian' },
];

const STRINGS: { label: string; tuningIdx: number }[] = [
  { label: 'e', tuningIdx: 5 },
  { label: 'B', tuningIdx: 4 },
  { label: 'G', tuningIdx: 3 },
  { label: 'D', tuningIdx: 2 },
  { label: 'A', tuningIdx: 1 },
  { label: 'E', tuningIdx: 0 },
];

const MAX_FRET = 17;

// Pentatonic/blues scales skip notes, so diatonic-3rd computation must use
// the full parent 7-note scale to get true intervallic 3rds.
const PARENT_SCALE_TYPE: Record<string, string> = {
  'minor pentatonic': 'minor',
  'major pentatonic': 'major',
  'blues':            'minor',
};

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
  chroma: number, tuningIdx: number, minFret: number, tuningNotes: string[],
): number | null {
  for (let f = minFret; f <= 24; f++) {
    if (TonalNote.chroma(getFretNote(tuningIdx, f, tuningNotes)) === chroma) return f;
  }
  return null;
}

function harmonizeFret(
  tuningIdx: number, fret: number, harmonyType: HarmonyType,
  scaleNotes: string[], tuningNotes: string[],
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
  const result = fret + (harmonyType === 'minor3rd' ? 3 : 7);
  return result <= 24 ? result : null;
}

// ── Tab rendering ──────────────────────────────────────────────────────────

function renderTabLines(slots: TabSlot[]): string[] {
  if (slots.length === 0) return STRINGS.map(() => '');
  const lines = STRINGS.map(() => '--');
  for (const slot of slots) {
    const maxWidth = Math.max(...slot.map(n => String(n.fret).length));
    for (let s = 0; s < STRINGS.length; s++) {
      const note = slot.find(n => n.stringIdx === s);
      lines[s] += (note ? String(note.fret).padStart(maxWidth, '-') : '-'.repeat(maxWidth)) + '--';
    }
  }
  return lines;
}

function renderBothTabs(
  slots: TabSlot[],
  harmonyFrets: (number | null)[][],  // harmonyFrets[slotIdx][noteIdxInSlot]
): { origLines: string[]; harmLines: string[] } {
  if (slots.length === 0) {
    return { origLines: STRINGS.map(() => ''), harmLines: STRINGS.map(() => '') };
  }
  const origLines = STRINGS.map(() => '--');
  const harmLines = STRINGS.map(() => '--');

  for (let si = 0; si < slots.length; si++) {
    const slot = slots[si];
    const hSlot = harmonyFrets[si];
    // Compute column width: max of all orig and harmony fret widths in this slot
    let slotWidth = 1;
    for (let ni = 0; ni < slot.length; ni++) {
      slotWidth = Math.max(slotWidth, String(slot[ni].fret).length);
      const h = hSlot[ni];
      if (h !== null) slotWidth = Math.max(slotWidth, String(h).length);
    }

    for (let s = 0; s < STRINGS.length; s++) {
      const noteIdx = slot.findIndex(n => n.stringIdx === s);
      if (noteIdx !== -1) {
        const origStr = String(slot[noteIdx].fret).padStart(slotWidth, '-');
        const h = hSlot[noteIdx];
        const harmStr = (h === null ? '?' : String(h)).padStart(slotWidth, '-');
        origLines[s] += origStr + '--';
        harmLines[s] += harmStr + '--';
      } else {
        const pad = '-'.repeat(slotWidth) + '--';
        origLines[s] += pad;
        harmLines[s] += pad;
      }
    }
  }
  return { origLines, harmLines };
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props { tuning: Tuning; }

export const HarmonyBuilder: React.FC<Props> = ({ tuning }) => {
  const [root, setRoot]           = useState('A');
  const [scaleType, setScaleType] = useState('minor pentatonic');
  const [harmonyType, setHarmonyType] = useState<HarmonyType>('diatonic3rd');
  const [slots, setSlots]         = useState<TabSlot[]>([]);
  const [result, setResult]       = useState<{ origLines: string[]; harmLines: string[] } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showPassing, setShowPassing] = useState(false);
  // Chord staging: when active, fret clicks accumulate into a pending slot
  const [chordMode, setChordMode] = useState(false);
  const [staged, setStaged]       = useState<TabNote[]>([]); // pending simultaneous notes

  const tuningNotes = tuning.notes;
  const scaleNotes  = useMemo(() => Scale.get(`${root} ${scaleType}`).notes, [root, scaleType]);

  // For diatonic-3rd calculation, use the full 7-note parent scale so that
  // interval counting is correct even when the user selected a pentatonic/blues scale.
  const harmonicScaleNotes = useMemo(() => {
    const parentType = PARENT_SCALE_TYPE[scaleType] ?? scaleType;
    return Scale.get(`${root} ${parentType}`).notes;
  }, [root, scaleType]);

  const scaleFretsByString = useMemo(
    () => STRINGS.map(({ tuningIdx }) => getScaleFrets(tuningIdx, scaleNotes, tuningNotes)),
    [scaleNotes, tuningNotes],
  );

  const passingFretsByString = useMemo(
    () => STRINGS.map(({ tuningIdx }) => {
      const inScale = new Set(getScaleFrets(tuningIdx, scaleNotes, tuningNotes));
      const res: number[] = [];
      for (let f = 0; f <= MAX_FRET; f++) if (!inScale.has(f)) res.push(f);
      return res;
    }),
    [scaleNotes, tuningNotes],
  );

  const previewLines = useMemo(() => renderTabLines(slots), [slots]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleFretClick = (strIdx: number, fret: number) => {
    setResult(null);
    if (!chordMode) {
      // Normal mode: add as a new single-note slot
      setSlots(prev => [...prev, [{ stringIdx: strIdx, fret }]]);
    } else {
      // Chord mode: add/replace this string in staging
      setStaged(prev => {
        const without = prev.filter(n => n.stringIdx !== strIdx);
        return [...without, { stringIdx: strIdx, fret }];
      });
    }
  };

  const commitChord = () => {
    if (staged.length === 0) return;
    setSlots(prev => [...prev, staged]);
    setStaged([]);
    setChordMode(false);
    setResult(null);
  };

  const cancelChord = () => { setStaged([]); setChordMode(false); };

  // Remove last slot that contains a note on this string
  const removeLastOfString = (strIdx: number) => {
    setSlots(prev => {
      const lastIdx = [...prev].map((slot, i) => ({ slot, i }))
        .filter(({ slot }) => slot.some(n => n.stringIdx === strIdx))
        .at(-1)?.i;
      if (lastIdx === undefined) return prev;
      const slot = prev[lastIdx];
      if (slot.length === 1) {
        // Remove entire slot
        return [...prev.slice(0, lastIdx), ...prev.slice(lastIdx + 1)];
      } else {
        // Remove just this note from the slot
        const newSlot = slot.filter(n => n.stringIdx !== strIdx);
        return [...prev.slice(0, lastIdx), newSlot, ...prev.slice(lastIdx + 1)];
      }
    });
    setResult(null);
  };

  const handleClear = () => { setSlots([]); setStaged([]); setChordMode(false); setResult(null); };

  const handleGenerate = () => {
    if (slots.length === 0) return;
    const harmonyFrets = slots.map(slot =>
      slot.map(({ stringIdx, fret }) =>
        harmonizeFret(STRINGS[stringIdx].tuningIdx, fret, harmonyType, harmonicScaleNotes, tuningNotes),
      ),
    );
    setResult(renderBothTabs(slots, harmonyFrets));
  };

  const handleExportPDF = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const label = HARMONY_OPTIONS.find(o => o.value === harmonyType)?.label ?? harmonyType;
      const scaleName = `${root} ${SCALE_TYPES.find(s => s.value === scaleType)?.label ?? scaleType}`;
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

  const noteCountByString = useMemo(
    () => STRINGS.map((_, i) => slots.filter(slot => slot.some(n => n.stringIdx === i)).length),
    [slots],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Scale selection ── */}
      <div style={{ ...card() }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, marginBottom: 10, letterSpacing: '0.5px' }}>
          SCALE
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={root} onChange={e => { setRoot(e.target.value); setResult(null); }} style={{
            flex: '0 0 72px', padding: '9px 8px', borderRadius: 8,
            border: `1px solid ${T.border}`, background: T.bgInput,
            color: T.text, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            {ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={scaleType} onChange={e => { setScaleType(e.target.value); setResult(null); }} style={{
            flex: 1, padding: '9px 10px', borderRadius: 8,
            border: `1px solid ${T.border}`, background: T.bgInput,
            color: T.text, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>
            {SCALE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: T.secondary }}>
          Notes: <strong>{scaleNotes.join('  ')}</strong>
        </div>
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setShowPassing(p => !p)} style={{
            padding: '5px 12px', borderRadius: 20,
            border: `1px solid ${showPassing ? T.primary : T.border}`,
            background: showPassing ? T.primaryBg : T.bgDeep,
            color: showPassing ? T.primary : T.textMuted,
            fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {showPassing ? '✕ Hide passing notes' : '＋ Passing notes'}
          </button>
          {showPassing && (
            <span style={{ marginLeft: 8, fontSize: 11, color: T.textMuted }}>
              Chromatic / blue notes outside the scale
            </span>
          )}
        </div>
      </div>

      {/* ── Sequence chip bar ── */}
      {slots.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflowX: 'auto', padding: '4px 2px' }}>
          {slots.map((slot, si) => (
            <span key={si} style={{
              flexShrink: 0, padding: '3px 8px', borderRadius: 6,
              background: slot.length > 1 ? T.primaryBg : T.bgCard,
              border: `1px solid ${slot.length > 1 ? T.primary : T.border}`,
              fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: T.text,
            }}>
              {slot.map(n => `${STRINGS[n.stringIdx].label}:${n.fret}`).join('+')}
            </span>
          ))}
          <button onClick={handleClear} style={{
            flexShrink: 0, padding: '3px 10px', borderRadius: 6,
            border: `1px solid ${T.border}`, background: T.bgInput,
            color: T.textMuted, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>Clear all</button>
        </div>
      )}

      {/* ── Live tab preview ── */}
      {slots.length > 0 && (
        <div style={{ background: T.bgDeep, borderRadius: 10, border: `1px solid ${T.border}`, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 6, letterSpacing: '0.5px' }}>PREVIEW</div>
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

      {/* ── Chord staging banner ── */}
      {chordMode && (
        <div style={{
          background: T.primaryBg, borderRadius: 10, border: `1px solid ${T.primary}`,
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.primary }}>
            Chord mode
          </span>
          <span style={{ fontSize: 12, color: T.textMuted, flex: 1 }}>
            {staged.length === 0
              ? 'Click frets on any strings to add simultaneous notes'
              : staged.map(n => `${STRINGS[n.stringIdx].label}:${n.fret}`).join(' + ')}
          </span>
          <button
            onClick={commitChord}
            disabled={staged.length < 2}
            style={{
              padding: '5px 14px', borderRadius: 8, border: 'none',
              background: staged.length >= 2 ? T.primary : T.border,
              color: staged.length >= 2 ? T.white : T.textDim,
              fontWeight: 700, fontSize: 12, cursor: staged.length >= 2 ? 'pointer' : 'default',
            }}
          >✓ Add chord</button>
          <button onClick={cancelChord} style={{
            padding: '5px 10px', borderRadius: 8,
            border: `1px solid ${T.border}`, background: 'transparent',
            color: T.textMuted, fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}>✕</button>
        </div>
      )}

      {/* ── Fretboard input ── */}
      <div style={{ ...card() }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: T.textMuted, letterSpacing: '0.5px' }}>
            BUILD YOUR RIFF
          </div>
          <button
            onClick={() => { setChordMode(c => !c); setStaged([]); }}
            style={{
              padding: '5px 12px', borderRadius: 8,
              border: `1px solid ${chordMode ? T.primary : T.border}`,
              background: chordMode ? T.primaryBg : T.bgDeep,
              color: chordMode ? T.primary : T.textMuted,
              fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            ♩♩ Chord
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STRINGS.map(({ label }, strIdx) => {
            const hasnotes = noteCountByString[strIdx] > 0;
            const isStaged = staged.some(n => n.stringIdx === strIdx);
            return (
              <div key={label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{
                    width: 18, fontWeight: 800, fontSize: 13,
                    color: isStaged ? T.primary : T.text,
                    flexShrink: 0, fontFamily: 'monospace',
                  }}>{label}</span>
                  <span style={{ flex: 1, fontSize: 11, color: isStaged ? T.primary : T.textMuted }}>
                    {isStaged
                      ? `fret ${staged.find(n => n.stringIdx === strIdx)?.fret} staged`
                      : noteCountByString[strIdx] > 0
                        ? `${noteCountByString[strIdx]} note${noteCountByString[strIdx] > 1 ? 's' : ''}`
                        : ''}
                  </span>
                  {!chordMode && (
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
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingLeft: 24 }}>
                  {scaleFretsByString[strIdx].map(fret => {
                    const isThisStaged = staged.some(n => n.stringIdx === strIdx && n.fret === fret);
                    return (
                      <button key={fret} onClick={() => handleFretClick(strIdx, fret)} style={{
                        padding: '4px 10px', borderRadius: 7,
                        border: `1px solid ${isThisStaged ? T.primary : T.secondary}`,
                        background: isThisStaged ? T.primary : T.secondaryBg,
                        color: isThisStaged ? T.white : T.secondary,
                        fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'monospace',
                        transition: 'background 0.1s',
                      }}
                        onMouseOver={e => { if (!isThisStaged) { e.currentTarget.style.background = T.secondary; e.currentTarget.style.color = T.white; } }}
                        onMouseOut={e => { if (!isThisStaged) { e.currentTarget.style.background = T.secondaryBg; e.currentTarget.style.color = T.secondary; } }}
                      >{fret}</button>
                    );
                  })}
                  {showPassing && passingFretsByString[strIdx].map(fret => (
                    <button key={`p-${fret}`} onClick={() => handleFretClick(strIdx, fret)} title="Passing / chromatic note" style={{
                      padding: '4px 10px', borderRadius: 7,
                      border: `1px solid ${T.primary}`, background: T.primaryBg,
                      color: T.primary, fontWeight: 700, fontSize: 12,
                      cursor: 'pointer', fontFamily: 'monospace', transition: 'background 0.1s',
                    }}
                      onMouseOver={e => (e.currentTarget.style.background = T.primary, e.currentTarget.style.color = T.white)}
                      onMouseOut={e => (e.currentTarget.style.background = T.primaryBg, e.currentTarget.style.color = T.primary)}
                    >{fret}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Harmony type + actions ── */}
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={harmonyType} onChange={e => { setHarmonyType(e.target.value as HarmonyType); setResult(null); }} style={{
          flex: 1, padding: '10px 10px', borderRadius: 10,
          border: `1px solid ${T.border}`, background: T.bgInput,
          color: T.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          {HARMONY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={handleGenerate} disabled={slots.length === 0} style={{
          flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
          background: slots.length > 0 ? T.secondary : T.border,
          color: slots.length > 0 ? T.white : T.textDim,
          fontWeight: 700, fontSize: 13, cursor: slots.length > 0 ? 'pointer' : 'default',
          transition: 'background 0.15s',
        }}>
          Generate Harmony
        </button>
      </div>

      {/* ── Result ── */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...card() }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: '0.5px', marginBottom: 8 }}>YOUR RIFF</div>
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

          <button onClick={handleExportPDF} disabled={exporting} style={{
            width: '100%', padding: '10px 0', borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: exporting ? T.bgCard : T.bgInput,
            color: exporting ? T.textDim : T.text,
            fontWeight: 600, fontSize: 13,
            cursor: exporting ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
          }}>
            {exporting ? 'Creating PDF…' : '📄 Export PDF'}
          </button>
        </div>
      )}
    </div>
  );
};
