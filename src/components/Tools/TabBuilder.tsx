import React, { useState, useEffect, useCallback, useRef } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import {
  detectTabScale, extractTabNotes, suggestTabProgressions,
  type TabScaleResult, type ProgressionSuggestion,
} from '../../utils/analyzeTab';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { findChordVoicings } from '../../utils/chordVoicings';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { VerticalScaleFretboard } from '../Fretboard/VerticalScaleFretboard';
import { subscribeHandoff, consumePendingTab } from '../../services/handoff';
import type { TabContent } from '../../services/types';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import { TabNoteCell } from '../Tabs/TabNoteCell';
import {
  useTabEditing, emptyGrid as baseEmptyGrid, nextFret, circleDiameter,
  STR_ROWS, BASE_CW, BASE_CH, BASE_FS,
  type Tech, type TabCell,
} from '../Tabs/tabEditing';
import { useOptionalSong } from '../../song/SongContext';
import { TUNINGS } from '../../utils/musicTheory';
import { useFlash } from '../../motion/useFlash';
import { RollLabel } from '../RollLabel';
import { keyName } from '../../utils/harmonicAnalysis';
import { Meta, Pill, Cta, Stepper } from '../Transit/parts';
import { StopActions } from '../Transit/StopActions';
import { Sheet } from '../Workspace/Sheet';
import { PosterInput } from '../Tabs/PosterInput';
import { TabKeypad } from '../Tabs/TabKeypad';

type Lang = 'he' | 'en';
type ErrKey = 'empty' | 'ai' | 'gen';

const L: Record<Lang, {
  dir: 'rtl' | 'ltr'; heading: string; bestScale: string; match: string;
  progTitle: string; reanalyze: string; play: string; loading: string;
  empty: string; ai: string; gen: string; tapHint: string; scaleHint: string;
}> = {
  he: {
    dir: 'rtl', heading: 'ניתוח טאב', bestScale: 'הסולם המתאים ביותר', match: 'התאמה',
    progTitle: 'הצעות לפרוגרסיות אקורדים', reanalyze: 'נתח מחדש', play: 'נגן',
    loading: 'מחפש פרוגרסיות אקורדים שמתאימות למלודיה…',
    empty: 'כתוב כמה תווים בטאב לפני הניתוח',
    ai: 'לא ניתן ליצור הצעות כרגע (חסר חיבור ל-AI)',
    gen: 'אירעה שגיאה בניתוח',
    tapHint: 'לחץ על אקורד לתצוגה', scaleHint: 'לחץ להצגה על הצוואר',
  },
  en: {
    dir: 'ltr', heading: 'Tab Analysis', bestScale: 'Best matching scale', match: 'match',
    progTitle: 'Suggested chord progressions', reanalyze: 'Re-analyze', play: 'Play',
    loading: 'Finding chord progressions that fit your melody…',
    empty: 'Write some notes in the tab before analyzing',
    ai: 'Couldn’t generate suggestions right now (AI not connected)',
    gen: 'Analysis error',
    tapHint: 'Tap a chord to view it', scaleHint: 'Tap to see it on the neck',
  },
};

type Cell = TabCell;
interface TabState {
  title: string;
  subtitle: string;
  grid: Cell[][];
  bars: number[];
}

const STRS = STR_ROWS;
const COLS_PER_LINE = 32;

const emptyGrid = (cols: number): Cell[][] => baseEmptyGrid<Cell>(cols, () => ({ fret: '' }));

// Coerce a stored TabContent (loose `tech?: string`) into the builder's TabState.
function normalizeTabContent(c: TabContent): TabState {
  return {
    title: c.title ?? '',
    subtitle: c.subtitle ?? '',
    grid: (c.grid ?? emptyGrid(COLS_PER_LINE * 3)).map(row =>
      row.map(cell => ({ fret: cell.fret ?? '', tech: cell.tech as Tech | undefined }))
    ),
    bars: c.bars ?? [],
  };
}

// ── Backup helpers ────────────────────────────────────────────────────────────
const BACKUP_KEY  = 'scaleup_tab_backups';
const MAX_BACKUPS = 5;

interface TabBackup { ts: number; tab: TabState }

function loadBackups(): TabBackup[] {
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]'); } catch { return []; }
}

