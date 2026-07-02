import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { T, card } from '../../theme';
import type { Tuning } from '../../types/music';
import type { TabContent } from '../../services/types';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { detectTabScale } from '../../utils/analyzeTab';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import {
  harmonizeMelody, HARMONY_STYLES, SLOT_MULT,
  labelToLowEIndex, labelToRow, STR_LABELS,
  type HarmonizeStyle, type HarmonizeResult,
} from '../../utils/harmonizeMelody';
import { extractTabFromImage } from '../../utils/tabVision';

// ── Grid model ───────────────────────────────────────────────────────────────
// The editor deliberately mirrors Tab Builder's model and editing rules
// (TabBuilder.tsx) so building a melody here feels identical to building a
// tab there. `anchor`/`added` are harmonizer-only extensions.
type Tech = 'h' | 'p' | '/' | '\\' | 'b' | '~';
interface HCell { fret: string; tech?: Tech; anchor?: boolean; added?: boolean }
type HGrid = HCell[][];
interface MelodyState { grid: HGrid; bars: number[] }

const ROWS = STR_LABELS;             // e B G D A E  (row 0 = high e)
const DEFAULT_COLS = 16;
// Cell metrics — Tab Builder's BASE_CW/BASE_CH/font at 100% zoom.
const CW = 28;
const CH = 30;
const FS = 13;
const CIRCLE_D = Math.round(CH * 0.72);

function emptyGrid(cols = DEFAULT_COLS): HGrid {
  return ROWS.map(() => Array.from({ length: cols }, () => ({ fret: '' })));
}

function emptyDisplayGrid(cols: number): HGrid {
  return ROWS.map(() => Array.from({ length: cols }, () => ({ fret: '' } as HCell)));
}

function gridHasNotes(g: HGrid): boolean {
  return g.some(r => r.some(c => c.fret !== ''));
}

// TabContent (loose tech:string) → working melody state
function fromTabContent(c: TabContent): MelodyState {
  const cols = c.grid[0]?.length ?? DEFAULT_COLS;
  return {
    grid: ROWS.map((_, row) =>
      Array.from({ length: cols }, (_, col) => {
        const cell = c.grid[row]?.[col];
        return cell?.tech ? { fret: cell.fret ?? '', tech: cell.tech as Tech } : { fret: cell?.fret ?? '' };
      }),
    ),
    bars: (c.bars ?? []).filter(b => typeof b === 'number'),
  };
}

