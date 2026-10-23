import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { T } from '../../theme';
import { Rule, Pill, Cta } from '../Transit/parts';
import { pillStyle } from '../Transit/styles';
import { SelectPill } from './SelectPill';
import { field, spinner } from './ui';
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
import {
  useTabEditing, emptyGrid as baseEmptyGrid, nextFret, circleDiameter,
  BASE_CW, BASE_CH, BASE_FS, type Tech, type TabCell,
} from '../Tabs/tabEditing';
import { useLang } from '../../contexts/LanguageContext';
import { useOptionalSong } from '../../song/SongContext';
import { keyName } from '../../utils/harmonicAnalysis';

// User-facing failure copy. These used to be Hebrew-only, and two of them told
// a guitarist to go and check an API key they have no access to — a developer's
// note left in the product. Each one now says what happened and what to try.
const ERR = {
  en: {
    harmonize:    'Could not harmonise this. Check there are notes in the tab, then try again.',
    network:      'No connection — check your network and try again.',
    imageRead:    'Could not read that image file. Try a JPG or PNG.',
    imageExtract: 'No tab found in that image. A sharper, straighter photo usually works.',
    imageFailed:  'Something went wrong reading the image. Try again.',
    revoice:      'Could not swap that chord right now. Try again.',
  },
  he: {
    harmonize:    'לא הצלחנו להרמן את זה. בדקו שיש תווים בטאב ונסו שוב.',
    network:      'אין חיבור — בדקו את הרשת ונסו שוב.',
    imageRead:    'לא הצלחנו לקרוא את קובץ התמונה. נסו JPG או PNG.',
    imageExtract: 'לא נמצא טאב בתמונה. תמונה חדה וישרה יותר בדרך כלל תעבוד.',
    imageFailed:  'משהו השתבש בקריאת התמונה. נסו שוב.',
    revoice:      'לא הצלחנו להחליף את האקורד כרגע. נסו שוב.',
  },
} as const;

// ── Grid model ───────────────────────────────────────────────────────────────
// The editor deliberately mirrors Tab Builder's model and editing rules
// (TabBuilder.tsx) so building a melody here feels identical to building a
// tab there. `anchor`/`added` are harmonizer-only extensions.
interface HCell extends TabCell { anchor?: boolean; added?: boolean }
type HGrid = HCell[][];
interface MelodyState { grid: HGrid; bars: number[] }

const ROWS = STR_LABELS;             // e B G D A E  (row 0 = high e)
const DEFAULT_COLS = 16;
// Cell metrics — Tab Builder's BASE_CW/BASE_CH/font at 100% zoom.
const CW = BASE_CW;
const CH = BASE_CH;
const FS = BASE_FS;
const CIRCLE_D = circleDiameter(CH);