function saveBackup(tab: TabState) {
  const hasContent = tab.grid.some(row => row.some(c => c.fret));
  if (!hasContent) return;
  try {
    const prev = loadBackups();
    // Deduplicate: skip if identical to the most recent backup
    if (prev.length && JSON.stringify(prev[prev.length - 1].tab) === JSON.stringify(tab)) return;
    const next: TabBackup[] = [...prev.slice(-(MAX_BACKUPS - 1)), { ts: Date.now(), tab }];
    localStorage.setItem(BACKUP_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

function tabHasContent(tab: TabState) {
  return tab.grid.some(row => row.some(c => c.fret));
}

export const TabBuilder: React.FC<{ desktop?: boolean }> = ({ desktop }) => {
  const song = useOptionalSong();
  const [sent, flashSent] = useFlash();
  const [tab, setTab] = useState<TabState>(() => {
    // A pending "Open in Builder" handoff wins over the autosaved draft.
    const pending = consumePendingTab();
    if (pending) return normalizeTabContent(pending);
    try {
      const s = localStorage.getItem('scaleup_tab');
      if (s) return JSON.parse(s);
    } catch { /* no saved draft */ }
    return { title: '', subtitle: '', grid: emptyGrid(COLS_PER_LINE * 3), bars: [] };
  });

  // Live handoff — if the builder is already mounted when a tab is opened.
  useEffect(() => subscribeHandoff(() => {
    const pending = consumePendingTab();
    if (pending) setTab(normalizeTabContent(pending));
  }), []);

  const [sel, setSel]         = useState<[number, number] | null>(null);
  const [hov, setHov]         = useState<[number, number] | null>(null);
  const [zoom, setZoom]       = useState(100);
  const [busy, setBusy]       = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [backups, setBackups]         = useState<TabBackup[]>(() => loadBackups());

  // Analyze panel
  const [analyzeOpen, setAnalyzeOpen]     = useState(false);
  const [analyzing, setAnalyzing]         = useState(false);
  const [analyzeScale, setAnalyzeScale]   = useState<TabScaleResult | null>(null);
  const [analyzeProgs, setAnalyzeProgs]   = useState<ProgressionSuggestion[] | null>(null);
  const [analyzeErr, setAnalyzeErr]       = useState<ErrKey | null>(null);
  const { lang } = useLang();
  const [chordModal, setChordModal]   = useState<string | null>(null); // chord name → diagram
  const [scaleModal, setScaleModal]   = useState(false);               // scale → vertical neck

  // Restore a previous analysis so it can be reopened after closing
  useEffect(() => {
    try {
      const s = localStorage.getItem('scaleup_tab_analysis');
      if (s) {
        const a = JSON.parse(s);
        if (a.scale) setAnalyzeScale(a.scale);
        if (a.progs) setAnalyzeProgs(a.progs);
      }
    } catch { /* ignore */ }
  }, []);

  const t = L[lang];

  // Undo history — ref to avoid stale-closure issues
  const histRef = useRef<TabState[]>([]);
  const tabRef  = useRef<TabState>(tab);

  // Fit columns to container width — no horizontal scrolling, ever
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(900);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWrapW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep tabRef current so withHistory always captures the latest state
  useEffect(() => { tabRef.current = tab; }, [tab]);

  // Auto-persist + rotating backup.
  // Anti-wipe guard: never overwrite a tab-with-content with an empty tab
  // (guards against any accidental state reset, e.g. mid-resize or mid-export).
  useEffect(() => {
    try {
      const prev = localStorage.getItem('scaleup_tab');
      const prevHasContent = prev ? JSON.parse(prev).grid?.some((r: {fret:string}[]) => r.some(c => c.fret)) : false;
      if (prevHasContent && !tabHasContent(tab)) return; // never wipe with empty
      localStorage.setItem('scaleup_tab', JSON.stringify(tab));
      // Rotating backup — only when content exists
      saveBackup(tab);
      setBackups(loadBackups());
    } catch { /* ignore */ }
  }, [tab]);

  const { title, subtitle, grid, bars } = tab;
  const numCols = grid[0]?.length ?? 0;

  // ── Play the tab ────────────────────────────────────────────────────────
  // Column by column — one eighth note each at the song's tempo, in the song's
  // tuning — with the column that is sounding lit as a playhead.
  const [playCol, setPlayCol] = useState<number | null>(null);
  const playTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => playTimers.current.forEach(clearTimeout), []);
  const stopTab = () => { playTimers.current.forEach(clearTimeout); playTimers.current = []; setPlayCol(null); };
  const playTab = () => {
    if (playCol != null) { stopTab(); return; }
    const g = grid;
    let last = -1;
    for (let c = 0; c < numCols; c++) if (g.some(row => row[c]?.fret !== '')) last = c;
    if (last < 0) return;
    const stepMs = (60 / (song?.song.bpm ?? 90)) * 1000 / 2;
    const freqs = (TUNINGS.find(t => t.name === song?.song.tuningName) ?? TUNINGS[0]).openFreqs;
    unlockAudio().then(() => {
      for (let c = 0; c <= last; c++) {
        playTimers.current.push(setTimeout(() => {
          setPlayCol(c);
          const positions = g.map((row, r) => ({ string: 5 - r, fret: parseInt(row[c]?.fret ?? '', 10) }))
            .filter(p => !isNaN(p.fret));
          if (positions.length) playChord(positions, freqs, song?.song.capo ?? 0);
        }, c * stepMs));
      }
      playTimers.current.push(setTimeout(() => setPlayCol(null), (last + 1) * stepMs + 300));
    });
  };
  const barsSet = new Set(bars);
  const cw = (BASE_CW * zoom) / 100;
  const ch = (BASE_CH * zoom) / 100;
  const fs = Math.max(9, Math.round((BASE_FS * zoom) / 100));
  const circleD = circleDiameter(ch);
  const colsPerLine = Math.max(8, Math.floor((wrapW - 36) / cw));
  const numSys = Math.ceil(numCols / colsPerLine);

  // Default = exactly 3 systems. Resize without pushing to undo history.
  // NEVER shrink: only add columns. Trimming could destroy user data if the
  // container width changes momentarily (e.g. during PDF export or scroll).
  useEffect(() => {
    setTab(p => {
      const cols = p.grid[0]?.length ?? 0;
      let lastUsed = -1;
      for (const row of p.grid)
        for (let c = cols - 1; c > lastUsed; c--)
          if (row[c].fret) { lastUsed = c; break; }
      const want = Math.max(3, Math.ceil((lastUsed + 1) / colsPerLine)) * colsPerLine;
      // Only grow — never trim
      if (want <= cols) return p;
      const grid = p.grid.map(row => [
        ...row,
        ...Array.from({ length: want - cols }, () => ({ fret: '' })),
      ]);
      return { ...p, grid };
    });
  }, [colsPerLine]);

  // Push current state to history, then apply updater
  const withHistory = useCallback((fn: (p: TabState) => TabState) => {
    histRef.current = [...histRef.current.slice(-30), tabRef.current];
    setCanUndo(true);
    setTab(fn);
  }, []);

  const undo = useCallback(() => {
    if (!histRef.current.length) return;
    const prev = histRef.current[histRef.current.length - 1];
    histRef.current = histRef.current.slice(0, -1);
    setCanUndo(histRef.current.length > 0);
    setTab(prev);
  }, []);

  const setCell = useCallback((s: number, c: number, patch: Partial<Cell>) => {
    withHistory(p => {
      const g = p.grid.map(r => [...r]);
      g[s][c] = { ...g[s][c], ...patch };
      return { ...p, grid: g };
    });
  }, [withHistory]);

  // Hidden numeric input — focused on cell tap so the soft keyboard opens on mobile
  const fretInputRef = useRef<HTMLInputElement>(null);

  const applyDigit = useCallback((d: string) => {
    if (!sel) return;
    const [s, c] = sel;
    const cur = grid[s][c].fret;
    setCell(s, c, { fret: nextFret(cur, d) });
  }, [sel, grid, setCell]);

  const clearCell = useCallback((s: number, c: number) => {
    setCell(s, c, { fret: '', tech: undefined });
  }, [setCell]);

  // Key map shared with the melody harmoniser — see components/Tabs/tabEditing.
  const applyTech = (tech: Tech) => {
    if (!sel) return;
    const [s, c] = sel;
    const toggled = grid[s][c].tech === tech ? undefined : tech;
    withHistory(p => {
      const g = p.grid.map(r => [...r]);
      g[s][c] = { ...g[s][c], tech: toggled };
      return { ...p, grid: g };
    });
    if (toggled && c + 1 < numCols) setSel([s, c + 1]);
  };

  const toggleBar = () => {
    if (!sel) return;
    const c = sel[1];
    withHistory(p => ({
      ...p,
      bars: p.bars.includes(c) ? p.bars.filter(b => b !== c) : [...p.bars, c],
    }));
  };

  const handleEditKey = useTabEditing({
    sel, setSel, numCols, applyDigit, clearCell, undo,
    applyTech, toggleBar: () => toggleBar(),
    onEscape: () => fretInputRef.current?.blur(),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Skip if focus is in a text field (title/subtitle, or the hidden fret input)
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      handleEditKey(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleEditKey]);

  // Tap a cell → select it and open the numeric keyboard on mobile
  // Tap a cell → it becomes the cursor; the keypad enters frets.
  const selectCell = useCallback((s: number, c: number) => {
    setSel([s, c]);
  }, []);


  const addLine = () => {
    withHistory(p => ({
      ...p,
      grid: p.grid.map(r => [
        ...r,
        ...Array.from({ length: colsPerLine }, () => ({ fret: '' })),
      ]),
    }));
  };

  // An A minor pentatonic run in 5th position — up the top four strings and back.
  const loadExample = () => {
    const run: [number, number][] = [   // [row (0 = high e), fret]
      [3, 5], [3, 7], [2, 5], [2, 7], [1, 5], [1, 8], [0, 5], [0, 8],
      [0, 5], [1, 8], [1, 5], [2, 7], [2, 5], [3, 7], [3, 5],
    ];
    withHistory(p => {
      const grid = emptyGrid(p.grid[0]?.length ?? colsPerLine * 3);
      run.forEach(([row, fret], col) => { grid[row][col] = { ...grid[row][col], fret: String(fret) }; });
      return { ...p, title: p.title || 'A minor pentatonic run', grid, bars: [] };
    });
    setSel(null);
  };

  const clearGrid = () => {
    withHistory(p => ({
      ...p,
      grid: emptyGrid(p.grid[0]?.length ?? colsPerLine * 3),
      bars: [],
    }));
    setSel(null);
  };

  const persistAnalysis = (scale: TabScaleResult | null, progs: ProgressionSuggestion[] | null) => {
    try {
      localStorage.setItem('scaleup_tab_analysis', JSON.stringify({ scale, progs }));
    } catch { /* ignore */ }
  };

  const runAnalysis = async () => {
    setAnalyzeErr(null);
    setAnalyzeProgs(null);

    const scale = detectTabScale(grid);
    const { ordered } = extractTabNotes(grid);

    if (!scale || ordered.length === 0) {
      setAnalyzeScale(null);
      setAnalyzeErr('empty');
      persistAnalysis(null, null);
      return;
    }

    setAnalyzeScale(scale);
    setAnalyzing(true);
    try {
      const res = await suggestTabProgressions(scale.name, ordered);
      if (res) {
        setAnalyzeProgs(res.progressions);
        persistAnalysis(scale, res.progressions);
      } else {
        setAnalyzeErr('ai');
        persistAnalysis(scale, null);
      }
    } catch {
      setAnalyzeErr('gen');
    } finally {
      setAnalyzing(false);
    }
  };

  // Header button: reopen cached results if present, otherwise run fresh
  const handleAnalyze = () => {
    setAnalyzeOpen(true);
    if (!analyzeProgs && !analyzing) runAnalysis();
  };

  const playProgression = (chords: string[]) => {
    unlockAudio();
    chords.forEach((name, i) => {
      setTimeout(() => {
        const v = findChordVoicings(name, 1)[0];
        if (v && v.length) playChord(v.map(p => ({ string: p.string, fret: p.fret })));
      }, i * 950);
    });
  };

  const handleExport = async () => {
    setBusy(true);
    // Auto-save before export
    localStorage.setItem('scaleup_tab', JSON.stringify(tab));

    // Bundle the analysis (if any) into the PDF, in the chosen language
    const pdfAnalysis = analyzeScale ? {
      rtl: lang === 'he',
      heading: t.heading,
      scaleLabel: t.bestScale,
      scaleName: analyzeScale.name,
      matchText: `${analyzeScale.fitPercent}% ${t.match}`,
      progHeading: t.progTitle,
      progressions: (analyzeProgs ?? []).map(p => ({
        title: lang === 'he' ? p.name_he : p.name_en,
        chords: p.chords,
        why: lang === 'he' ? p.why_he : p.why_en,
      })),
    } : undefined;

    try {
      const { exportTabPDF } = await import('../../utils/pdfExport');
      // Pass the live colsPerLine so the PDF breaks lines exactly where the
      // user sees them on screen (the grid is sized in multiples of it).
      await exportTabPDF(title, subtitle, grid, bars, STRS, colsPerLine, pdfAnalysis);
    } finally {
      setBusy(false);
    }
  };

  const he = lang === 'he';
  const playing = playCol != null;

  // ── Keypad ──────────────────────────────────────────────────────────────
  // A fret goes into the cursor cell and the cursor moves on. A held 1 or 2
  // arms a tens digit ("1_") so the next digit completes a two-digit fret.
  const [prefix, setPrefix] = useState<string | null>(null);
  const advance = (s: number, c: number) => { if (c + 1 < numCols) setSel([s, c + 1]); };
  const keypadDigit = (d: string) => {
    if (!sel) return;
    const [s, c] = sel;
    const two = prefix ? prefix + d : null;
    const fret = two && parseInt(two, 10) <= 24 ? two : d;
    setPrefix(null);
    setCell(s, c, { fret });
    advance(s, c);
  };
  // A technique belongs to the note it leaves from: after a fret is entered
  // the cursor has moved on, so an empty cursor cell marks the note before it.
  const techTarget = (): [number, number] | null => {
    if (!sel) return null;
    const [s, c] = sel;
    if (grid[s][c].fret !== '' || c === 0 || grid[s][c - 1].fret === '') return [s, c];
    return [s, c - 1];
  };
  const keypadTech = (tech: Tech) => {
    const t0 = techTarget();
    if (!t0) return;
    const [s, c] = t0;
    const toggled = grid[s][c].tech === tech ? undefined : tech;
    withHistory(p => {
      const g = p.grid.map(r => [...r]);
      g[s][c] = { ...g[s][c], tech: toggled };
      return { ...p, grid: g };
    });
  };
  const keypadBack = () => {
    if (!sel) return;
    const [s, c] = sel;
    setPrefix(null);
    if (grid[s][c].fret === '' && !grid[s][c].tech && c > 0) { clearCell(s, c - 1); setSel([s, c - 1]); }
    else clearCell(s, c);
  };
  const keypadString = (dir: -1 | 1) => {
    if (!sel) return;
    const [s, c] = sel;
    const n = s + dir;
    if (n >= 0 && n < STRS.length) setSel([n, c]);
  };
  const tt = techTarget();
  const keypad = (onDone?: () => void) => (
    <TabKeypad
      where={sel ? `${STRS[sel[0]]} · ${sel[1] + 1}` : null}
      prefix={prefix}
      tech={tt ? grid[tt[0]][tt[1]].tech : undefined}
      barOn={!!(sel && barsSet.has(sel[1]))}
      onDigit={keypadDigit}
      onPrefix={setPrefix}
      onTech={keypadTech}
      onBackspace={keypadBack}
      onString={keypadString}
      onBar={toggleBar}
      onDone={onDone}
      he={he}
    />
  );

  const savePayload = () => tabHasContent(tab) ? ({ kind: 'tab' as const, name: tab.title?.trim() || 'Untitled Tab', content: { title: tab.title, subtitle: tab.subtitle, grid: tab.grid, bars: tab.bars } }) : null;
  const tuningName = (TUNINGS.find(x => x.name === song?.song.tuningName) ?? TUNINGS[0]).label;

  const header = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 4 }}>
      <div>
        <PosterInput value={title} onChange={v => setTab(p => ({ ...p, title: v }))}
          placeholder={he ? 'טאב ללא שם' : 'Untitled tab'} label={he ? 'שם הטאב' : 'Tab title'}
          max={desktop ? 150 : 76} min={34} />
        <input
          value={subtitle}
          placeholder={he ? 'הערות · כיוון · סגנון' : 'Notes · feel · tuning'}
          aria-label={he ? 'כותרת משנה' : 'Subtitle'}
          dir="auto"
          onChange={e => setTab(p => ({ ...p, subtitle: e.target.value }))}
          style={{ display: 'block', width: '100%', marginTop: 8, border: 'none', background: 'transparent', padding: 0, outline: 'none', fontFamily: 'var(--gc-mono)', fontSize: 12, letterSpacing: '0.04em', color: T.textMuted }}
        />
      </div>
      <div style={{ borderTop: `var(--su-rule) solid ${T.border}`, paddingTop: 10 }}>
        <Meta cols={desktop ? 4 : 3} items={[
          { label: 'BPM', value: song?.song.bpm ?? '—' },
          { label: he ? 'משקל' : 'Time', value: song?.song.meter ?? '4/4' },
          { label: he ? 'סולם' : 'Key', value: song?.key ? keyName(song.key, lang) : '—' },
          ...(desktop ? [{ label: he ? 'כיוון' : 'Tuning', value: tuningName }] : []),
        ]} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Pill onClick={playTab} active={playing} disabled={!tabHasContent(tab)} label={playing ? (he ? 'עצירה' : 'Stop') : (he ? 'נגינה' : 'Play')}
          style={{ background: T.secondary, color: T.white }}>{playing ? (he ? '■ עצירה' : '■ Stop') : (he ? '▶ נגינה' : '▶ Play')}</Pill>
        <Pill onClick={handleAnalyze} title="Detect the scale and suggest chord progressions">{he ? 'ניתוח' : 'Analyze'}</Pill>
        <Pill onClick={handleExport} disabled={busy}>{busy ? '…' : 'PDF'}</Pill>
        <Pill onClick={undo} disabled={!canUndo} title="Undo [Ctrl+Z]">{he ? 'ביטול' : 'Undo'}</Pill>
        {backups.length > 0 && <Pill onClick={() => setRecoverOpen(true)} title="Recover a previous save">{he ? 'שחזור' : 'Recover'}</Pill>}
        <Pill onClick={() => { if (!window.confirm('Clear all notes? This cannot be undone.')) return; clearGrid(); }} title="Clear all notes">{he ? 'ניקוי' : 'Clear'}</Pill>
        <span style={{ flex: 1 }} />
        <Stepper size="sm" label="Zoom" value={<span style={{ fontSize: 15 }}>{zoom}%</span>}
          onPrev={() => setZoom(z => Math.max(60, z - 10))} onNext={() => setZoom(z => Math.min(150, z + 10))} />
      </div>

      {/* The song's melody: send this tab to it (Harmonize and the rest pick it
          up), or pull in a melody another tool wrote. */}
      {song && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="su-label" style={{ marginInlineEnd: 4 }}>{he ? 'מלודיית השיר' : 'Song melody'}</span>
          <Pill size="sm" onClick={() => {
            song.update({ melody: { title: tab.title, subtitle: tab.subtitle, grid: tab.grid, bars: tab.bars }, melodyFrom: 'tabbuilder' });
            flashSent();
          }} disabled={!tabHasContent(tab)}>
            <RollLabel>{sent ? (he ? '✓ נשלח לשיר' : '✓ Sent to song') : (he ? 'השתמשו בטאב הזה' : 'Use this tab')}</RollLabel>
          </Pill>
          {song.song.melody && song.song.melodyFrom !== 'tabbuilder' && (
            <Pill size="sm" onClick={() => {
              const m = song.song.melody!;
              const cols = Math.max(colsPerLine * 3, Math.ceil((m.grid[0]?.length ?? 0) / colsPerLine) * colsPerLine);
              withHistory(p => {
                const grid = emptyGrid(cols);
                m.grid.forEach((row, r) => row.forEach((cell, c) => { if (grid[r]?.[c]) grid[r][c] = { fret: cell.fret ?? '', tech: cell.tech as Tech | undefined }; }));
                return { ...p, grid, bars: m.bars ?? [] };
              });
              setSel(null);
            }}>{he ? 'טעינת מלודיית השיר' : "Load the song's melody"}</Pill>
          )}
        </div>
      )}
    </div>
  );

  const ink = T.text;
  const tabGrid = (
    <div ref={wrapRef} style={{ paddingBottom: 8, minWidth: 0 }}>
      {/* An empty tab offers a riff to start from. */}
      {!tabHasContent(tab) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <span className="su-label">{he ? 'הקישו על מיתר כדי להציב תו' : 'Tap a string to place a note'}</span>
          <Pill size="sm" onClick={loadExample}>{he ? 'ריף לדוגמה' : 'Load an example riff'}</Pill>
        </div>
      )}
      {Array.from({ length: numSys }, (_, sys) => {
        const s0 = sys * colsPerLine;
        const s1 = Math.min(s0 + colsPerLine, numCols);
        return (
          <div key={sys} dir="ltr" style={{ marginBottom: 26 }} onMouseLeave={() => setHov(null)}>
            {STRS.map((lbl, si) => (
              <div key={si} style={{ display: 'flex', alignItems: 'center', userSelect: 'none' }}>
                <span style={{
                  width: 16, fontSize: Math.max(10, fs - 2), fontFamily: 'var(--gc-mono)', fontWeight: 700,
                  color: T.textMuted, textAlign: 'right', paddingRight: 5, flexShrink: 0,
                }}>{lbl}</span>
                <div style={{ width: 2, height: ch, background: ink, flexShrink: 0 }} />
                {Array.from({ length: s1 - s0 }, (_, ci) => {
                  const c    = s0 + ci;
                  const cell = grid[si][c];
                  const isSel = sel?.[0] === si && sel?.[1] === c;
                  const isHov = hov?.[0] === si && hov?.[1] === c;
                  return (
                    <React.Fragment key={c}>
                      <TabNoteCell
                        cell={cell}
                        cw={cw} ch={ch} fs={fs} circleD={circleD}
                        isSel={isSel} isHov={isHov || c === playCol} editable
                        markColor={c === playCol ? T.hairline : undefined}
                        onClick={() => selectCell(si, c)}
                        onMouseEnter={() => setHov([si, c])}
                      />
                      {barsSet.has(c) && <div style={{ width: 2, height: ch, background: ink, flexShrink: 0 }} />}
                    </React.Fragment>
                  );
                })}
                <div style={{ width: 2, height: ch, background: ink, flexShrink: 0 }} />
              </div>
            ))}
          </div>
        );
      })}
      <Pill size="sm" onClick={addLine} style={{ borderStyle: 'dashed' }}>{he ? '+ שורה' : '+ Add line'}</Pill>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'inherit' }}>

      {/* Hidden numeric input — kept for hardware keyboards that type into a
          focused field; the keypad replaces the phone's soft keyboard. */}
      <input
        ref={fretInputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value=""
        aria-hidden="true"
        tabIndex={-1}
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

      <StopActions>
        <SaveToLibraryButton size="sm" label={he ? 'שמירה' : 'Save'} getPayload={savePayload} />
      </StopActions>

      {header}

      {desktop ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 32, alignItems: 'start' }}>
          {tabGrid}
          <div style={{ position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {keypad()}
            <span className="su-label" style={{ lineHeight: 1.7 }}>
              {he ? 'מקלדת: 0–9 · חצים · h / b ~ | · ⌫ · Esc' : 'Keys: 0–9 · arrows · h / b ~ | · ⌫ · Esc'}
            </span>
          </div>
        </div>
      ) : (
        <>
          {tabGrid}
          {/* Docked keypad — over the song bar while a cell is being edited. */}
          {sel && (
            <>
              <div aria-hidden style={{ height: 250 }} />
              <div style={{ position: 'fixed', insetInline: 0, bottom: 0, zIndex: 60, paddingBottom: 'env(safe-area-inset-bottom)', background: T.secondary }}>
                {keypad(() => { setSel(null); setPrefix(null); })}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Recover ─────────────────────────────────────── */}
      {recoverOpen && (
        <Sheet onClose={() => setRecoverOpen(false)} kicker={he ? `עד ${MAX_BACKUPS} שמירות אוטומטיות` : `Up to ${MAX_BACKUPS} auto-saves`}
          title={he ? 'שחזור' : 'Recover'} maxWidth={500} zIndex={300}>
          <div>
            {[...backups].reverse().map((b, i) => {
              const d = new Date(b.ts);
              const noteCount = b.tab.grid.reduce((n, r) => n + r.filter(c => c.fret).length, 0);
              return (
                <button key={i} type="button" onClick={() => {
                  if (!window.confirm('Restore this version? Your current tab will be replaced.')) return;
                  withHistory(() => b.tab);
                  setRecoverOpen(false);
                }} className="gc-no-bar" style={{
                  display: 'block', width: '100%', minHeight: 56, padding: '10px 0', cursor: 'pointer', textAlign: 'start',
                  background: 'transparent', color: T.text, border: 'none', borderTop: `1px solid ${T.hairline}`,
                }}>
                  <span className="su-semi" style={{ display: 'block', fontSize: 20, textTransform: 'uppercase' }}>{b.tab.title || (he ? 'ללא שם' : 'Untitled')}</span>
                  <span className="su-label" style={{ display: 'block', marginTop: 4 }}>
                    {noteCount} {he ? 'תווים' : noteCount === 1 ? 'note' : 'notes'} · {d.toLocaleDateString()} {d.toLocaleTimeString()}
                  </span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {/* ── Analysis ───────────────────────────────────── */}
      {analyzeOpen && (
        <Sheet onClose={() => setAnalyzeOpen(false)} title={t.heading} maxWidth={600} zIndex={200} dir={t.dir}>
          {analyzeScale && (
            <button type="button" onClick={() => setScaleModal(true)} className="gc-no-bar" style={{
              display: 'block', width: '100%', padding: '10px 0 0', cursor: 'pointer', textAlign: 'start', color: T.text,
              background: 'transparent', border: 'none', borderTop: `var(--su-rule) solid ${T.border}`,
            }}>
              <span className="su-label" style={{ display: 'block' }}>{t.bestScale} · {analyzeScale.fitPercent}% {t.match}</span>
              <span className="su-poster" style={{ display: 'block', fontSize: 40, marginTop: 10 }}>{analyzeScale.name}</span>
              <span className="su-label" style={{ display: 'block', marginTop: 8, color: T.text }}>{t.scaleHint} ↗</span>
            </button>
          )}
          {analyzeErr && <p style={{ margin: 0, fontSize: 14, color: T.textMuted, padding: '8px 0' }}>{t[analyzeErr]}</p>}
          {analyzing && <p className="su-label" style={{ margin: 0, padding: '10px 0' }}>{t.loading}</p>}
          {analyzeProgs && analyzeProgs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <span className="su-label">{t.progTitle} · {t.tapHint}</span>
              {analyzeProgs.map((p, i) => (
                <div key={i} style={{ borderTop: `var(--su-rule) solid ${T.border}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span className="su-semi" style={{ fontSize: 20, textTransform: 'uppercase' }}>{lang === 'he' ? p.name_he : p.name_en}</span>
                    <Pill size="sm" onClick={() => playProgression(p.chords)}>▶ {t.play}</Pill>
                  </div>
                  <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {p.chords.map((c, j) => (
                      <Pill key={j} size="sm" onClick={() => setChordModal(c)} style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: 14 }}>{c}</Pill>
                    ))}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: T.textMuted, lineHeight: 1.65 }}>{lang === 'he' ? p.why_he : p.why_en}</p>
                </div>
              ))}
            </div>
          )}
          {!analyzing && (analyzeProgs || analyzeErr) && (
            <Pill onClick={runAnalysis} style={{ alignSelf: 'flex-start' }}>↻ {t.reanalyze}</Pill>
          )}
        </Sheet>
      )}

      {/* ── Chord diagram ─────────────────────────────── */}
      {chordModal && (() => {
        const voicing = findChordVoicings(chordModal, 1)[0] ?? [];
        return (
          <Sheet onClose={() => setChordModal(null)} title={chordModal} maxWidth={320} zIndex={9100}>
            <div style={{ padding: '0 12px' }}>
              {voicing.length > 0
                ? <MiniFretboard voicing={voicing} showStringLabels showFretNumbers />
                : <div style={{ textAlign: 'center', color: T.textMuted, fontSize: 13, padding: '12px 0' }}>—</div>}
            </div>
            {voicing.length > 0 && (
              <Cta onClick={() => { unlockAudio(); playChord(voicing.map(p => ({ string: p.string, fret: p.fret }))); }}>▶ {t.play}</Cta>
            )}
          </Sheet>
        );
      })()}

      {/* ── The scale on the neck (vertical) ──────────── */}
      {scaleModal && analyzeScale && (
        <Sheet onClose={() => setScaleModal(false)} title={analyzeScale.name} titleSize={36} maxWidth={340} zIndex={9100}>
          <VerticalScaleFretboard root={analyzeScale.root} type={analyzeScale.type} />
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <span className="su-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: T.primary }} />{he ? 'שורש' : 'root'}</span>
            <span className="su-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: T.secondary }} />{he ? 'סולם' : 'scale'}</span>
          </div>
        </Sheet>
      )}

    </div>
  );
};
