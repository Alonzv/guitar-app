import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { T, card } from '../../theme';
import type { Tuning } from '../../types/music';
import type { TabContent } from '../../services/types';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { detectTabScale } from '../../utils/analyzeTab';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import {
  harmonizeMelody, HARMONY_STYLES,
  labelToLowEIndex, labelToRow, STR_LABELS,
  type HarmonizeStyle, type HarmonizeResult,
} from '../../utils/harmonizeMelody';
import { extractTabFromImage } from '../../utils/tabVision';

// ── Grid model ───────────────────────────────────────────────────────────────
type Tech = 'h' | 'p' | '/' | '\\' | 'b' | '~';
interface HCell { fret: string; tech?: Tech; added?: boolean }
type HGrid = HCell[][];

const ROWS = STR_LABELS;             // e B G D A E  (row 0 = high e)
const DEFAULT_COLS = 16;
const CW = 30;
const CH = 28;

function emptyGrid(cols = DEFAULT_COLS): HGrid {
  return ROWS.map(() => Array.from({ length: cols }, () => ({ fret: '' })));
}

function emptyDisplayGrid(cols: number): HGrid {
  return ROWS.map(() => Array.from({ length: cols }, () => ({ fret: '' } as HCell)));
}

function gridHasNotes(g: HGrid): boolean {
  return g.some(r => r.some(c => c.fret !== ''));
}

// TabContent (loose tech:string) → working HGrid
function fromTabContent(c: TabContent): HGrid {
  const cols = c.grid[0]?.length ?? DEFAULT_COLS;
  return ROWS.map((_, row) =>
    Array.from({ length: cols }, (_, col) => {
      const cell = c.grid[row]?.[col];
      return cell?.tech ? { fret: cell.fret ?? '', tech: cell.tech as Tech } : { fret: cell?.fret ?? '' };
    }),
  );
}

// HGrid → TabContent (strip the `added` flag for storage)
function toTabContent(g: HGrid, title: string): TabContent {
  return {
    title, subtitle: '',
    grid: g.map(row => row.map(c => (c.tech ? { fret: c.fret, tech: c.tech } : { fret: c.fret }))),
    bars: [],
  };
}

// ── ASCII tab paste parser ─────────────────────────────────────────────────────
// Accepts a pasted 6-line ASCII tab; aligns notes by character column, then
// collapses all-empty columns. Rows are matched by leading label when present,
// otherwise assumed top→bottom = e B G D A E.
function parseAsciiTab(text: string): HGrid | null {
  const rawLines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, ''));
  const tabLines = rawLines.filter(l => /[-–]/.test(l) && /[|\-]/.test(l) && /[0-9\-]/.test(l));
  if (tabLines.length < 6) return null;

  // Take the last 6 tab-looking lines (handles headers above).
  const six = tabLines.slice(-6);
  const LABEL_ROW: Record<string, number> = { e: 0, b: 1, g: 2, d: 3, a: 4, E: 5 };

  // Strip a leading "e|" / "E|" style label+bar; keep body strings char-aligned.
  const bodies = six.map(line => {
    let s = line;
    const m = s.match(/^\s*([eEbBgGdDaA])\s*[|]?/);
    if (m) s = s.slice(m[0].length);
    else if (s.startsWith('|')) s = s.slice(1);
    return s;
  });

  const width = Math.max(...bodies.map(b => b.length));
  const rows: HCell[][] = ROWS.map(() => Array.from({ length: width }, () => ({ fret: '' } as HCell)));

  bodies.forEach((body, i) => {
    // Determine which grid row this line maps to.
    const lbl = six[i].match(/^\s*([eEbBgGdDaA])/)?.[1];
    let row = i;
    if (lbl) {
      row = lbl === 'E' ? 5 : lbl === 'e' ? 0 : LABEL_ROW[lbl.toLowerCase()] ?? i;
    }
    if (row < 0 || row > 5) row = i;

    for (let ci = 0; ci < body.length; ci++) {
      const ch = body[ci];
      if (ch >= '0' && ch <= '9') {
        // start of a fret number unless we're mid-number
        if (ci > 0 && body[ci - 1] >= '0' && body[ci - 1] <= '9') continue;
        let num = ch;
        if (body[ci + 1] >= '0' && body[ci + 1] <= '9') num += body[ci + 1];
        const techCh = body[ci + num.length];
        const tech = (['h', 'p', 'b', '/', '\\', '~'] as string[]).includes(techCh) ? (techCh as Tech) : undefined;
        rows[row][ci] = tech ? { fret: num, tech } : { fret: num };
      }
    }
  });

  // Collapse columns that are empty across all 6 rows.
  const keep: number[] = [];
  for (let c = 0; c < width; c++) {
    if (rows.some(r => r[c].fret !== '')) keep.push(c);
  }
  if (keep.length === 0) return null;
  const grid: HGrid = rows.map(r => keep.map(c => r[c]));
  // pad to at least DEFAULT_COLS for editing headroom
  if (grid[0].length < DEFAULT_COLS) {
    const pad = DEFAULT_COLS - grid[0].length;
    grid.forEach(r => { for (let k = 0; k < pad; k++) r.push({ fret: '' }); });
  }
  return grid;
}

