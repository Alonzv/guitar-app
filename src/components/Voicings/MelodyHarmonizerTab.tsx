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

export function MelodyHarmonizerTab({ tuning, desktop }: Props) {
  const [grid, setGrid]         = useState<HGrid>(() => emptyGrid());
  const [sel, setSel]           = useState<[number, number] | null>(null);
  const [scaleRoot, setScaleRoot] = useState('');
  const [scaleType, setScaleType] = useState('major');

  const [styles, setStyles]     = useState<HarmonizeStyle[]>(['3rds']);
  const [result, setResult]     = useState<HarmonizeResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [regenSeed, setRegenSeed] = useState(0);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [visionLoading, setVisionLoading] = useState(false);

  const [playing, setPlaying]   = useState(false);
  const [muteHarmony, setMuteHarmony] = useState(false);
  const playTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const scaleName = scaleRoot ? `${scaleRoot} ${scaleType}` : '';
  const numCols = grid[0]?.length ?? DEFAULT_COLS;

  // Detected scale suggestion from the current melody.
  const detected = useMemo(() => (gridHasNotes(grid) ? detectTabScale(grid, tuning.notes) : null), [grid, tuning]);

  useEffect(() => () => { playTimers.current.forEach(clearTimeout); }, []);

  // ── Editing ──────────────────────────────────────────────────────────────
  const editCell = useCallback((row: number, col: number, mutate: (c: HCell) => HCell) => {
    setResult(null);            // any edit invalidates the harmonization
    setGrid(g => g.map((r, ri) => ri === row ? r.map((c, ci) => ci === col ? mutate(c) : c) : r));
  }, []);

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

  // Desktop keyboard entry on the selected cell.
  useEffect(() => {
    if (!sel) return;
    const handler = (e: KeyboardEvent) => {
      const [r, c] = sel;
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); setFret(r, c, e.key); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); clearCell(r, c); }
      else if (['h', 'p', 'b', '/', '\\', '~'].includes(e.key)) { e.preventDefault(); toggleTech(r, c, e.key as Tech); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setSel([r, Math.min(numCols - 1, c + 1)]); }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); setSel([r, Math.max(0, c - 1)]); }
      else if (e.key === 'ArrowUp')    { e.preventDefault(); setSel([Math.max(0, r - 1), c]); }
      else if (e.key === 'ArrowDown')  { e.preventDefault(); setSel([Math.min(5, r + 1), c]); }
      else if (e.key === 'Escape')     setSel(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [sel, numCols]); // eslint-disable-line react-hooks/exhaustive-deps

  const addColumns = () => setGrid(g => g.map(r => [...r, ...Array.from({ length: 4 }, () => ({ fret: '' as string }))]));
  const clearGrid = () => { setResult(null); setGrid(emptyGrid()); setSel(null); };
  const editMelody = () => { setResult(null); setError(null); };

  // ── Display grid (melody + harmony merged) ─────────────────────────────────
  const displayGrid: HGrid = useMemo(() => {
    if (!result) return grid;
    const g: HGrid = grid.map(r => r.map(c => ({ ...c, added: false })));
    for (const col of result.columns) {
      if (col.col < 0 || col.col >= numCols) continue;
      for (let row = 0; row < 6; row++) g[row][col.col] = { fret: '' };  // clear the column
      for (const n of col.notes) {
        const row = labelToRow(n.str);
        g[row][col.col] = { fret: String(n.fret), tech: n.tech as Tech | undefined, added: n.added };
      }
    }
    return g;
  }, [result, grid, numCols]);

  // ── Harmonize ──────────────────────────────────────────────────────────────
  const runHarmonize = (seed: number) => {
    if (!gridHasNotes(grid) || !scaleName || styles.length === 0 || loading) return;
    setLoading(true); setError(null);
    harmonizeMelody(grid, scaleName, styles, tuning, seed)
      .then(r => {
        setLoading(false);
        if (r) setResult(r);
        else setError('לא ניתן להרמן כרגע. ודא שמפתח ה-API מוגדר ושיש מלודיה בטאב.');
      })
      .catch(() => { setLoading(false); setError('שגיאת רשת — נסה שוב.'); });
  };
  const handleHarmonize = () => { setRegenSeed(0); runHarmonize(0); };
  const handleRegenerate = () => { const s = regenSeed + 1; setRegenSeed(s); runHarmonize(s); };

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
          if (tc) { setResult(null); setGrid(fromTabContent(tc)); }
          else setError('לא ניתן לחלץ טאב מהתמונה. נסה תמונה ברורה יותר.');
        })
        .catch(() => { setVisionLoading(false); setError('שגיאה בעיבוד התמונה.'); });
    };
    reader.readAsDataURL(file);
  };

  const loadPaste = () => {
    const g = parseAsciiTab(pasteText);
    if (g) { setResult(null); setGrid(g); setPasteOpen(false); setPasteText(''); setError(null); }
    else setError('לא זוהה טאב בטקסט. הדבק 6 שורות טאב תקינות.');
  };

  // ── A/B playback ────────────────────────────────────────────────────────────
  const stopPlayback = () => { playTimers.current.forEach(clearTimeout); playTimers.current = []; setPlaying(false); };

  const handlePlay = () => {
    if (playing) { stopPlayback(); return; }
    const g = displayGrid;
    const cols: { fret: number; string: number }[][] = [];
    for (let c = 0; c < numCols; c++) {
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
    const STEP = 460;
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

  const canHarmonize = gridHasNotes(grid) && !!scaleName && styles.length > 0 && !loading;

  // ── Tab grid renderer ──────────────────────────────────────────────────────
  const renderGrid = (g: HGrid, editable: boolean) => (
    <div style={{
      background: 'var(--gc-fretboard-bg)', padding: '8px 6px',
      border: `1px solid ${T.border}`, overflowX: 'auto',
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
                onClick={editable ? () => setSel([row, col]) : undefined}
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

  // ── Selected-cell toolbar (mobile-friendly entry) ──────────────────────────
  const cellToolbar = sel && !result && (
    <div style={{ ...card({ padding: '10px 12px' }), display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={LABEL_STYLE}>Cell {ROWS[sel[0]]} · col {sel[1] + 1}</p>
        <button onClick={() => setSel(null)} style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: 18, cursor: 'pointer' }}>×</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {Array.from({ length: 13 }, (_, n) => (
          <button key={n} onClick={() => setFret(sel[0], sel[1], String(n))} style={{
            padding: '7px 0', border: `1px solid ${T.border}`, background: T.bgInput,
            color: T.text, fontSize: 13, fontFamily: 'monospace', cursor: 'pointer',
          }}>{n}</button>
        ))}
        <button onClick={() => clearCell(sel[0], sel[1])} style={{
          padding: '7px 0', border: `1px solid ${T.border}`, background: T.bgInput,
          color: T.coral, fontSize: 13, cursor: 'pointer', gridColumn: 'span 1',
        }}>⌫</button>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Input stage */}
      <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <p style={LABEL_STYLE}>Melody Input</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {result ? (
              <button onClick={editMelody} style={editBtn}>✎ Edit Melody</button>
            ) : (
              <>
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
            Editing removes the harmony notes so you can change the original riff — harmonize again when ready.
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
          {loading ? (<><span style={spinner} /> Harmonizing…</>) : 'Harmonize'}
        </button>
        <button onClick={handleRegenerate} disabled={!result || loading} style={{
          flex: 1, padding: '13px 0', border: `1.5px solid ${T.secondary}`,
          cursor: (!result || loading) ? 'not-allowed' : 'pointer',
          background: 'transparent', color: (!result || loading) ? T.textDim : T.secondary,
          fontSize: 14, opacity: (!result || loading) ? 0.5 : 1,
          borderLeft: '4px solid var(--gc-bar-color)',
        }}>
          Regenerate
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── Right column: result + player ──────────────────────────────────────────
  const rightCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div style={{ ...card({ padding: '12px 16px' }), borderLeft: `3px solid ${T.coral}`, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <p style={{ margin: 0, fontSize: 13, color: T.text }}>{error}</p>
        </div>
      )}

      {result && (
        <>
          <div className="gc-result-card" style={{ gap: 10 }}>
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
            Enter a melody, pick a scale, choose harmony types, then Harmonize.
          </p>
        </div>
      )}
    </div>
  );

  if (desktop) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 36, alignItems: 'start' }}>
        {leftCol}
        <div style={{ position: 'sticky', top: 24 }}>{rightCol}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
const spinner: React.CSSProperties = {
  display: 'inline-block', width: 14, height: 14, border: `2px solid ${T.textDim}`,
  borderTopColor: '#fff', borderRadius: 0, animation: 'spin 0.7s linear infinite',
};
