import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { T, card } from '../../theme';
import type { Tuning } from '../../types/music';
import type { TabContent } from '../../services/types';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { detectTabScale } from '../../utils/analyzeTab';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import {
  harmonizeMelody, revoiceColumn, HARMONY_STYLES, SLOT_MULT,
  labelToLowEIndex, labelToRow, noteMidi, STR_LABELS,
  type HarmonizeStyle, type HarmonizeResult,
} from '../../utils/harmonizeMelody';
import { extractTabFromImage, fileToVisionPayload } from '../../utils/tabVision';
import { exportNotesMidi } from '../../utils/midiExport';
import { requestOpenTabInBuilder, consumePendingHarmonization, subscribeHarmonizationHandoff, type HarmonizationHandoff } from '../../services/handoff';
import { TabNoteCell } from '../Tabs/TabNoteCell';

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

// Autosave keys — the component unmounts whenever the user switches to
// another VOICINGS sub-tab, so without persistence a moment in Paths would
// silently wipe the melody. Same localStorage pattern as Tab Builder.
const LS_MELODY = 'scaleup_harmonizer_melody';
const LS_PREFS  = 'scaleup_harmonizer_prefs';

function loadSavedMelody(): MelodyState {
  try {
    const s = localStorage.getItem(LS_MELODY);
    if (s) {
      const p = JSON.parse(s) as MelodyState;
      if (Array.isArray(p?.grid) && p.grid.length === 6 && Array.isArray(p.grid[0])) {
        return { grid: p.grid, bars: Array.isArray(p.bars) ? p.bars : [] };
      }
    }
  } catch { /* corrupted autosave — start fresh */ }
  return { grid: emptyGrid(), bars: [] };
}

interface SavedPrefs { scaleRoot?: string; scaleType?: string; styles?: string[]; bpm?: number }
function loadSavedPrefs(): SavedPrefs {
  try { return JSON.parse(localStorage.getItem(LS_PREFS) ?? '{}') as SavedPrefs; }
  catch { return {}; }
}