// ── Scale dropdown data ────────────────────────────────────────────────────────
const SCALE_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const SCALE_TYPES = [
  'major', 'minor', 'dorian', 'mixolydian', 'phrygian', 'lydian', 'locrian',
  'minor pentatonic', 'major pentatonic', 'blues', 'harmonic minor', 'melodic minor',
];

const TECH_BTNS: { id: Tech; label: string }[] = [
  { id: 'h', label: 'h/p' },
  { id: '/', label: '/' },
  { id: 'b', label: 'bend' },
  { id: '~', label: '~' },
];

const LABEL_STYLE: React.CSSProperties = {
  margin: 0, fontSize: 11, fontWeight: 400, color: T.textMuted,
  textTransform: 'uppercase', letterSpacing: '-0.02em',
};
const MONO_LBL: React.CSSProperties = {
  fontSize: 10, fontFamily: 'var(--gc-mono)', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: '#9C958C', margin: '0 0 8px',
};

interface Props {
  tuning: Tuning;
  desktop?: boolean;
}

const COLOR_ORIG  = T.text;
const COLOR_ADDED = T.secondary;

type LoadingKind = 'harmonize' | 'regenerate' | null;

export function MelodyHarmonizerTab({ tuning, desktop }: Props) {
  const [grid, setGrid]         = useState<HGrid>(() => emptyGrid());
  const [sel, setSel]           = useState<[number, number] | null>(null);
  const [scaleRoot, setScaleRoot] = useState('');
  const [scaleType, setScaleType] = useState('major');

  const [styles, setStyles]     = useState<HarmonizeStyle[]>(['3rds']);
  // `result` is what's currently displayed; `savedResult` is the last
  // harmonization computed for the CURRENT melody, kept even while `result`
  // is temporarily hidden by "Edit Melody" so the user can jump back to it.
  const [result, setResult]         = useState<HarmonizeResult | null>(null);
  const [savedResult, setSavedResult] = useState<HarmonizeResult | null>(null);
  const [loadingKind, setLoadingKind] = useState<LoadingKind>(null);
  const [error, setError]       = useState<string | null>(null);
  const [regenSeed, setRegenSeed] = useState(0);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [visionLoading, setVisionLoading] = useState(false);

  const [playing, setPlaying]   = useState(false);
  const [muteHarmony, setMuteHarmony] = useState(false);
  const playTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const fretInputRef = useRef<HTMLInputElement | null>(null);

  const scaleName = scaleRoot ? `${scaleRoot} ${scaleType}` : '';
  const numCols = grid[0]?.length ?? DEFAULT_COLS;

  // Detected scale suggestion from the current melody.
  const detected = useMemo(() => (gridHasNotes(grid) ? detectTabScale(grid, tuning.notes) : null), [grid, tuning]);

  useEffect(() => () => { playTimers.current.forEach(clearTimeout); }, []);

  // ── Editing ──────────────────────────────────────────────────────────────
  // Any real edit to the melody invalidates BOTH the shown result and the
  // remembered one — a harmonization only ever matches the melody it was
  // computed from.
  const editCell = useCallback((row: number, col: number, mutate: (c: HCell) => HCell) => {
    setResult(null);
    setSavedResult(null);
    setGrid(g => g.map((r, ri) => ri === row ? r.map((c, ci) => ci === col ? mutate(c) : c) : r));
  }, []);

  // Digit-by-digit entry (append then clamp to 24) — shared by desktop
  // keydown and the mobile hidden-input's onChange.
  const setFret = (row: number, col: number, digit: string) => {
    editCell(row, col, c => {
      const next = (c.fret + digit).slice(-2);
      const n = parseInt(next, 10);
      return { ...c, fret: (!Number.isNaN(n) && n <= 24) ? String(n) : digit };
    });
  };
  const clearCell = (row: number, col: number) => editCell(row, col, () => ({ fret: '' }));
  const toggleTech = (row: number, col: number, tech: Tech) =>
    editCell(row, col, c => ({ ...c, tech: c.tech === tech ? undefined : tech }));

  // Tap a cell → select it and focus the hidden input to raise the mobile
  // numeric keyboard (no-op on desktop, where it's just an invisible focus).
  const selectCell = (row: number, col: number) => {
    setSel([row, col]);
    fretInputRef.current?.focus();
  };

  // Shared by the global keydown listener (desktop) and the hidden input's
  // own onKeyDown (arrow nav / backspace / tech hotkeys while it has focus).
  const handleEditKey = useCallback((e: {
    key: string; preventDefault: () => void;
  }) => {
    if (!sel) return;
    const [r, c] = sel;
    if (e.key >= '0' && e.key <= '9') { e.preventDefault(); setFret(r, c, e.key); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); clearCell(r, c); }
    else if (['h', 'p', 'b', '/', '\\', '~'].includes(e.key)) { e.preventDefault(); toggleTech(r, c, e.key as Tech); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setSel([r, Math.min(numCols - 1, c + 1)]); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); setSel([r, Math.max(0, c - 1)]); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); setSel([Math.max(0, r - 1), c]); }
    else if (e.key === 'ArrowDown')  { e.preventDefault(); setSel([Math.min(5, r + 1), c]); }
    else if (e.key === 'Escape')     { setSel(null); fretInputRef.current?.blur(); }
  }, [sel, numCols]); // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop keyboard entry on the selected cell — skipped while the hidden
  // input has focus, since its own onKeyDown already calls handleEditKey
  // (avoids handling the same keystroke twice).
  useEffect(() => {
    if (!sel) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      handleEditKey(e);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [sel, handleEditKey]);

  const addColumns = () => setGrid(g => g.map(r => [...r, ...Array.from({ length: 4 }, () => ({ fret: '' as string }))]));
  const clearGrid = () => { setResult(null); setSavedResult(null); setGrid(emptyGrid()); setSel(null); };

  // Hide the harmony overlay and go back to editing the raw melody — the last
  // harmonization is kept in `savedResult` so the user can return to it.
  const editMelody = () => { setResult(null); setError(null); };
  const backToHarmonized = () => { if (savedResult) setResult(savedResult); };

  // ── Display grid (melody + harmony collapsed onto consecutive columns) ────
  // result.columns lives on a sparse "slot" timeline (see SLOT_MULT in
  // harmonizeMelody.ts) that leaves room for inserted melodic passing tones —
  // but most of those slots are empty even for a melodic result, and ALWAYS
  // empty for a purely vertical one. Rendering that raw timeline made the tab
  // absurdly wide (mostly blank columns). We only care about chronological
  // order for display/playback, so compact to just the populated columns.
  const displayGrid: HGrid = useMemo(() => {
    if (!result) return grid;
    const sortedCols = [...result.columns].sort((a, b) => a.col - b.col);
    const width = Math.max(sortedCols.length, 1);
    const g: HGrid = emptyDisplayGrid(width);
    sortedCols.forEach((col, i) => {
      for (const n of col.notes) {
        const row = labelToRow(n.str);
        g[row][i] = { fret: String(n.fret), tech: n.tech as Tech | undefined, added: n.added };
      }
    });
    return g;
  }, [result, grid]);

  // ── Harmonize ──────────────────────────────────────────────────────────────
  const runHarmonize = (seed: number, kind: 'harmonize' | 'regenerate') => {
    if (!gridHasNotes(grid) || !scaleName || styles.length === 0 || loadingKind) return;
    setLoadingKind(kind); setError(null);
    harmonizeMelody(grid, scaleName, styles, tuning, seed)
      .then(r => {
        setLoadingKind(null);
        if (r) { setResult(r); setSavedResult(r); }
        else setError('לא ניתן להרמן כרגע. ודא שמפתח ה-API מוגדר ושיש מלודיה בטאב.');
      })
      .catch(() => { setLoadingKind(null); setError('שגיאת רשת — נסה שוב.'); });
  };
  const handleHarmonize = () => { setRegenSeed(0); runHarmonize(0, 'harmonize'); };
  const handleRegenerate = () => { const s = regenSeed + 1; setRegenSeed(s); runHarmonize(s, 'regenerate'); };

  // ── Image / paste import ────────────────────────────────────────────────────
  const onImageFile = (file: File) => {
    setVisionLoading(true); setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const comma = dataUrl.indexOf(',');
      const base64 = dataUrl.slice(comma + 1);
      const mt = (dataUrl.slice(5, comma).split(';')[0] || 'image/png') as
        'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      extractTabFromImage(base64, mt)
        .then(tc => {
          setVisionLoading(false);
          if (tc) { setResult(null); setSavedResult(null); setGrid(fromTabContent(tc)); }
          else setError('לא ניתן לחלץ טאב מהתמונה. נסה תמונה ברורה יותר.');
        })
        .catch(() => { setVisionLoading(false); setError('שגיאה בעיבוד התמונה.'); });
    };
    reader.readAsDataURL(file);
  };

  const loadPaste = () => {
    const g = parseAsciiTab(pasteText);
    if (g) { setResult(null); setSavedResult(null); setGrid(g); setPasteOpen(false); setPasteText(''); setError(null); }
    else setError('לא זוהה טאב בטקסט. הדבק 6 שורות טאב תקינות.');
  };

  // ── A/B playback ────────────────────────────────────────────────────────────
  const stopPlayback = () => { playTimers.current.forEach(clearTimeout); playTimers.current = []; setPlaying(false); };

  const handlePlay = () => {
    if (playing) { stopPlayback(); return; }
    const g = displayGrid;
    const gWidth = g[0]?.length ?? 0;
    const cols: { fret: number; string: number }[][] = [];
    for (let c = 0; c < gWidth; c++) {
      const notes: { fret: number; string: number }[] = [];
      for (let row = 0; row < 6; row++) {
        const cell = g[row][c];
        if (cell.fret === '') continue;
        if (muteHarmony && cell.added) continue;
        const f = parseInt(cell.fret, 10);
        if (Number.isNaN(f)) continue;
        notes.push({ fret: f, string: labelToLowEIndex(ROWS[row]) });
      }
      if (notes.length) cols.push(notes);
    }
    if (!cols.length) return;
    setPlaying(true);
    unlockAudio();
    const STEP = 380;
    cols.forEach((notes, i) => {
      const t = setTimeout(() => {
        playChord(notes, tuning.openFreqs);
        if (i === cols.length - 1) {
          const done = setTimeout(() => setPlaying(false), 1200);
          playTimers.current.push(done);
        }
      }, i * STEP);
      playTimers.current.push(t);
    });
  };

  const canHarmonize = gridHasNotes(grid) && !!scaleName && styles.length > 0 && !loadingKind;

  // ── Tab grid renderer ──────────────────────────────────────────────────────
  const renderGrid = (g: HGrid, editable: boolean) => (
    <div style={{
      background: 'var(--gc-fretboard-bg)', padding: '8px 6px',
      border: `1px solid ${T.border}`, overflowX: 'auto',
      width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box',
    }}>
      {ROWS.map((lbl, row) => (
        <div key={row} style={{ display: 'flex', alignItems: 'center', userSelect: 'none' }}>
          <span style={{ width: 14, fontSize: 12, fontFamily: 'monospace', color: T.textMuted, textAlign: 'right', paddingRight: 3, flexShrink: 0 }}>{lbl}</span>
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.textMuted, flexShrink: 0 }}>|</span>
          {g[row].map((cell, col) => {
            const isSel = editable && sel?.[0] === row && sel?.[1] === col;
            const color = cell.added ? COLOR_ADDED : COLOR_ORIG;
            return (
              <div
                key={col}
                onClick={editable ? () => selectCell(row, col) : undefined}
                style={{
                  width: CW, height: CH, flexShrink: 0, position: 'relative',
                  cursor: editable ? 'pointer' : 'default',
                }}
              >
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 0, borderTop: `2px solid ${T.border}`, transform: 'translateY(-0.5px)', pointerEvents: 'none' }} />
                {isSel && (
                  <div style={{ position: 'absolute', width: 22, height: 22, background: 'rgba(255,210,0,0.55)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
                )}
                {cell.added && cell.fret !== '' && (
                  <div style={{ position: 'absolute', width: 22, height: 22, background: COLOR_ADDED + '1f', border: `1px solid ${COLOR_ADDED}55`, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
                )}
                {cell.fret !== '' && (
                  <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 12, fontFamily: 'monospace', fontWeight: cell.added ? 700 : 400, color, lineHeight: 1, zIndex: 1 }}>{cell.fret}</span>
                )}
                {cell.tech && (
                  <span style={{ position: 'absolute', top: -2, right: 0, transform: 'translateX(50%)', fontSize: 11, fontFamily: 'monospace', fontStyle: cell.tech === 'h' || cell.tech === 'p' ? 'italic' : 'normal', color: T.coral, lineHeight: 1, zIndex: 2, pointerEvents: 'none' }}>
                    {cell.tech === 'b' ? 'b' : cell.tech}
                  </span>
                )}
              </div>
            );
          })}
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.textMuted, flexShrink: 0 }}>|</span>
        </div>
      ))}
    </div>
  );

  // Hidden numeric input — drives the mobile soft keyboard for fret entry,
  // exactly like Tab Builder. font-size:16 stops iOS auto-zooming on focus.
  const hiddenFretInput = (
    <input
      ref={fretInputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value=""
      aria-hidden="true"
      onChange={e => {
        if (!sel) return;
        const d = e.target.value.replace(/[^0-9]/g, '').slice(-1);
        if (d) setFret(sel[0], sel[1], d);
      }}
      onKeyDown={handleEditKey}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: 1, height: 1, opacity: 0, pointerEvents: 'none',
        fontSize: 16, border: 'none', padding: 0, background: 'transparent',
      }}
    />
  );

  // ── Selected-cell toolbar — technique entry only. Fret digits are typed
  // via the native keyboard (hiddenFretInput above / physical keyboard);
  // Backspace/Delete already clears a fret through handleEditKey, so no
  // separate on-screen "Clear fret" button is needed here.
  const cellToolbar = sel && !result && (
    <div style={{ ...card({ padding: '10px 12px' }), display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={LABEL_STYLE}>Cell {ROWS[sel[0]]} · col {sel[1] + 1}</p>
        <button onClick={() => { setSel(null); fretInputRef.current?.blur(); }} style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: 18, cursor: 'pointer' }}>×</button>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {TECH_BTNS.map(t => {
          const active = grid[sel[0]][sel[1]].tech === t.id;
          return (
            <button key={t.id} onClick={() => toggleTech(sel[0], sel[1], t.id)} style={{
              flex: 1, padding: '6px 0', border: `1px solid ${active ? T.coral : T.border}`,
              background: active ? T.coral : T.bgInput, color: active ? '#fff' : T.textMuted,
              fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
            }}>{t.label}</button>
          );
        })}
      </div>
    </div>
  );

  // ── Left column: input + controls ──────────────────────────────────────────
  const leftCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {hiddenFretInput}
      {/* Input stage */}
      <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <p style={LABEL_STYLE}>Melody Input</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {result ? (
              <button onClick={editMelody} style={editBtn}>✎ Edit Melody</button>
            ) : (
              <>
                {savedResult && (
                  <button onClick={backToHarmonized} style={editBtn}>▸ Back to Harmonized</button>
                )}
                <button onClick={() => fileRef.current?.click()} disabled={visionLoading} style={secBtn(visionLoading)}>
                  {visionLoading ? 'Reading…' : 'Image'}
                </button>
                <button onClick={() => setPasteOpen(p => !p)} style={secBtn(false)}>Paste</button>
              </>
            )}
            <button onClick={clearGrid} style={secBtn(false)}>Clear</button>
          </div>
        </div>
        {result && (
          <p style={{ margin: 0, fontSize: 10, color: T.textDim }}>
            Editing removes the harmony overlay so you can change the original riff — your last harmonization is kept, tap "Back to Harmonized" to see it again.
          </p>
        )}
        {!result && savedResult && (
          <p style={{ margin: 0, fontSize: 10, color: T.textDim }}>
            Showing the original riff. Tap "Back to Harmonized" to see your last result, or edit further and Harmonize again.
          </p>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onImageFile(f); e.target.value = ''; }} />

        {pasteOpen && !result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea
              value={pasteText} onChange={e => setPasteText(e.target.value)}
              placeholder={'e|--0--3--\nB|--1--1--\nG|--0--0--\nD|-------\nA|-------\nE|-------'}
              rows={6}
              style={{ width: '100%', boxSizing: 'border-box', background: T.bgInput, border: `1px solid ${T.border}`, color: T.text, fontFamily: 'monospace', fontSize: 12, padding: 8, resize: 'vertical' }}
            />
            <button onClick={loadPaste} style={{ ...secBtn(false), alignSelf: 'flex-start' }}>Load tab</button>
          </div>
        )}

        {renderGrid(result ? displayGrid : grid, !result)}

        {!result && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addColumns} style={{ ...secBtn(false), flex: 1 }}>+ Columns</button>
            <span style={{ fontSize: 10, color: T.textDim, alignSelf: 'center', flex: 2 }}>
              Tap a cell, then type frets / techniques
            </span>
          </div>
        )}
      </div>

      {cellToolbar}

      {/* Scale (mandatory) */}
      <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={LABEL_STYLE}>Scale / Mode <span style={{ color: T.coral }}>*</span></p>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={scaleRoot} onChange={e => setScaleRoot(e.target.value)} style={selectStyle}>
            <option value="">Root…</option>
            {SCALE_ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={scaleType} onChange={e => setScaleType(e.target.value)} style={selectStyle}>
            {SCALE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {detected && (
          <button
            onClick={() => { setScaleRoot(detected.root); setScaleType(detected.type); }}
            style={{ ...secBtn(false), alignSelf: 'flex-start', fontSize: 11 }}
          >
            Detected: {detected.name} ({detected.fitPercent}%) — use
          </button>
        )}
      </div>

      {/* Harmony styles (multi-select) */}
      <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={LABEL_STYLE}>Harmony Type <span style={{ fontSize: 9, color: T.textDim }}>(multi-select)</span></p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {HARMONY_STYLES.map(s => {
            const active = styles.includes(s.id);
            return (
              <button key={s.id}
                onClick={() => setStyles(cur => active ? cur.filter(x => x !== s.id) : [...cur, s.id])}
                style={{
                  padding: '9px 8px', border: `1.5px solid ${active ? T.secondary : T.border}`,
                  background: active ? T.secondaryBg : T.bgInput,
                  color: active ? T.secondary : T.textMuted,
                  cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 400,
                  textAlign: 'left', lineHeight: 1.3,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        {styles.includes('melodic') && (
          <p style={{ margin: 0, fontSize: 10, color: T.textDim, lineHeight: 1.5 }}>
            Melodic adds an independent moving harmony line with its own passing notes between your melody notes — not just stacked chords.
          </p>
        )}
        {styles.includes('chordmelody') && (
          <p style={{ margin: 0, fontSize: 10, color: T.textDim, lineHeight: 1.5 }}>
            Chord-Melody keeps your original notes as the top voice — every harmony/bass note is placed below it, relocating the melody to a higher string if needed to make room.
          </p>
        )}
      </div>

      {/* Harmonize / Regenerate */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleHarmonize} disabled={!canHarmonize} style={{
          flex: 2, padding: '13px 0', border: 'none',
          cursor: canHarmonize ? 'pointer' : 'not-allowed',
          background: canHarmonize ? T.primary : T.border,
          color: canHarmonize ? '#fff' : T.textDim, fontSize: 15, fontWeight: 400,
          borderLeft: '4px solid var(--gc-bar-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {loadingKind === 'harmonize' ? (<><span style={spinnerStyle('#fff')} /> Harmonizing…</>) : 'Harmonize'}
        </button>
        <button onClick={handleRegenerate} disabled={!result || !!loadingKind} style={{
          flex: 1, padding: '13px 0', border: `1.5px solid ${T.secondary}`,
          cursor: (!result || !!loadingKind) ? 'not-allowed' : 'pointer',
          background: 'transparent', color: (!result || !!loadingKind) ? T.textDim : T.secondary,
          fontSize: 14, opacity: (!result || !!loadingKind) ? 0.5 : 1,
          borderLeft: '4px solid var(--gc-bar-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          {loadingKind === 'regenerate' ? (<><span style={spinnerStyle(T.secondary)} /> Regenerating…</>) : 'Regenerate'}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── Right column: result + player ──────────────────────────────────────────
  const rightCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {error && (
        <div style={{ ...card({ padding: '12px 16px' }), borderLeft: `3px solid ${T.coral}`, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <p style={{ margin: 0, fontSize: 13, color: T.text }}>{error}</p>
        </div>
      )}

      {result && (
        <>
          <div className="gc-result-card" style={{ gap: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <p style={LABEL_STYLE}>Harmonized</p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  onClick={() => setMuteHarmony(m => !m)}
                  style={{
                    padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    background: muteHarmony ? T.bgInput : T.secondary, color: muteHarmony ? T.textMuted : '#fff',
                    borderLeft: '3px solid var(--gc-bar-color)',
                  }}
                >
                  {muteHarmony ? 'Harmony muted' : 'Harmony on'}
                </button>
                <button onClick={handlePlay} className="gc-btn-heavy" style={{
                  padding: '7px 18px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 400, letterSpacing: '0.04em',
                  background: playing ? T.coral : T.primary, color: '#fff', borderLeft: '3px solid var(--gc-bar-color)',
                }}>
                  {playing ? 'STOP' : 'PLAY'}
                </button>
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, fontSize: 10, fontFamily: 'var(--gc-mono)', letterSpacing: '0.06em' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, background: COLOR_ORIG, display: 'inline-block' }} />
                <span style={{ color: T.textMuted }}>MELODY</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, background: COLOR_ADDED, display: 'inline-block' }} />
                <span style={{ color: T.textMuted }}>HARMONY</span>
              </span>
            </div>

            {renderGrid(displayGrid, false)}
          </div>

          {result.analysis && (
            <div style={{ ...card({ padding: '14px 16px' }), borderLeft: `3px solid ${T.secondary}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={MONO_LBL}>AI Analysis</span>
              <p style={{ margin: 0, fontSize: 12, color: T.text, lineHeight: 1.7 }}>{result.analysis}</p>
            </div>
          )}

          <SaveToLibraryButton
            label="Save to Library"
            getPayload={() => ({
              kind: 'tab',
              name: scaleName ? `Harmonized — ${scaleName}` : 'Harmonized melody',
              content: toTabContent(displayGrid, scaleName ? `Harmonized · ${scaleName}` : 'Harmonized melody'),
              music_key: scaleName || null,
            })}
            style={{ width: '100%', justifyContent: 'center', padding: '12px 0' }}
          />
        </>
      )}

      {!result && !error && (
        <div style={{ ...card({ padding: '40px 16px' }), textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted, lineHeight: 1.6 }}>
            {savedResult
              ? 'Editing the riff — tap "Back to Harmonized" to see your last result.'
              : 'Enter a melody, pick a scale, choose harmony types, then Harmonize.'}
          </p>
        </div>
      )}
    </div>
  );

  if (desktop) {
    return (
      // minmax(0, 1fr) — NOT bare 1fr — stops the harmonized tab grid's
      // min-content width from forcing this whole track (and the page) to
      // blow out sideways; the tab grid's own overflow-x:auto then scrolls
      // inside its own box as intended instead.
      <div style={{ display: 'grid', gridTemplateColumns: '400px minmax(0, 1fr)', gap: 36, alignItems: 'start' }}>
        {leftCol}
        <div style={{ position: 'sticky', top: 24, minWidth: 0 }}>{rightCol}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {leftCol}
      {rightCol}
    </div>
  );
}

// ── Small style helpers ────────────────────────────────────────────────────────
function secBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 12px', border: `1px solid ${T.border}`, background: T.bgInput,
    color: disabled ? T.textDim : T.textMuted, fontSize: 11, cursor: disabled ? 'wait' : 'pointer',
    borderLeft: '3px solid var(--gc-bar-color)', whiteSpace: 'nowrap',
  };
}
const editBtn: React.CSSProperties = {
  padding: '5px 12px', border: 'none', background: T.secondary, color: '#fff',
  fontSize: 11, fontWeight: 600, cursor: 'pointer',
  borderLeft: '3px solid var(--gc-bar-color)', whiteSpace: 'nowrap',
};
const selectStyle: React.CSSProperties = {
  flex: 1, padding: '8px 10px', background: T.bgInput, border: `1px solid ${T.border}`,
  color: T.text, fontSize: 13, cursor: 'pointer', borderRadius: 0,
};
function spinnerStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-block', width: 14, height: 14, border: `2px solid ${T.textDim}`,
    borderTopColor: color, borderRadius: 0, animation: 'spin 0.7s linear infinite',
  };
}