function emptyGrid(cols = DEFAULT_COLS): HGrid {
  return baseEmptyGrid<HCell>(cols, () => ({ fret: '' }));
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

interface Props {
  tuning: Tuning;
  desktop?: boolean;
}

const COLOR_ORIG  = T.text;
// Harmony (AI-added) notes are grey, so the ink melody — yours — reads
// first inside the arrangement. Cobalt stays with the Harmonize action.
const COLOR_ADDED = T.textMuted;
// Soft highlighter drawn behind the user's ORIGINAL notes in the result
// view, so the source tab stands out inside the arrangement.
const MELODY_MARK = 'var(--gc-error-soft)';

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
  const { lang } = useLang();
  // The melody is the song's: it opens on the song's melody (if another tool
  // wrote one) and every edit here is written back for the other tools.
  const song = useOptionalSong();
  const songMelody = song?.song.melody ?? null;
  const fromElsewhere = !!songMelody && song?.song.melodyFrom !== 'harmonizer';
  const [melody, setMelody] = useState<MelodyState>(() => (fromElsewhere ? fromTabContent(songMelody!) : loadSavedMelody()));
  const [seenMelody, setSeenMelody] = useState(songMelody);
  if (songMelody !== seenMelody) {
    setSeenMelody(songMelody);
    if (fromElsewhere) setMelody(fromTabContent(songMelody!));
  }
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
  // Follows the song's key when it changes (its own choice otherwise stands).
  const songKey = useOptionalSong()?.key ?? null;
  const songKeyId = songKey ? `${songKey.tonicPc}:${songKey.mode}` : '';
  const [seenKey, setSeenKey] = useState(() => (loadSavedPrefs().scaleRoot ? songKeyId : ''));
  if (songKeyId !== seenKey) {
    setSeenKey(songKeyId);
    if (songKey) { setScaleRoot(keyName(songKey, 'en').split(' ')[0]); setScaleType(songKey.mode); }
  }

  const scaleName = scaleRoot ? `${scaleRoot} ${scaleType}` : '';
  const numCols = grid[0]?.length ?? DEFAULT_COLS;

  // Detected scale suggestion from the current melody.
  const detected = useMemo(() => (gridHasNotes(grid) ? detectTabScale(grid, tuning.notes) : null), [grid, tuning]);

  useEffect(() => () => { playTimers.current.forEach(clearTimeout); }, []);

  // Autosave — melody on every edit, prefs on change.
  useEffect(() => {
    try { localStorage.setItem(LS_MELODY, JSON.stringify(melody)); } catch { /* quota — ignore */ }
    // …and into the song, for Tab Builder and the rest.
    if (!song || (!gridHasNotes(melody.grid) && !song.song.melody)) return;
    song.update({
      melody: { title: '', subtitle: '', grid: melody.grid.map(r => r.map(c => ({ fret: c.fret, tech: c.tech }))), bars: melody.bars },
      melodyFrom: 'harmonizer',
    });
  }, [melody]);   // eslint-disable-line react-hooks/exhaustive-deps
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
    setCell(s, c, { fret: nextFret(cur, d) });
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

  const clearCell = useCallback((s: number, c: number) => {
    setCell(s, c, { fret: '', tech: undefined, anchor: undefined });
  }, [setCell]);

  // Key map shared with Tab Builder, plus 'a' for this tool's anchor.
  const handleEditKey = useTabEditing({
    sel, setSel, numCols, applyDigit, clearCell, applyTech, undo,
    toggleBar: () => toggleBar(),
    onEscape: () => fretInputRef.current?.blur(),
    extraKeys: { a: toggleAnchor },
  });

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
  // A melody to try the harmonizer on: the opening of "Ode to Joy" in C, on
  // the top two strings. Sets the scale too, so Harmonize works straight away.
  const loadExample = () => {
    const line: [number, number][] = [   // [row (0 = high e), fret]
      [0, 0], [0, 0], [0, 1], [0, 3], [0, 3], [0, 1], [0, 0], [1, 3],
      [1, 1], [1, 1], [1, 3], [0, 0], [0, 0], [1, 3], [1, 3],
    ];
    const grid = emptyGrid(Math.max(DEFAULT_COLS, line.length));
    line.forEach(([row, fret], col) => { grid[row][col] = { ...grid[row][col], fret: String(fret) }; });
    withHistory(() => ({ grid, bars: [] }));
    setScaleRoot('C'); setScaleType('major'); setSel(null);
  };

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
        else setError(ERR[lang].harmonize);
      })
      .catch(() => { setLoadingKind(null); setError(ERR[lang].network); });
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
        setError(ERR[lang].imageRead);
        return;
      }
      const tc = await extractTabFromImage(payload.data, payload.mediaType);
      if (tc) withHistory(() => fromTabContent(tc));
      else setError(ERR[lang].imageExtract);
    } catch {
      setError(ERR[lang].imageFailed);
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
  // navigates to TOOLS → Tab Builder, which consumes it on mount.
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
        setError(ERR[lang].revoice);
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
        // Kept from the swipe-pager days: stopping pointerdown from bubbling
        // means no outer gesture handler can capture a finger that is
        // scrolling this grid sideways. The grid's own native scrolling is
        // untouched.
        onPointerDownCapture={e => e.stopPropagation()}
        onMouseLeave={() => setHov(null)}
        style={{
          background: 'transparent', padding: '10px 0',
          borderTop: `1px solid ${T.hairline}`, borderBottom: `1px solid ${T.hairline}`, overflowX: 'auto',
          width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box',
        }}
      >
        {ROWS.map((lbl, row) => (
          <div key={row} style={{ display: 'flex', alignItems: 'center', userSelect: 'none' }}>
            <span style={{ width: 14, fontSize: FS, fontFamily: 'var(--gc-mono)', color: T.textMuted, textAlign: 'right', paddingRight: 3, flexShrink: 0 }}>{lbl}</span>
            <span style={{ fontSize: FS, fontFamily: 'var(--gc-mono)', color: T.textMuted, flexShrink: 0 }}>|</span>
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
                    <div style={{ width: 2, height: CH, background: T.text, flexShrink: 0 }} />
                  )}
                </React.Fragment>
              );
            })}
            <span style={{ fontSize: FS, fontFamily: 'var(--gc-mono)', color: T.textMuted, flexShrink: 0 }}>|</span>
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
  const he = lang === 'he';
  const selTech = sel ? grid[sel[0]][sel[1]].tech : undefined;
  const cellToolbar = sel && (
    <Rule
      label={`${he ? 'תא' : 'Cell'} ${ROWS[sel[0]]} · ${he ? 'עמודה' : 'col'} ${sel[1] + 1}`}
      right={<Pill size="sm" onClick={() => { setSel(null); fretInputRef.current?.blur(); }} label={he ? 'סגירה' : 'Close'} style={{ padding: 0 }}>×</Pill>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(() => {
          const anchored = colIsAnchored(sel[1]);
          const hasNotes = colHasNotes(sel[1]);
          return (
            <Pill active={anchored} onClick={toggleAnchor} disabled={!hasNotes}
              title="Marks the whole column (time-slot) as a harmonic anchor" style={{ width: '100%' }}>
              › {anchored ? 'Harmonize Anchor ✓' : 'Harmonize Anchor'}
            </Pill>
          );
        })()}
        <div style={{ display: 'flex', gap: 6 }}>
          {TECH_BTNS.map(t => {
            const isArmed = t.id === '|' ? barsSet.has(sel[1]) : selTech === t.id;
            return (
              <Pill key={t.id} size="sm" active={isArmed}
                onClick={() => t.id === '|' ? toggleBar() : applyTech(t.id as Tech)}
                title={`${t.label} [${t.key}]`} label={t.label}
                style={{ flex: 1, padding: 0, minWidth: 0, fontFamily: 'var(--gc-mono)', textTransform: 'none' }}>{t.sym}</Pill>
            );
          })}
        </div>
      </div>
    </Rule>
  );

  // ── Left column: input + controls ──────────────────────────────────────────
  const leftCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      {hiddenFretInput}
      {/* Input stage */}
      <Rule
        label={<span style={{ whiteSpace: 'nowrap' }}>{he ? 'מנגינה' : 'Melody input'}</span>}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <Pill size="sm" onClick={() => fileRef.current?.click()} disabled={visionLoading}>
              {visionLoading ? (he ? 'קורא…' : 'Reading…') : (he ? 'תמונה' : 'Image')}
            </Pill>
            <Pill size="sm" onClick={loadExample}>{he ? 'דוגמה' : 'Example'}</Pill>
            <Pill size="sm" onClick={clearGrid}>{he ? 'ניקוי' : 'Clear'}</Pill>
          </div>
        }
      >
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onImageFile(f); e.target.value = ''; }} />

        {/* Always the user's original, editable tab — the harmonized result
            lives only in the result panel, never here. */}
        {renderGrid(grid, bars, true)}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <Pill size="sm" onClick={addColumns}>+ {he ? 'עמודות' : 'Columns'}</Pill>
          <Pill size="sm" onClick={undo} disabled={!canUndo}>↺ {he ? 'ביטול' : 'Undo'}</Pill>
          <span className="su-label" style={{ flex: 1, minWidth: 140 }}>
            {he ? 'הקישו על תא והקלידו שריגים / טכניקות' : 'Tap a cell, then type frets / techniques'}
          </span>
        </div>
      </Rule>

      {cellToolbar}

      {/* Scale (mandatory) */}
      <Rule label={<>{he ? 'סולם / מודוס' : 'Scale / Mode'} <span style={{ color: T.text }}>*</span></>}>
        <div style={{ display: 'flex', gap: 8 }}>
          <SelectPill label="Scale root" value={scaleRoot} onChange={setScaleRoot} style={{ flex: 1 }}>
            <option value="">{he ? 'שורש…' : 'Root…'}</option>
            {SCALE_ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
          </SelectPill>
          <SelectPill label="Scale type" value={scaleType} onChange={setScaleType} style={{ flex: 2 }}>
            {SCALE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </SelectPill>
        </div>
        {detected && (
          <Pill size="sm" onClick={() => { setScaleRoot(detected.root); setScaleType(detected.type); }}
            style={{ marginTop: 8, textTransform: 'none', letterSpacing: '0.02em' }}>
            {he ? 'זוהה' : 'Detected'}: {detected.name} ({detected.fitPercent}%) — {he ? 'שימוש' : 'use'}
          </Pill>
        )}
      </Rule>

      {/* Harmony styles — Melodic/3rds combine; Chord-Melody stands alone */}
      <Rule label={he ? 'סוג הרמוניה' : 'Harmony type'}>
        <p className="su-label" style={{ margin: '-4px 0 8px', textTransform: 'none', letterSpacing: '0.04em' }}>
          {he ? 'Chord-Melody עומד לבד; האחרים משתלבים' : 'Chord-Melody stands alone; others combine'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          {HARMONY_STYLES.map(s => {
            const active = styles.includes(s.id);
            return (
              <Pill key={s.id} active={active}
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
                style={{ width: '100%', padding: '0 10px', textTransform: 'none', letterSpacing: '0.02em' }}
              >
                {s.label}
              </Pill>
            );
          })}
        </div>
      </Rule>

      {/* Harmonize (the one cobalt action) / Regenerate */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Cta onClick={handleHarmonize} disabled={!canHarmonize} style={{ flex: 2, height: 52 }}>
          {loadingKind === 'harmonize' ? (<><span style={spinner(T.textMuted)} /> {he ? 'מרמן…' : 'Harmonizing…'}</>) : (he ? 'הרמוניה' : 'Harmonize')}
        </Cta>
        <Pill
          onClick={handleRegenerate}
          disabled={!result || !!loadingKind}
          title="Same melody and anchors, fresh voicing — edit the › anchor marks to change which notes get chords"
          style={{ flex: 1, height: 52 }}
        >
          {loadingKind === 'regenerate' ? (<><span style={spinner(T.text)} /> {he ? 'מחדש…' : 'Regenerating…'}</>) : (he ? 'גרסה נוספת' : 'Regenerate')}
        </Pill>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── Right column: result + player ──────────────────────────────────────────
  const rightCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      {error && (
        <Rule>
          <p role="alert" style={{ margin: 0, fontSize: 13, color: T.text }}><b>{'⚠︎'}</b> {error}</p>
        </Rule>
      )}

      {result && (
        <>
          <Rule label={he ? 'המנגינה בהרמוניה' : 'Harmonized'} style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="su-label">BPM</span>
                  <input
                    type="number" min={40} max={240} value={bpm}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v)) setBpm(Math.min(240, Math.max(40, v)));
                    }}
                    title="Tempo — one tab column = one eighth note"
                    style={{ ...field, width: 64 }}
                  />
                </label>
                <Pill size="sm" active={!muteHarmony} onClick={() => setMuteHarmony(m => !m)}>
                  {muteHarmony ? (he ? 'הרמוניה מושתקת' : 'Harmony muted') : (he ? 'הרמוניה פועלת' : 'Harmony on')}
                </Pill>
                <Pill size="sm" active={playing} onClick={handlePlay} style={{ marginInlineStart: 'auto' }}>
                  {playing ? 'STOP' : 'PLAY'}
                </Pill>
              </div>

              {/* Legend — melody: highlighted original notes; harmony: grey */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, background: MELODY_MARK, border: `1.5px solid ${T.text}`, boxSizing: 'border-box', display: 'inline-block' }} />
                  <span className="su-label">{he ? 'המנגינה (שלכם)' : 'Melody (yours)'}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, background: COLOR_ADDED, display: 'inline-block' }} />
                  <span className="su-label">{he ? 'הרמוניה (AI)' : 'Harmony (AI)'}</span>
                </span>
              </div>

              {/* Variation selector — each Regenerate adds one */}
              {results.length > 1 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="su-label">{he ? 'גרסה' : 'Variation'}</span>
                  {results.map((_, i) => (
                    <Pill key={i} size="sm" active={i === activeIdx} onClick={() => { setActiveIdx(i); setRevoiceSlot(null); }}>
                      V{i + 1}
                    </Pill>
                  ))}
                </div>
              )}

              {renderGrid(displayGrid, displayBars, false)}

              <span className="su-label">
                {he ? 'הקישו על אקורד מורמן כדי להחליף רק אותו' : 'Tap a harmonized chord to re-voice just that column.'}
              </span>

              {/* Re-voice action for the tapped column */}
              {revoiceSlot != null && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Pill active onClick={handleRevoice} disabled={revoiceBusy} style={{ flex: 1 }}>
                    {revoiceBusy ? (<><span style={spinner(T.white)} /> {he ? 'מחליף…' : 'Re-voicing…'}</>) : (he ? 'החלפת האקורד שנבחר' : 'Re-voice selected chord')}
                  </Pill>
                  <Pill onClick={() => setRevoiceSlot(null)} disabled={revoiceBusy}>
                    {he ? 'ביטול' : 'Cancel'}
                  </Pill>
                </div>
              )}
            </div>
          </Rule>

          {result.analysis && (
            <Rule label={he ? 'ניתוח' : 'AI analysis'}>
              <p style={{ margin: 0, fontSize: 13, color: T.text, lineHeight: 1.7 }}>{result.analysis}</p>
            </Rule>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <SaveToLibraryButton
              label={he ? 'שמירה לספרייה' : 'Save to Library'}
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
              style={{ ...pillStyle(false), width: '100%' }}
            />
            <Pill onClick={handleExportPdf} disabled={pdfBusy} style={{ width: '100%' }}>
              {pdfBusy ? (he ? 'מייצא…' : 'Exporting…') : (he ? 'ייצוא PDF' : 'Export PDF')}
            </Pill>
            <Pill onClick={handleExportMidi} style={{ width: '100%' }}>
              {he ? 'ייצוא MIDI' : 'Export MIDI'}
            </Pill>
            <Pill onClick={handleOpenInBuilder} title="Continue editing the arrangement in the full Tab Builder" style={{ width: '100%' }}>
              {he ? 'פתיחה בכתיבת טאבים' : 'Open in Builder'}
            </Pill>
          </div>
        </>
      )}

      {/* Desktop only — fills the otherwise-empty right column before a
          result exists. On mobile this would just repeat the form the
          user is already looking at, right below it, so it's skipped. */}
      {desktop && !result && !error && (
        <Rule style={{ textAlign: 'center', padding: '32px 0 8px' }}>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted, lineHeight: 1.6 }}>
            {he ? 'הזינו מנגינה, בחרו סולם וסוג הרמוניה, ואז הרמוניה.' : 'Enter a melody, pick a scale, choose harmony types, then Harmonize.'}
          </p>
          {!gridHasNotes(melody.grid) && (
            <Pill onClick={loadExample} style={{ marginTop: 16 }}>{he ? 'נסו מנגינה לדוגמה' : 'Try an example melody'}</Pill>
          )}
        </Rule>
      )}
    </div>
  );


  if (desktop) {
    return (
      // minmax(0, 1fr) — NOT bare 1fr — stops the harmonized tab grid's
      // min-content width from forcing this whole track (and the page) to
      // blow out sideways; the tab grid's own overflow-x:auto then scrolls
      // inside its own box as intended instead.
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '400px minmax(0, 1fr)', gap: 36, alignItems: 'start' }}>
          {leftCol}
          <div style={{ position: 'sticky', top: 24, minWidth: 0 }}>{rightCol}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      {leftCol}
      {rightCol}
    </div>
  );
}