// Display grid + bars → TabContent (strips harmonizer-only flags for storage)
function toTabContent(g: HGrid, bars: number[], title: string): TabContent {
  return {
    title, subtitle: '',
    grid: g.map(row => row.map(c => (c.tech ? { fret: c.fret, tech: c.tech } : { fret: c.fret }))),
    bars,
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

// Same technique set (labels, symbols, hotkeys) as Tab Builder, plus Bar.
const TECH_BTNS: { id: Tech | '|'; label: string; sym: string; key: string }[] = [
  { id: 'h', label: 'Hammer/Pull', sym: 'h/p', key: 'H' },
  { id: '/', label: 'Slide',       sym: '/',   key: '/' },
  { id: 'b', label: 'Bend',        sym: 'b',   key: 'B' },
  { id: '~', label: 'Vibrato',     sym: '~',   key: '~' },
  { id: '|', label: 'Bar',         sym: '|',   key: '|' },
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
// Harmony (AI-added) notes — blue brand accent, clearly distinct from the
// black melody notes.
const COLOR_ADDED = T.brandAccent;
// Soft highlighter drawn behind the user's ORIGINAL notes in the result
// view, so the source tab stands out inside the arrangement.
const MELODY_MARK = 'rgba(255, 210, 0, 0.45)';

type LoadingKind = 'harmonize' | 'regenerate' | null;

export function MelodyHarmonizerTab({ tuning, desktop }: Props) {
  const [melody, setMelody] = useState<MelodyState>(() => ({ grid: emptyGrid(), bars: [] }));
  const [sel, setSel]           = useState<[number, number] | null>(null);
  const [hov, setHov]           = useState<[number, number] | null>(null);
  const [canUndo, setCanUndo]   = useState(false);
  const [scaleRoot, setScaleRoot] = useState('');
  const [scaleType, setScaleType] = useState('major');

  const [styles, setStyles]     = useState<HarmonizeStyle[]>(['3rds']);
  // The harmonized result, shown only in the result panel — the input grid
  // always keeps showing the user's original, editable tab. Any melody edit
  // invalidates the result (it no longer matches what's on screen).
  const [result, setResult]         = useState<HarmonizeResult | null>(null);
  const [loadingKind, setLoadingKind] = useState<LoadingKind>(null);
  const [pdfBusy, setPdfBusy]   = useState(false);
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

  const { grid, bars } = melody;
  const barsSet = useMemo(() => new Set(bars), [bars]);
  const scaleName = scaleRoot ? `${scaleRoot} ${scaleType}` : '';
  const numCols = grid[0]?.length ?? DEFAULT_COLS;

  // Detected scale suggestion from the current melody.
  const detected = useMemo(() => (gridHasNotes(grid) ? detectTabScale(grid, tuning.notes) : null), [grid, tuning]);

  useEffect(() => () => { playTimers.current.forEach(clearTimeout); }, []);

  // ── Editing — same history + mutation pattern as Tab Builder ─────────────
  const melodyRef = useRef<MelodyState>(melody);
  useEffect(() => { melodyRef.current = melody; }, [melody]);
  const histRef = useRef<MelodyState[]>([]);

  // Push current state to history, apply updater. Any melody edit also
  // invalidates the shown result — a harmonization only ever matches the
  // melody it was computed from.
  const withHistory = useCallback((fn: (p: MelodyState) => MelodyState) => {
    histRef.current = [...histRef.current.slice(-30), melodyRef.current];
    setCanUndo(true);
    setResult(null);
    setMelody(fn);
  }, []);

  const undo = useCallback(() => {
    if (!histRef.current.length) return;
    const prev = histRef.current[histRef.current.length - 1];
    histRef.current = histRef.current.slice(0, -1);
    setCanUndo(histRef.current.length > 0);
    setResult(null);
    setMelody(prev);
  }, []);

  const setCell = useCallback((s: number, c: number, patch: Partial<HCell>) => {
    withHistory(p => {
      const g = p.grid.map(r => [...r]);
      g[s][c] = { ...g[s][c], ...patch };
      return { ...p, grid: g };
    });
  }, [withHistory]);

  // Digit entry — Tab Builder's exact rule: append to a 1-digit fret when
  // the combination stays ≤ 24, otherwise start over with the new digit.
  const applyDigit = useCallback((d: string) => {
    if (!sel) return;
    const [s, c] = sel;
    const cur = grid[s][c].fret;
    if (cur.length === 1 && parseInt(cur + d) <= 24) setCell(s, c, { fret: cur + d });
    else setCell(s, c, { fret: d });
  }, [sel, grid, setCell]);

  // Toggle a technique and advance to the next column, like Tab Builder.
  const applyTech = useCallback((tech: Tech) => {
    if (!sel) return;
    const [s, c] = sel;
    const toggled = grid[s][c].tech === tech ? undefined : tech;
    setCell(s, c, { tech: toggled });
    if (toggled && c + 1 < numCols) setSel([s, c + 1]);
  }, [sel, grid, numCols, setCell]);

  const toggleBar = useCallback(() => {
    if (!sel) return;
    const c = sel[1];
    withHistory(p => ({
      ...p,
      bars: p.bars.includes(c) ? p.bars.filter(b => b !== c) : [...p.bars, c],
    }));
  }, [sel, withHistory]);

  const toggleAnchor = useCallback(() => {
    if (!sel) return;
    const [s, c] = sel;
    setCell(s, c, { anchor: !grid[s][c].anchor });
  }, [sel, grid, setCell]);

  // Shared by the global keydown listener (desktop) and the hidden input
  // (mobile) — identical key map to Tab Builder, plus 'a' for the
  // harmonizer's anchor tool.
  const handleEditKey = useCallback((e: {
    key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; preventDefault: () => void;
  }) => {
    if (!sel) return;
    const [s, c] = sel;

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      applyDigit(e.key);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      setCell(s, c, { fret: '', tech: undefined, anchor: undefined });
    } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault();
      if (c + 1 < numCols) setSel([s, c + 1]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (c > 0) setSel([s, c - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (s < 5) setSel([s + 1, c]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (s > 0) setSel([s - 1, c]);
    } else if (e.key === 'Escape') {
      setSel(null);
      fretInputRef.current?.blur();
    } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (['h', '/', 'b', '~'].includes(e.key)) {
      e.preventDefault();
      applyTech(e.key as Tech);
    } else if (e.key === '|') {
      e.preventDefault();
      toggleBar();
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      toggleAnchor();
    }
  }, [sel, numCols, applyDigit, setCell, undo, applyTech, toggleBar, toggleAnchor]);

  // Desktop keyboard entry — skipped while a real form control has focus
  // (the hidden fret input's own onKeyDown already routes to handleEditKey).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      handleEditKey(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleEditKey]);

  // Tap a cell → select it and focus the hidden input to raise the mobile
  // numeric keyboard (no-op on desktop, where it's just an invisible focus).
  const selectCell = (row: number, col: number) => {
    setSel([row, col]);
    fretInputRef.current?.focus();
  };

  const addColumns = () => withHistory(p => ({
    ...p,
    grid: p.grid.map(r => [...r, ...Array.from({ length: 4 }, () => ({ fret: '' }))]),
  }));
  const clearGrid = () => { withHistory(() => ({ grid: emptyGrid(), bars: [] })); setSel(null); };

  // ── Display grid (melody + harmony collapsed onto consecutive columns) ────
  // result.columns lives on a sparse "slot" timeline (see SLOT_MULT in
  // harmonizeMelody.ts) that leaves room for inserted melodic passing tones —
  // but most of those slots are empty even for a melodic result. We only care
  // about chronological order for display/playback, so compact to just the
  // populated columns, and remap the input grid's bar positions onto the
  // compacted indices (a bar after input column c follows slot c*SLOT_MULT).
  const { displayGrid, displayBars } = useMemo(() => {
    if (!result) return { displayGrid: grid, displayBars: bars };
    const sortedCols = [...result.columns].sort((a, b) => a.col - b.col);
    const width = Math.max(sortedCols.length, 1);
    const g: HGrid = emptyDisplayGrid(width);
    const slotToIndex = new Map<number, number>();
    sortedCols.forEach((col, i) => {
      slotToIndex.set(col.col, i);
      for (const n of col.notes) {
        const row = labelToRow(n.str);
        g[row][i] = { fret: String(n.fret), tech: n.tech as Tech | undefined, added: n.added };
      }
    });
    const b = bars
      .map(c => slotToIndex.get(c * SLOT_MULT))
      .filter((i): i is number => i !== undefined);
    return { displayGrid: g, displayBars: b };
  }, [result, grid, bars]);

  // ── Harmonize ──────────────────────────────────────────────────────────────
  const runHarmonize = (seed: number, kind: 'harmonize' | 'regenerate') => {
    if (!gridHasNotes(grid) || !scaleName || styles.length === 0 || loadingKind) return;
    setLoadingKind(kind); setError(null);
    harmonizeMelody(grid, scaleName, styles, tuning, seed)
      .then(r => {
        setLoadingKind(null);
        if (r) {
          // No manual anchors were marked — the AI picked them itself.
          // Reflect its choices back onto the grid so the user sees (and
          // can edit) exactly which notes it treated as anchors. Direct
          // setMelody: an AI annotation, not a user edit — no history push,
          // no result invalidation.
          if (r.autoAnchorSlots && r.autoAnchorSlots.length > 0) {
            const anchorCols = new Set(r.autoAnchorSlots.map(slot => Math.round(slot / SLOT_MULT)));
            setMelody(m => ({
              ...m,
              grid: m.grid.map(row => row.map((c, col) =>
                (anchorCols.has(col) && c.fret !== '') ? { ...c, anchor: true } : c
              )),
            }));
          }
          setResult(r);
        }
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
          if (tc) withHistory(() => fromTabContent(tc));
          else setError('לא ניתן לחלץ טאב מהתמונה. נסה תמונה ברורה יותר.');
        })
        .catch(() => { setVisionLoading(false); setError('שגיאה בעיבוד התמונה.'); });
    };
    reader.readAsDataURL(file);
  };

  const loadPaste = () => {
    const g = parseAsciiTab(pasteText);
    if (g) { withHistory(() => ({ grid: g, bars: [] })); setPasteOpen(false); setPasteText(''); setError(null); }
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

  // ── PDF export — same renderer + layout as Tab Builder's tab PDFs ─────────
  const handleExportPdf = async () => {
    if (!result || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { exportTabPDF } = await import('../../utils/pdfExport');
      const title = scaleName ? `Harmonized — ${scaleName}` : 'Harmonized melody';
      await exportTabPDF(
        title,
        result.analysis ?? '',
        displayGrid.map(row => row.map(c => ({ fret: c.fret, tech: c.tech }))),
        displayBars,
        [...ROWS],
        20,
      );
    } finally {
      setPdfBusy(false);
    }
  };

  // ── Tab grid renderer — cell visuals copied from Tab Builder ──────────────
  const renderGrid = (g: HGrid, gridBars: number[], editable: boolean) => {
    const gBarsSet = new Set(gridBars);
    return (
      <div
        // Mobile's SwipePager wraps the whole tab panel in its own pointer
        // handlers to detect horizontal swipes between VOICINGS/PRACTICE/etc.
        // Without this, a finger dragging horizontally to scroll THIS grid
        // can get intermittently captured by that outer swipe detector mid-
        // gesture — the native scroll stutters/interrupts. Stopping the
        // pointerdown from bubbling keeps SwipePager from ever seeing a
        // gesture that started inside the grid, while leaving this element's
        // own native scrolling completely untouched.
        onPointerDownCapture={e => e.stopPropagation()}
        onMouseLeave={() => setHov(null)}
        style={{
          background: 'var(--gc-fretboard-bg)', padding: '8px 4px',
          border: `1px solid ${T.border}`, overflowX: 'auto',
          width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box',
        }}
      >
        {ROWS.map((lbl, row) => (
          <div key={row} style={{ display: 'flex', alignItems: 'center', userSelect: 'none' }}>
            <span style={{ width: 14, fontSize: FS, fontFamily: 'monospace', color: T.textMuted, textAlign: 'right', paddingRight: 3, flexShrink: 0 }}>{lbl}</span>
            <span style={{ fontSize: FS, fontFamily: 'monospace', color: T.textMuted, flexShrink: 0 }}>|</span>
            {g[row].map((cell, col) => {
              const isSel = editable && sel?.[0] === row && sel?.[1] === col;
              const isHov = editable && hov?.[0] === row && hov?.[1] === col;
              const isBar = gBarsSet.has(col);
              const color = cell.added ? COLOR_ADDED : COLOR_ORIG;

              return (
                <React.Fragment key={col}>
                  <div
                    onClick={editable ? () => selectCell(row, col) : undefined}
                    onMouseEnter={editable ? () => setHov([row, col]) : undefined}
                    style={{
                      width: CW, height: CH, flexShrink: 0, position: 'relative',
                      cursor: editable ? 'pointer' : 'default',
                    }}
                  >
                    {/* String line through vertical center */}
                    <div style={{
                      position: 'absolute', top: '50%', left: 0, right: 0, height: 0,
                      borderTop: `2px solid ${T.border}`, transform: 'translateY(-0.5px)',
                      pointerEvents: 'none',
                    }} />

                    {/* Hover circle (light) */}
                    {isHov && !isSel && (
                      <div style={{
                        position: 'absolute', width: CIRCLE_D, height: CIRCLE_D, borderRadius: 0,
                        background: 'rgba(255, 220, 80, 0.32)',
                        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                      }} />
                    )}

                    {/* Selected circle (solid) */}
                    {isSel && (
                      <div style={{
                        position: 'absolute', width: CIRCLE_D, height: CIRCLE_D, borderRadius: 0,
                        background: 'rgba(255, 210, 0, 0.60)',
                        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                      }} />
                    )}

                    {/* Result view: highlighter behind the user's ORIGINAL
                        notes — the source tab pops out of the arrangement */}
                    {!editable && !cell.added && cell.fret !== '' && (
                      <div style={{ position: 'absolute', width: CIRCLE_D, height: CIRCLE_D, background: MELODY_MARK, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
                    )}

                    {/* Harmonizer: anchor marker */}
                    {cell.anchor && cell.fret !== '' && (
                      <span style={{ position: 'absolute', top: -2, left: 2, fontSize: 12, fontWeight: 700, color: T.secondary, lineHeight: 1, zIndex: 2, pointerEvents: 'none' }}>
                        ›
                      </span>
                    )}

                    {/* Fret number — in the result view the ORIGINAL melody
                        is the emphasized voice (bold), harmony stays light */}
                    {cell.fret !== '' && (
                      <span style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: FS, fontFamily: 'monospace',
                        fontWeight: !editable && !cell.added ? 700 : 400, color,
                        lineHeight: 1, zIndex: 1,
                      }}>
                        {cell.fret}
                      </span>
                    )}

                    {/* Technique marks — identical to Tab Builder */}
                    {(cell.tech === '/' || cell.tech === '\\') && (
                      <span style={{
                        position: 'absolute', top: '50%', right: 0,
                        transform: 'translate(50%, -50%)',
                        fontSize: Math.round(FS * 1.5), fontFamily: 'monospace',
                        fontWeight: 400, color: T.coral,
                        lineHeight: 1, zIndex: 2, pointerEvents: 'none',
                      }}>
                        {cell.tech}
                      </span>
                    )}
                    {(cell.tech === 'h' || cell.tech === 'p') && (
                      <span style={{
                        position: 'absolute', top: -2, right: 0,
                        transform: 'translateX(50%)',
                        fontSize: Math.round(FS * 1.1), fontFamily: 'monospace',
                        fontWeight: 400, fontStyle: 'italic', color: T.coral,
                        lineHeight: 1, zIndex: 2, pointerEvents: 'none',
                      }}>
                        {cell.tech}
                      </span>
                    )}
                    {cell.tech === 'b' && (
                      <svg
                        width={Math.round(CW * 0.7)} height={Math.round(CH * 0.32)}
                        viewBox="0 0 20 8"
                        style={{
                          position: 'absolute', top: 0, right: 0,
                          transform: 'translateX(50%)',
                          zIndex: 2, pointerEvents: 'none',
                        }}>
                        <path d="M 1 7 Q 10 -3 19 7" fill="none"
                          stroke="currentColor" strokeWidth="1.6"
                          strokeLinecap="round" style={{ color: T.coral }} />
                      </svg>
                    )}
                    {cell.tech === '~' && (
                      <span style={{
                        position: 'absolute', top: -1, left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: Math.round(FS * 1.3), fontFamily: 'monospace',
                        fontWeight: 400, color: T.coral,
                        lineHeight: 1, zIndex: 2, pointerEvents: 'none',
                        letterSpacing: -1,
                      }}>
                        ~
                      </span>
                    )}
                  </div>

                  {/* Bar line */}
                  {isBar && (
                    <div style={{ width: 2, height: CH, background: T.border, flexShrink: 0 }} />
                  )}
                </React.Fragment>
              );
            })}
            <span style={{ fontSize: FS, fontFamily: 'monospace', color: T.textMuted, flexShrink: 0 }}>|</span>
          </div>
        ))}
      </div>
    );
  };

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
        const d = e.target.value.replace(/[^0-9]/g, '').slice(-1);
        if (d) applyDigit(d);
      }}
      onKeyDown={handleEditKey}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: 1, height: 1, opacity: 0, pointerEvents: 'none',
        fontSize: 16, border: 'none', padding: 0, background: 'transparent',
      }}
    />
  );

  // ── Selected-cell toolbar — Tab Builder's technique set (+ Bar), plus the
  // harmonizer's Anchor toggle. Fret digits are typed via the native
  // keyboard; Backspace/Delete clears through handleEditKey.
  const selTech = sel ? grid[sel[0]][sel[1]].tech : undefined;
  const cellToolbar = sel && (
    <div style={{ ...card({ padding: '10px 12px' }), display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={LABEL_STYLE}>Cell {ROWS[sel[0]]} · col {sel[1] + 1}</p>
        <button onClick={() => { setSel(null); fretInputRef.current?.blur(); }} style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: 18, cursor: 'pointer' }}>×</button>
      </div>
      <button
        onClick={toggleAnchor}
        disabled={grid[sel[0]][sel[1]].fret === ''}
        style={{
          width: '100%', padding: '7px 0',
          border: `1.5px solid ${grid[sel[0]][sel[1]].anchor ? T.secondary : T.border}`,
          background: grid[sel[0]][sel[1]].anchor ? T.secondaryBg : T.bgInput,
          color: grid[sel[0]][sel[1]].anchor ? T.secondary : T.textMuted,
          fontSize: 11, fontWeight: grid[sel[0]][sel[1]].anchor ? 700 : 400, cursor: 'pointer',
          opacity: grid[sel[0]][sel[1]].fret === '' ? 0.5 : 1,
        }}
      >
        › {grid[sel[0]][sel[1]].anchor ? 'Harmonize Anchor ✓' : 'Harmonize Anchor'}
      </button>
      <div style={{ display: 'flex', gap: 4 }}>
        {TECH_BTNS.map(t => {
          const isArmed = t.id === '|' ? barsSet.has(sel[1]) : selTech === t.id;
          return (
            <button
              key={t.id}
              onClick={() => t.id === '|' ? toggleBar() : applyTech(t.id as Tech)}
              title={`${t.label} [${t.key}]`}
              style={{
                flex: 1, padding: '6px 0', border: `1px solid ${isArmed ? T.coral : T.border}`,
                background: isArmed ? T.coral : T.bgInput, color: isArmed ? '#fff' : T.textMuted,
                fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
              }}
            >{t.sym}</button>
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
            <button onClick={() => fileRef.current?.click()} disabled={visionLoading} style={secBtn(visionLoading)}>
              {visionLoading ? 'Reading…' : 'Image'}
            </button>
            <button onClick={() => setPasteOpen(p => !p)} style={secBtn(false)}>Paste</button>
            <button onClick={clearGrid} style={secBtn(false)}>Clear</button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onImageFile(f); e.target.value = ''; }} />

        {pasteOpen && (
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

        {/* Always the user's original, editable tab — the harmonized result
            lives only in the result panel, never here. */}
        {renderGrid(grid, bars, true)}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={addColumns} style={{ ...secBtn(false), flex: 1 }}>+ Columns</button>
          <button onClick={undo} disabled={!canUndo} style={{ ...secBtn(!canUndo), flex: 1, opacity: canUndo ? 1 : 0.5 }}>↺ Undo</button>
          <span style={{ fontSize: 10, color: T.textDim, alignSelf: 'center', flex: 2 }}>
            Tap a cell, then type frets / techniques
          </span>
        </div>
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
            Chord-Melody builds a master-class solo-guitar arrangement: your melody always on top, max 3-4 note voicings built from root + guide tones (3rd/7th, 5th omitted), bass landing only on your anchors and ringing between them, open-string campanella and pedal points, half-step voice leading, slash/poly-chord colors, and reharmonization under static melody notes.
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

            {/* Legend — melody: highlighted original notes; harmony: blue */}
            <div style={{ display: 'flex', gap: 16, fontSize: 10, fontFamily: 'var(--gc-mono)', letterSpacing: '0.06em' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, background: MELODY_MARK, border: `1px solid ${T.text}`, boxSizing: 'border-box', display: 'inline-block' }} />
                <span style={{ color: T.textMuted }}>MELODY (YOURS)</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, background: COLOR_ADDED, display: 'inline-block' }} />
                <span style={{ color: T.textMuted }}>HARMONY (AI)</span>
              </span>
            </div>

            {renderGrid(displayGrid, displayBars, false)}
          </div>

          {result.analysis && (
            <div style={{ ...card({ padding: '14px 16px' }), borderLeft: `3px solid ${T.secondary}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={MONO_LBL}>AI Analysis</span>
              <p style={{ margin: 0, fontSize: 12, color: T.text, lineHeight: 1.7 }}>{result.analysis}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <SaveToLibraryButton
              label="Save to Library"
              getPayload={() => ({
                kind: 'tab',
                name: scaleName ? `Harmonized — ${scaleName}` : 'Harmonized melody',
                content: toTabContent(displayGrid, displayBars, scaleName ? `Harmonized · ${scaleName}` : 'Harmonized melody'),
                music_key: scaleName || null,
              })}
              style={{ flex: 1, justifyContent: 'center', padding: '12px 0' }}
            />
            <button
              onClick={handleExportPdf}
              disabled={pdfBusy}
              style={{
                flex: 1, padding: '12px 0',
                border: `1.5px solid ${T.secondary}`, background: 'transparent',
                color: T.secondary, fontSize: 12.5, fontWeight: 400,
                textTransform: 'uppercase', letterSpacing: '-0.02em',
                cursor: pdfBusy ? 'wait' : 'pointer',
                borderLeft: '3px solid var(--gc-bar-color)', whiteSpace: 'nowrap',
              }}
            >
              {pdfBusy ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        </>
      )}

      {/* Desktop only — fills the otherwise-empty right column before a
          result exists. On mobile this would just repeat the form the
          user is already looking at, right below it, so it's skipped. */}
      {desktop && !result && !error && (
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