export function MelodyHarmonizerTab({ tuning, desktop }: Props) {
  const [melody, setMelody] = useState<MelodyState>(loadSavedMelody);
  const [sel, setSel]           = useState<[number, number] | null>(null);
  const [hov, setHov]           = useState<[number, number] | null>(null);
  const [canUndo, setCanUndo]   = useState(false);
  const [scaleRoot, setScaleRoot] = useState(() => loadSavedPrefs().scaleRoot ?? '');
  const [scaleType, setScaleType] = useState(() => {
    const t = loadSavedPrefs().scaleType;
    return t && SCALE_TYPES.includes(t) ? t : 'major';
  });

  const [styles, setStyles]     = useState<HarmonizeStyle[]>(() => {
    const valid = new Set(HARMONY_STYLES.map(s => s.id));
    const saved = (loadSavedPrefs().styles ?? []).filter((s): s is HarmonizeStyle => valid.has(s as HarmonizeStyle));
    // Chord-Melody is standalone — normalize prefs saved before that rule
    // existed (or hand-edited) so the forbidden combo can't sneak back in.
    if (saved.includes('chordmelody')) return ['chordmelody'];
    return saved.length > 0 ? saved : ['3rds'];
  });
  // Tempo for playback + MIDI: one input-grid column = one eighth note.
  const [bpm, setBpm] = useState(() => {
    const b = loadSavedPrefs().bpm;
    return typeof b === 'number' && b >= 40 && b <= 240 ? b : 120;
  });
  // Harmonized results, shown only in the result panel — the input grid
  // always keeps showing the user's original, editable tab. Harmonize starts
  // a fresh list; each Regenerate APPENDS a variation (V1, V2, …) instead of
  // discarding the previous one, so good takes are never lost. Any melody
  // edit invalidates all of them (they no longer match what's on screen).
  const [results, setResults]     = useState<HarmonizeResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const result: HarmonizeResult | null = results[Math.min(activeIdx, results.length - 1)] ?? null;
  const [loadingKind, setLoadingKind] = useState<LoadingKind>(null);
  const [pdfBusy, setPdfBusy]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [regenSeed, setRegenSeed] = useState(0);
  // Per-chord re-voice: the slot the user tapped in the result grid.
  const [revoiceSlot, setRevoiceSlot] = useState<number | null>(null);
  const [revoiceBusy, setRevoiceBusy] = useState(false);

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

  // Autosave — melody on every edit, prefs on change.
  useEffect(() => {
    try { localStorage.setItem(LS_MELODY, JSON.stringify(melody)); } catch { /* quota — ignore */ }
  }, [melody]);
  useEffect(() => {
    try { localStorage.setItem(LS_PREFS, JSON.stringify({ scaleRoot, scaleType, styles, bpm })); } catch { /* ignore */ }
  }, [scaleRoot, scaleType, styles, bpm]);

  // ── Library handoff: reopen a saved harmonization exactly as saved ────────
  const loadHarmonization = useCallback((h: HarmonizationHandoff) => {
    const grid6 = Array.isArray(h.melody?.grid) && h.melody.grid.length === 6 ? h.melody.grid as HGrid : emptyGrid();
    setMelody({ grid: grid6, bars: Array.isArray(h.melody?.bars) ? h.melody.bars : [] });
    histRef.current = [];
    setCanUndo(false);
    if (h.scale) {
      const sp = h.scale.indexOf(' ');
      const root = sp === -1 ? h.scale : h.scale.slice(0, sp);
      const type = sp === -1 ? 'major' : h.scale.slice(sp + 1);
      if (SCALE_ROOTS.includes(root)) setScaleRoot(root);
      if (SCALE_TYPES.includes(type)) setScaleType(type);
    }
    const valid = new Set(HARMONY_STYLES.map(x => x.id));
    const st = (h.styles ?? []).filter((x): x is HarmonizeStyle => valid.has(x as HarmonizeStyle));
    if (st.length) setStyles(st.includes('chordmelody') ? ['chordmelody'] : st);
    if (typeof h.bpm === 'number' && h.bpm >= 40 && h.bpm <= 240) setBpm(h.bpm);
    setResults([h.result as HarmonizeResult]);
    setActiveIdx(0);
    setRevoiceSlot(null);
    setSel(null);
    setError(null);
  }, []);

  useEffect(() => {
    const pending = consumePendingHarmonization();
    if (pending) loadHarmonization(pending);
    return subscribeHarmonizationHandoff(() => {
      const p = consumePendingHarmonization();
      if (p) loadHarmonization(p);
    });
  }, [loadHarmonization]);

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
    setResults([]);
    setActiveIdx(0);
    setRevoiceSlot(null);
    setMelody(fn);
  }, []);

  const undo = useCallback(() => {
    if (!histRef.current.length) return;
    const prev = histRef.current[histRef.current.length - 1];
    histRef.current = histRef.current.slice(0, -1);
    setCanUndo(histRef.current.length > 0);
    setResults([]);
    setActiveIdx(0);
    setRevoiceSlot(null);
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

  // Anchors are a COLUMN property (the engine harmonizes whole time-slots),
  // so toggling marks/unmarks every filled note in the selected column —
  // matching what the AI will actually do with it.
  const colIsAnchored = useCallback(
    (c: number) => grid.some(r => r[c].fret !== '' && r[c].anchor),
    [grid],
  );
  const colHasNotes = useCallback(
    (c: number) => grid.some(r => r[c].fret !== ''),
    [grid],
  );
  const toggleAnchor = useCallback(() => {
    if (!sel) return;
    const c = sel[1];
    const next = !colIsAnchored(c);
    withHistory(p => ({
      ...p,
      grid: p.grid.map(row => row.map((cell, ci) =>
        ci === c && cell.fret !== '' ? { ...cell, anchor: next } : cell,
      )),
    }));
  }, [sel, colIsAnchored, withHistory]);

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
  const { displayGrid, displayBars, displayMeta } = useMemo(() => {
    if (!result) return { displayGrid: grid, displayBars: bars, displayMeta: [] as { slot: number; revoicable: boolean }[] };
    const sortedCols = [...result.columns].sort((a, b) => a.col - b.col);
    const width = Math.max(sortedCols.length, 1);
    const g: HGrid = emptyDisplayGrid(width);
    sortedCols.forEach((col, i) => {
      for (const n of col.notes) {
        const row = labelToRow(n.str);
        g[row][i] = { fret: String(n.fret), tech: n.tech as Tech | undefined, added: n.added };
      }
    });
    // A bar after input column c sits after slot c*SLOT_MULT. That exact slot
    // may be unpopulated (bar drawn after an empty/rest column) — anchor the
    // bar after the LAST populated column at or before it instead of dropping
    // it, so barlines survive compaction into the result view and the PDF.
    const slots = sortedCols.map(sc => sc.col);
    const b = [...new Set(
      bars.map(c => {
        const target = c * SLOT_MULT;
        let idx = -1;
        for (let i = 0; i < slots.length && slots[i] <= target; i++) idx = i;
        return idx;
      }).filter(i => i >= 0),
    )].sort((x, y) => x - y);
    // Per-display-column metadata for the re-voice interaction: a column is
    // re-voicable when it contains both the user's melody AND added harmony
    // (i.e. it's a harmonized anchor — gap columns and bare melody aren't).
    const meta = sortedCols.map(sc => ({
      slot: sc.col,
      revoicable: sc.notes.some(n => !n.added) && sc.notes.some(n => n.added),
    }));
    return { displayGrid: g, displayBars: b, displayMeta: meta };
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
          //
          // DELIBERATE consequence: once written, these anchors count as
          // manual on the next request, so Regenerate keeps the SAME anchor
          // choice and only re-voices the harmony. To get a fresh anchor
          // selection, clear the › marks (or Clear) and Harmonize again.
          if (r.autoAnchorSlots && r.autoAnchorSlots.length > 0) {
            const anchorCols = new Set(r.autoAnchorSlots.map(slot => Math.round(slot / SLOT_MULT)));
            setMelody(m => ({
              ...m,
              grid: m.grid.map(row => row.map((c, col) =>
                (anchorCols.has(col) && c.fret !== '') ? { ...c, anchor: true } : c
              )),
            }));
          }
          // Harmonize starts fresh; Regenerate appends a variation (cap 5,
          // oldest dropped) and jumps to it.
          const next = kind === 'regenerate' ? [...results, r].slice(-5) : [r];
          setResults(next);
          setActiveIdx(next.length - 1);
          setRevoiceSlot(null);
        }
        else setError('לא ניתן להרמן כרגע. ודא שמפתח ה-API מוגדר ושיש מלודיה בטאב.');
      })
      .catch(() => { setLoadingKind(null); setError('שגיאת רשת — נסה שוב.'); });
  };
  const handleHarmonize = () => { setRegenSeed(0); runHarmonize(0, 'harmonize'); };
  const handleRegenerate = () => { const s = regenSeed + 1; setRegenSeed(s); runHarmonize(s, 'regenerate'); };

  // ── Image import ────────────────────────────────────────────────────────────
  const onImageFile = async (file: File) => {
    setVisionLoading(true); setError(null);
    try {
      // Downscales oversized photos to vision-friendly dimensions first —
      // a raw phone camera image would blow the API request size limit.
      const payload = await fileToVisionPayload(file);
      if (!payload) {
        setError('לא ניתן לקרוא את קובץ התמונה — נסה JPG או PNG.');
        return;
      }
      const tc = await extractTabFromImage(payload.data, payload.mediaType);
      if (tc) withHistory(() => fromTabContent(tc));
      else setError('לא ניתן לחלץ טאב מהתמונה. נסה תמונה ברורה יותר.');
    } catch {
      setError('שגיאה בעיבוד התמונה.');
    } finally {
      setVisionLoading(false);
    }
  };

  // ── A/B playback ────────────────────────────────────────────────────────────
  const stopPlayback = () => { playTimers.current.forEach(clearTimeout); playTimers.current = []; setPlaying(false); };

  // Rhythm-aware playback: the slot timeline IS the rhythm — one input-grid
  // column (SLOT_MULT slot units) = one eighth note at the chosen BPM, so
  // rests the user wrote as empty columns are heard as real time, and
  // gap-slot connecting notes land proportionally between beats.
  const handlePlay = () => {
    if (playing) { stopPlayback(); return; }
    if (!result) return;
    const stepMs = 30_000 / bpm; // one eighth note
    const events = [...result.columns]
      .sort((a, b) => a.col - b.col)
      .map(c => ({
        t: (c.col / SLOT_MULT) * stepMs,
        notes: c.notes
          .filter(n => !(muteHarmony && n.added))
          .map(n => ({ fret: n.fret, string: labelToLowEIndex(n.str) })),
      }))
      .filter(e => e.notes.length > 0);
    if (!events.length) return;
    setPlaying(true);
    unlockAudio();
    events.forEach((ev, i) => {
      const t = setTimeout(() => {
        playChord(ev.notes, tuning.openFreqs);
        if (i === events.length - 1) {
          const done = setTimeout(() => setPlaying(false), 1200);
          playTimers.current.push(done);
        }
      }, ev.t);
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

  // ── MIDI export — slot-timeline rhythm, chords ring until the next strum ──
  // Matches the PLAY button's timing exactly (one column = one eighth note at
  // the chosen BPM). Each chord sustains until the next event, so anchors
  // audibly ring through the rests between them.
  const handleExportMidi = () => {
    if (!result) return;
    const stepSec = 30 / bpm; // one eighth note
    const sorted = [...result.columns].sort((a, b) => a.col - b.col);
    const notes: { startTime: number; endTime: number; midiNote: number }[] = [];
    sorted.forEach((c, i) => {
      const start = (c.col / SLOT_MULT) * stepSec;
      const next = sorted[i + 1];
      const end = next ? (next.col / SLOT_MULT) * stepSec : start + stepSec * 2;
      for (const n of c.notes) {
        notes.push({ startTime: start, endTime: Math.max(end, start + 0.05), midiNote: noteMidi(n.str, n.fret, tuning) });
      }
    });
    if (notes.length === 0) return;
    const name = (scaleName ? `harmonized-${scaleName}` : 'harmonized').replace(/[^a-zA-Z0-9# ]/g, '_');
    exportNotesMidi(notes, `${name}.mid`, bpm);
  };

  // ── Open the arrangement in the full Tab Builder ───────────────────────────
  // requestOpenTabInBuilder queues the payload; App's handoff subscription
  // navigates to STUDIO → Tab Builder, which consumes it on mount.
  const handleOpenInBuilder = () => {
    if (!result) return;
    requestOpenTabInBuilder(
      toTabContent(displayGrid, displayBars, scaleName ? `Harmonized · ${scaleName}` : 'Harmonized melody'),
    );
  };

  // ── Per-chord re-voice — replace ONE column's harmony, keep the rest ──────
  const handleRevoice = async () => {
    if (!result || revoiceSlot == null || revoiceBusy) return;
    setRevoiceBusy(true); setError(null);
    try {
      const col = await revoiceColumn(grid, scaleName, styles, tuning, result, revoiceSlot);
      if (!col) {
        setError('לא ניתן להחליף את האקורד כרגע — נסה שוב.');
        return;
      }
      setResults(rs => rs.map((r, i) =>
        i === activeIdx
          ? { ...r, columns: r.columns.map(c => (c.col === col.col ? col : c)) }
          : r,
      ));
      setRevoiceSlot(null);
    } finally {
      setRevoiceBusy(false);
    }
  };

  // ── Tab grid renderer — cell visuals copied from Tab Builder ──────────────
  const renderGrid = (g: HGrid, gridBars: number[], editable: boolean) => {
    const gBarsSet = new Set(gridBars);
    // Anchors are per-column — draw the › marker once per anchored column,
    // above its topmost filled note, instead of on every anchored cell.
    const anchorMarkRow = new Map<number, number>();
    const gWidth = g[0]?.length ?? 0;
    for (let c = 0; c < gWidth; c++) {
      let top = -1, anchored = false;
      for (let r = 0; r < 6; r++) {
        if (g[r][c].fret !== '') {
          if (top === -1) top = r;
          if (g[r][c].anchor) anchored = true;
        }
      }
      if (anchored && top >= 0) anchorMarkRow.set(c, top);
    }
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
              const isBar = gBarsSet.has(col);
              // Result view: tapping a harmonized (melody+harmony) column
              // arms the per-chord re-voice flow; the armed column shows the
              // same selection ring the editor uses.
              const meta = editable ? undefined : displayMeta[col];
              const isSel = editable
                ? sel?.[0] === row && sel?.[1] === col
                : meta?.revoicable === true && meta.slot === revoiceSlot;
              const isHov = editable && hov?.[0] === row && hov?.[1] === col;
              const onCellClick = editable
                ? () => selectCell(row, col)
                : meta?.revoicable
                  ? () => setRevoiceSlot(cur => (cur === meta.slot ? null : meta.slot))
                  : undefined;

              return (
                <React.Fragment key={col}>
                  <TabNoteCell
                    cell={cell}
                    cw={CW} ch={CH} fs={FS} circleD={CIRCLE_D}
                    isSel={isSel} isHov={isHov} editable={editable}
                    onClick={onCellClick}
                    onMouseEnter={() => setHov([row, col])}
                    // Result view: the ORIGINAL melody is the emphasized
                    // voice (bold + highlighter), AI harmony stays light blue
                    emphasized={!editable && !cell.added}
                    markColor={!editable && !cell.added ? MELODY_MARK : undefined}
                    fretColor={cell.added ? COLOR_ADDED : COLOR_ORIG}
                    anchorMark={anchorMarkRow.get(col) === row}
                  />

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
      {(() => {
        const anchored = colIsAnchored(sel[1]);
        const hasNotes = colHasNotes(sel[1]);
        return (
          <button
            onClick={toggleAnchor}
            disabled={!hasNotes}
            title="Marks the whole column (time-slot) as a harmonic anchor"
            style={{
              width: '100%', padding: '7px 0',
              border: `1.5px solid ${anchored ? T.secondary : T.border}`,
              background: anchored ? T.secondaryBg : T.bgInput,
              color: anchored ? T.secondary : T.textMuted,
              fontSize: 11, fontWeight: anchored ? 700 : 400, cursor: 'pointer',
              opacity: hasNotes ? 1 : 0.5,
            }}
          >
            › {anchored ? 'Harmonize Anchor ✓' : 'Harmonize Anchor'}
          </button>
        );
      })()}
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
            <button onClick={clearGrid} style={secBtn(false)}>Clear</button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onImageFile(f); e.target.value = ''; }} />

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

      {/* Harmony styles — Melodic/3rds combine; Chord-Melody stands alone */}
      <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={LABEL_STYLE}>Harmony Type <span style={{ fontSize: 9, color: T.textDim, textTransform: 'none' }}>(Chord-Melody stands alone; others combine)</span></p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {HARMONY_STYLES.map(s => {
            const active = styles.includes(s.id);
            return (
              <button key={s.id}
                // Chord-Melody is a complete arrangement style whose rules
                // (bass only at anchors, sustain between them) directly
                // contradict Melodic's free counter-line — selecting it
                // stands alone, and selecting anything else drops it.
                onClick={() => setStyles(cur => {
                  if (active) return cur.filter(x => x !== s.id);
                  if (s.id === 'chordmelody') return ['chordmelody'];
                  return [...cur.filter(x => x !== 'chordmelody'), s.id];
                })}
                title={s.id === 'chordmelody' ? 'Standalone style — replaces other selections' : undefined}
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
        <button
          onClick={handleRegenerate}
          disabled={!result || !!loadingKind}
          title="Same melody and anchors, fresh voicing — edit the › anchor marks to change which notes get chords"
          style={{
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
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: T.textMuted, fontFamily: 'var(--gc-mono)' }}>
                  ♩
                  <input
                    type="number" min={40} max={240} value={bpm}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v)) setBpm(Math.min(240, Math.max(40, v)));
                    }}
                    title="Tempo — one tab column = one eighth note"
                    style={{
                      width: 52, padding: '5px 4px', fontSize: 12, textAlign: 'center',
                      background: T.bgInput, border: `1px solid ${T.border}`, color: T.text,
                    }}
                  />
                  BPM
                </label>
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

            {/* Variation selector — each Regenerate adds one */}
            {results.length > 1 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: T.textDim, fontFamily: 'var(--gc-mono)', letterSpacing: '0.06em' }}>VARIATION</span>
                {results.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setActiveIdx(i); setRevoiceSlot(null); }}
                    style={{
                      padding: '4px 10px', fontSize: 11,
                      fontWeight: i === activeIdx ? 700 : 400,
                      border: `1px solid ${i === activeIdx ? T.secondary : T.border}`,
                      background: i === activeIdx ? T.secondaryBg : T.bgInput,
                      color: i === activeIdx ? T.secondary : T.textMuted,
                      cursor: 'pointer',
                    }}
                  >
                    V{i + 1}
                  </button>
                ))}
              </div>
            )}

            {renderGrid(displayGrid, displayBars, false)}

            <p style={{ margin: 0, fontSize: 10, color: T.textDim }}>
              Tap a harmonized chord to re-voice just that column.
            </p>

            {/* Re-voice action for the tapped column */}
            {revoiceSlot != null && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={handleRevoice}
                  disabled={revoiceBusy}
                  style={{
                    flex: 1, padding: '9px 0', border: 'none',
                    background: revoiceBusy ? T.border : T.secondary, color: '#fff',
                    fontSize: 12, fontWeight: 600, cursor: revoiceBusy ? 'wait' : 'pointer',
                    borderLeft: '3px solid var(--gc-bar-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {revoiceBusy ? (<><span style={spinnerStyle('#fff')} /> Re-voicing…</>) : `Re-voice selected chord`}
                </button>
                <button
                  onClick={() => setRevoiceSlot(null)}
                  disabled={revoiceBusy}
                  style={{ ...secBtn(revoiceBusy), padding: '9px 14px' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {result.analysis && (
            <div style={{ ...card({ padding: '14px 16px' }), borderLeft: `3px solid ${T.secondary}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={MONO_LBL}>AI Analysis</span>
              <p style={{ margin: 0, fontSize: 12, color: T.text, lineHeight: 1.7 }}>{result.analysis}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <SaveToLibraryButton
              label="Save to Library"
              getPayload={() => result ? ({
                kind: 'harmonization',
                name: scaleName ? `Harmonized — ${scaleName}` : 'Harmonized melody',
                scale: scaleName || null,
                styles,
                bpm,
                // Full working state — melody incl. anchors + the ACTIVE
                // variation — so the library can reopen it exactly as-is.
                melody: { grid, bars },
                result,
              }) : null}
              style={{ justifyContent: 'center', padding: '12px 0' }}
            />
            <button onClick={handleExportPdf} disabled={pdfBusy} style={actionBtn(pdfBusy)}>
              {pdfBusy ? 'Exporting…' : 'Export PDF'}
            </button>
            <button onClick={handleExportMidi} style={actionBtn(false)}>
              Export MIDI
            </button>
            <button
              onClick={handleOpenInBuilder}
              title="Continue editing the arrangement in the full Tab Builder"
              style={actionBtn(false)}
            >
              Open in Builder
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
// Result-panel action buttons (Export PDF / MIDI / Open in Builder)
function actionBtn(busy: boolean): React.CSSProperties {
  return {
    padding: '12px 0',
    border: `1.5px solid ${T.secondary}`, background: 'transparent',
    color: T.secondary, fontSize: 12.5, fontWeight: 400,
    textTransform: 'uppercase', letterSpacing: '-0.02em',
    cursor: busy ? 'wait' : 'pointer',
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
