import React, { useState, useEffect, useCallback, useRef } from 'react';
import { T } from '../../theme';
import {
  detectTabScale, extractTabNotes, suggestTabProgressions,
  type TabScaleResult, type ProgressionSuggestion,
} from '../../utils/analyzeTab';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { findChordVoicings } from '../../utils/chordVoicings';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { VerticalScaleFretboard } from '../Fretboard/VerticalScaleFretboard';

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

type Tech = 'h' | 'p' | '/' | '\\' | 'b' | '~';

interface Cell { fret: string; tech?: Tech; }
interface TabState {
  title: string;
  subtitle: string;
  grid: Cell[][];
  bars: number[];
}

const STRS = ['e', 'B', 'G', 'D', 'A', 'E'];
const COLS_PER_LINE = 32;
const BASE_CW = 28;
const BASE_CH = 30;

function emptyGrid(cols: number): Cell[][] {
  return STRS.map(() => Array.from({ length: cols }, () => ({ fret: '' })));
}

const TECH_BTNS: { id: Tech; label: string; sym: string }[] = [
  { id: 'h', label: 'Hammer/Pull', sym: 'h/p' },
  { id: '/', label: 'Slide',       sym: '/'   },
  { id: 'b', label: 'Bend',        sym: 'b'   },
  { id: '~', label: 'Vibrato',     sym: '~'   },
];

export const TabBuilder: React.FC = () => {
  const [tab, setTab] = useState<TabState>(() => {
    try {
      const s = localStorage.getItem('scaleup_tab');
      if (s) return JSON.parse(s);
    } catch {}
    return { title: '', subtitle: '', grid: emptyGrid(COLS_PER_LINE * 3), bars: [] };
  });

  const [sel, setSel]       = useState<[number, number] | null>(null);
  const [hov, setHov]       = useState<[number, number] | null>(null);
  const [zoom, setZoom]     = useState(100);
  const [busy, setBusy]     = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  // Analyze panel
  const [analyzeOpen, setAnalyzeOpen]     = useState(false);
  const [analyzing, setAnalyzing]         = useState(false);
  const [analyzeScale, setAnalyzeScale]   = useState<TabScaleResult | null>(null);
  const [analyzeProgs, setAnalyzeProgs]   = useState<ProgressionSuggestion[] | null>(null);
  const [analyzeErr, setAnalyzeErr]       = useState<ErrKey | null>(null);
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem('scaleup_lang') as Lang) || 'he'; } catch { return 'he'; }
  });
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

  useEffect(() => { try { localStorage.setItem('scaleup_lang', lang); } catch { /* ignore */ } }, [lang]);

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

  // Auto-persist the tab on every change so switching tools never loses work.
  // Only the user (Clear button) wipes it intentionally.
  useEffect(() => {
    try { localStorage.setItem('scaleup_tab', JSON.stringify(tab)); } catch { /* ignore */ }
  }, [tab]);

  const { title, subtitle, grid, bars } = tab;
  const numCols = grid[0]?.length ?? 0;
  const barsSet = new Set(bars);
  const cw = (BASE_CW * zoom) / 100;
  const ch = (BASE_CH * zoom) / 100;
  const fs = Math.max(9, Math.round((13 * zoom) / 100));
  const circleD = Math.round(ch * 0.72);
  const colsPerLine = Math.max(8, Math.floor((wrapW - 36) / cw));
  const numSys = Math.ceil(numCols / colsPerLine);

  // Default = exactly 3 systems. Resize without pushing to undo history.
  useEffect(() => {
    setTab(p => {
      const cols = p.grid[0]?.length ?? 0;
      let lastUsed = -1;
      for (const row of p.grid)
        for (let c = cols - 1; c > lastUsed; c--)
          if (row[c].fret) { lastUsed = c; break; }
      const want = Math.max(3, Math.ceil((lastUsed + 1) / colsPerLine)) * colsPerLine;
      if (want === cols) return p;
      const grid = p.grid.map(row =>
        want > cols
          ? [...row, ...Array.from({ length: want - cols }, () => ({ fret: '' }))]
          : row.slice(0, want)
      );
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
    if (cur.length === 1 && parseInt(cur + d) <= 24) setCell(s, c, { fret: cur + d });
    else setCell(s, c, { fret: d });
  }, [sel, grid, setCell]);

  // Shared by the global keydown listener (desktop) and the hidden input (mobile)
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
      setCell(s, c, { fret: '', tech: undefined });
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
    }
  }, [sel, grid, numCols, applyDigit, setCell, undo]);

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
  const selectCell = useCallback((s: number, c: number) => {
    setSel([s, c]);
    fretInputRef.current?.focus();
  }, []);

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

  const addLine = () => {
    withHistory(p => ({
      ...p,
      grid: p.grid.map(r => [
        ...r,
        ...Array.from({ length: colsPerLine }, () => ({ fret: '' })),
      ]),
    }));
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
      await exportTabPDF(title, subtitle, grid, bars, STRS, COLS_PER_LINE, pdfAnalysis);
    } finally {
      setBusy(false);
    }
  };

  const selTech = sel ? grid[sel[0]][sel[1]].tech : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'inherit' }}>

      {/* Hidden numeric input — drives the mobile soft keyboard for fret entry */}
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

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ padding: '12px 2px 16px' }}>
        <div style={{ minWidth: 0, marginBottom: 10 }}>
          <input
            value={title}
            placeholder="Song's title"
            onChange={e => setTab(p => ({ ...p, title: e.target.value }))}
            style={{
              background: 'none', border: 'none', outline: 'none',
              fontSize: 20, fontWeight: 700, width: '100%',
              color: title ? T.text : T.textMuted, fontFamily: 'inherit',
            }}
          />
          <input
            value={subtitle}
            placeholder="Extra info"
            onChange={e => setTab(p => ({ ...p, subtitle: e.target.value }))}
            style={{
              background: 'none', border: 'none', outline: 'none',
              fontSize: 12, width: '100%', marginTop: 2,
              color: subtitle ? T.textMuted : T.border, fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            background: T.bgInput, borderRadius: 0, padding: '5px 7px', flexShrink: 0,
          }}>
            <button onClick={() => setZoom(z => Math.max(60, z - 10))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text, fontSize: 15, lineHeight: 1, padding: '0 1px' }}>
              −
            </button>
            <span style={{ fontSize: 11, color: T.textMuted, minWidth: 30, textAlign: 'center' }}>{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(150, z + 10))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text, fontSize: 15, lineHeight: 1, padding: '0 1px' }}>
              +
            </button>
          </div>
          <button onClick={handleAnalyze}
            title="Analyze — detect scale & suggest chord progressions"
            style={{
              background: T.primary, color: '#fff', border: 'none',
              borderRadius: 0, padding: '7px 10px', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, borderLeft: '3px solid var(--gc-bar-color)', flexShrink: 0,
            }}>
            Analyze
          </button>
          <button onClick={handleExport} disabled={busy}
            style={{
              background: T.secondary, color: '#fff', border: 'none',
              borderRadius: 0, padding: '7px 10px', cursor: busy ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 700, borderLeft: '3px solid var(--gc-bar-color)', flexShrink: 0,
            }}>
            {busy ? '…' : 'PDF'}
          </button>
          <button
            onClick={clearGrid}
            title="Clear all notes"
            style={{
              background: 'transparent', color: T.textMuted,
              border: `1px solid ${T.border}`,
              borderRadius: 0, padding: '7px 9px',
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
              borderLeft: '3px solid var(--gc-bar-color)', flexShrink: 0,
            }}>
            Clear
          </button>
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            style={{
              background: '#FFC800',
              border: 'none',
              borderRadius: 0, padding: '7px 9px',
              cursor: canUndo ? 'pointer' : 'default',
              borderLeft: '3px solid var(--gc-bar-color)',
              flexShrink: 0,
              fontSize: 12, fontWeight: 700,
              color: '#1235FC',
            }}>
            undo
          </button>
        </div>
      </div>

      {/* ── Techniques toolbar — top, always visible ─────── */}
      <div style={{
        display: 'flex',
        marginBottom: 18,
        borderRadius: 0,
        overflow: 'hidden',
        border: `1px solid ${T.border}`,
        background: T.bgInput,
      }}>
        {TECH_BTNS.map(({ id, label, sym }) => (
          <button
            key={id}
            onClick={() => applyTech(id)}
            title={!sel ? 'Select a note first' : label}
            style={{
              flex: 1, padding: '8px 4px', border: 'none',
              borderRight: `1px solid ${T.border}`,
              background: selTech === id ? T.primaryBg : T.bgInput,
              cursor: sel ? 'pointer' : 'default',
              fontSize: 11, fontWeight: 600, color: T.text,
              opacity: sel ? 1 : 0.5,
              transition: 'background 0.12s',
            }}>
            <div style={{ fontSize: 16, fontFamily: 'monospace', color: T.coral, marginBottom: 3 }}>
              {sym}
            </div>
            {label}
          </button>
        ))}

        <button
          onClick={toggleBar}
          title={!sel ? 'Select a note first' : 'Toggle bar line after column'}
          style={{
            flex: 1, padding: '8px 4px', border: 'none',
            background: sel && barsSet.has(sel[1]) ? T.primaryBg : T.bgInput,
            cursor: sel ? 'pointer' : 'default',
            fontSize: 11, fontWeight: 600, color: T.text,
            opacity: sel ? 1 : 0.5,
            transition: 'background 0.12s',
          }}>
          <div style={{ fontSize: 16, fontFamily: 'monospace', color: T.coral, marginBottom: 3 }}>|</div>
          Bar
        </button>
      </div>

      {/* ── Tab grid ────────────────────────────────────── */}
      <div ref={wrapRef} style={{ paddingBottom: 8 }}>
        {Array.from({ length: numSys }, (_, sys) => {
          const s0 = sys * colsPerLine;
          const s1 = Math.min(s0 + colsPerLine, numCols);

          return (
            <div key={sys} style={{ marginBottom: 28, background: 'var(--gc-fretboard-bg)', padding: '8px 4px' }}
              onMouseLeave={() => setHov(null)}>
              {STRS.map((lbl, si) => (
                <div key={si} style={{ display: 'flex', alignItems: 'center', userSelect: 'none' }}>
                  {/* String label */}
                  <span style={{
                    width: 14, fontSize: fs, fontFamily: 'monospace',
                    color: 'rgba(255,255,255,0.75)', textAlign: 'right', paddingRight: 3, flexShrink: 0,
                  }}>
                    {lbl}
                  </span>
                  <span style={{ fontSize: fs, fontFamily: 'monospace', color: 'rgba(255,255,255,0.75)', flexShrink: 0 }}>|</span>

                  {/* Cells */}
                  {Array.from({ length: s1 - s0 }, (_, ci) => {
                    const c    = s0 + ci;
                    const cell = grid[si][c];
                    const isSel = sel?.[0] === si && sel?.[1] === c;
                    const isHov = hov?.[0] === si && hov?.[1] === c;
                    const isBar = barsSet.has(c);

                    return (
                      <React.Fragment key={c}>
                        <div
                          onClick={() => selectCell(si, c)}
                          onMouseEnter={() => setHov([si, c])}
                          style={{
                            width: cw, height: ch, flexShrink: 0,
                            position: 'relative', cursor: 'pointer',
                          }}>

                          {/* ── String line through vertical center ── */}
                          <div style={{
                            position: 'absolute',
                            top: '50%', left: 0, right: 0,
                            height: 0,
                            borderTop: '2px solid rgba(255,255,255,1)',
                            transform: 'translateY(-0.5px)',
                            pointerEvents: 'none',
                          }} />

                          {/* ── Hover circle (light) ── */}
                          {isHov && !isSel && (
                            <div style={{
                              position: 'absolute',
                              width: circleD, height: circleD,
                              borderRadius: 0,
                              background: 'rgba(255, 220, 80, 0.32)',
                              top: '50%', left: '50%',
                              transform: 'translate(-50%, -50%)',
                              pointerEvents: 'none',
                            }} />
                          )}

                          {/* ── Selected circle (solid) ── */}
                          {isSel && (
                            <div style={{
                              position: 'absolute',
                              width: circleD, height: circleD,
                              borderRadius: 0,
                              background: 'rgba(255, 210, 0, 0.60)',
                              top: '50%', left: '50%',
                              transform: 'translate(-50%, -50%)',
                              pointerEvents: 'none',
                            }} />
                          )}

                          {/* ── Fret number ── */}
                          {cell.fret && (
                            <span style={{
                              position: 'absolute',
                              top: '50%', left: '50%',
                              transform: 'translate(-50%, -50%)',
                              fontSize: fs, fontFamily: 'monospace',
                              fontWeight: 700, color: '#ffffff',
                              lineHeight: 1, zIndex: 1,
                            }}>
                              {cell.fret}
                            </span>
                          )}

                          {(cell.tech === '/' || cell.tech === '\\') && (
                            <span style={{
                              position: 'absolute', top: '50%', right: 0,
                              transform: 'translate(50%, -50%)',
                              fontSize: Math.round(fs * 1.5), fontFamily: 'monospace',
                              fontWeight: 700, color: T.coral,
                              lineHeight: 1, zIndex: 2, pointerEvents: 'none',
                            }}>
                              {cell.tech}
                            </span>
                          )}
                          {(cell.tech === 'h' || cell.tech === 'p') && (
                            <span style={{
                              position: 'absolute', top: -2, right: 0,
                              transform: 'translateX(50%)',
                              fontSize: Math.round(fs * 1.1), fontFamily: 'monospace',
                              fontWeight: 700, fontStyle: 'italic', color: T.coral,
                              lineHeight: 1, zIndex: 2, pointerEvents: 'none',
                            }}>
                              {cell.tech}
                            </span>
                          )}
                          {cell.tech === 'b' && (
                            <svg
                              width={Math.round(cw * 0.7)} height={Math.round(ch * 0.32)}
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
                              fontSize: Math.round(fs * 1.3), fontFamily: 'monospace',
                              fontWeight: 700, color: T.coral,
                              lineHeight: 1, zIndex: 2, pointerEvents: 'none',
                              letterSpacing: -1,
                            }}>
                              ~
                            </span>
                          )}
                        </div>

                        {/* Bar line */}
                        {isBar && (
                          <div style={{
                            width: 2, height: ch, background: 'rgba(255,255,255,0.9)',
                            flexShrink: 0,
                          }} />
                        )}
                      </React.Fragment>
                    );
                  })}

                  <span style={{ fontSize: fs, fontFamily: 'monospace', color: 'rgba(255,255,255,0.75)', flexShrink: 0 }}>|</span>
                </div>
              ))}
            </div>
          );
        })}

        {/* Add line */}
        <div style={{ paddingLeft: 17, marginTop: 4 }}>
          <button onClick={addLine}
            style={{
              background: T.bgInput, border: `1px dashed ${T.border}`,
              borderRadius: 0, padding: '6px 22px', cursor: 'pointer',
              color: T.textMuted, fontSize: 12, borderLeft: '3px solid var(--gc-bar-color)',
            }}>
            + Add line
          </button>
        </div>
      </div>

      {/* ── Analyze modal ─────────────────────────────────── */}
      {analyzeOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setAnalyzeOpen(false); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, padding: 16,
          }}>
          <div dir={t.dir} style={{
            background: T.bgCard, borderRadius: 0, border: `1px solid ${T.border}`,
            width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto',
            padding: '26px 26px 22px', position: 'relative',
            display: 'flex', flexDirection: 'column', gap: 16,
            textAlign: t.dir === 'rtl' ? 'right' : 'left',
          }}>
            {/* Close (always top-right visually) */}
            <button onClick={() => setAnalyzeOpen(false)} style={{
              position: 'absolute', top: 12, insetInlineEnd: 12,
              background: T.bgInput, border: 'none', borderRadius: 0,
              cursor: 'pointer', color: T.textMuted, fontSize: 16, lineHeight: 1,
              padding: '3px 7px', borderLeft: '3px solid var(--gc-bar-color)',
            }}>✕</button>

            {/* Heading + language toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingInlineEnd: 28 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{t.heading}</span>
              <div style={{
                display: 'flex', borderRadius: 0, overflow: 'hidden',
                border: `1px solid ${T.border}`, marginInlineStart: 'auto',
              }}>
                {(['he', 'en'] as Lang[]).map(lg => (
                  <button key={lg} onClick={() => setLang(lg)} style={{
                    border: 'none', cursor: 'pointer', padding: '5px 11px',
                    fontSize: 13, fontWeight: 700,
                    background: lang === lg ? T.secondary : T.bgInput,
                    color: lang === lg ? '#fff' : T.textMuted,
                  }}>{lg === 'he' ? 'עברית' : 'EN'}</button>
                ))}
              </div>
            </div>

            {/* Detected scale — clickable */}
            {analyzeScale && (
              <button
                onClick={() => setScaleModal(true)}
                style={{
                  background: T.bgInput, borderRadius: 0, padding: '15px 18px',
                  borderInlineStart: `3px solid ${T.primary}`, border: 'none',
                  cursor: 'pointer', textAlign: 'inherit', width: '100%',
                }}>
                <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4 }}>{t.bestScale}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 25, fontWeight: 800, color: T.text, textDecoration: 'underline', textDecorationColor: T.primary }}>
                    {analyzeScale.name}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.primary }}>
                    {analyzeScale.fitPercent}% {t.match}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>{t.scaleHint} ↗</div>
              </button>
            )}

            {/* Error / empty */}
            {analyzeErr && (
              <div style={{ fontSize: 15, color: T.textMuted, textAlign: 'center', padding: '8px 0' }}>
                {t[analyzeErr]}
              </div>
            )}

            {/* Loading */}
            {analyzing && (
              <div style={{ fontSize: 15, color: T.textMuted, textAlign: 'center', padding: '12px 0' }}>
                {t.loading}
              </div>
            )}

            {/* Progression suggestions */}
            {analyzeProgs && analyzeProgs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.textMuted }}>{t.progTitle}</span>
                  <span style={{ fontSize: 12, color: T.textDim }}>· {t.tapHint}</span>
                </div>
                {analyzeProgs.map((p, i) => (
                  <div key={i} style={{ background: T.bgInput, borderRadius: 0, padding: '15px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>
                        {lang === 'he' ? p.name_he : p.name_en}
                      </span>
                      <button onClick={() => playProgression(p.chords)}
                        style={{
                          background: T.secondary, color: '#fff', border: 'none',
                          borderRadius: 0, padding: '5px 12px', cursor: 'pointer',
                          fontSize: 13, fontWeight: 700, flexShrink: 0,
                          borderLeft: '3px solid var(--gc-bar-color)',
                        }}>▶ {t.play}</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, margin: '10px 0' }}>
                      {p.chords.map((c, j) => (
                        <button key={j} onClick={() => setChordModal(c)} style={{
                          background: T.primaryBg, color: T.text, borderRadius: 0,
                          padding: '6px 13px', fontSize: 16, fontWeight: 700,
                          fontFamily: 'monospace', border: 'none', cursor: 'pointer',
                          borderLeft: '3px solid var(--gc-bar-color)',
                        }}>{c}</button>
                      ))}
                    </div>
                    <div style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.65 }}>
                      {lang === 'he' ? p.why_he : p.why_en}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Re-analyze */}
            {!analyzing && (analyzeProgs || analyzeErr) && (
              <button onClick={runAnalysis} style={{
                background: 'transparent', border: `1px solid ${T.border}`,
                borderRadius: 0, padding: '8px 0', cursor: 'pointer',
                color: T.textMuted, fontSize: 14, fontWeight: 700,
                borderLeft: '3px solid var(--gc-bar-color)',
              }}>↻ {t.reanalyze}</button>
            )}
          </div>
        </div>
      )}

      {/* ── Chord diagram modal ───────────────────────────── */}
      {chordModal && (() => {
        const voicing = findChordVoicings(chordModal, 1)[0] ?? [];
        return (
          <div
            onClick={e => { if (e.target === e.currentTarget) setChordModal(null); }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 210, padding: 16,
            }}>
            <div style={{
              background: T.bgCard, borderRadius: 0, border: `1px solid ${T.border}`,
              width: '100%', maxWidth: 300, padding: '20px 20px 16px',
              display: 'flex', flexDirection: 'column', gap: 12, position: 'relative',
            }}>
              <button onClick={() => setChordModal(null)} style={{
                position: 'absolute', top: 12, right: 12, background: T.bgInput,
                border: 'none', borderRadius: 0, cursor: 'pointer', color: T.textMuted,
                fontSize: 16, lineHeight: 1, padding: '3px 7px',
                borderLeft: '3px solid var(--gc-bar-color)',
              }}>✕</button>
              <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, color: T.text }}>
                {chordModal}
              </div>
              <div style={{ padding: '0 12px' }}>
                {voicing.length > 0
                  ? <MiniFretboard voicing={voicing} showStringLabels showFretNumbers />
                  : <div style={{ textAlign: 'center', color: T.textMuted, fontSize: 13, padding: '12px 0' }}>—</div>}
              </div>
              {voicing.length > 0 && (
                <button onClick={() => { unlockAudio(); playChord(voicing.map(p => ({ string: p.string, fret: p.fret }))); }}
                  style={{
                    padding: '10px 0', borderRadius: 0, border: 'none', cursor: 'pointer',
                    fontWeight: 700, fontSize: 14, background: T.secondary, color: '#fff',
                    borderLeft: '4px solid var(--gc-bar-color)',
                  }}>▶ {t.play}</button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Scale on the neck (vertical) modal ────────────── */}
      {scaleModal && analyzeScale && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setScaleModal(false); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 210, padding: 16,
          }}>
          <div style={{
            background: T.bgCard, borderRadius: 0, border: `1px solid ${T.border}`,
            width: '100%', maxWidth: 340, maxHeight: '90vh', overflowY: 'auto',
            padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 12,
            position: 'relative',
          }}>
            <button onClick={() => setScaleModal(false)} style={{
              position: 'absolute', top: 12, right: 12, background: T.bgInput,
              border: 'none', borderRadius: 0, cursor: 'pointer', color: T.textMuted,
              fontSize: 16, lineHeight: 1, padding: '3px 7px',
              borderLeft: '3px solid var(--gc-bar-color)',
            }}>✕</button>
            <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, color: T.text }}>
              {analyzeScale.name}
            </div>
            <VerticalScaleFretboard root={analyzeScale.root} type={analyzeScale.type} />
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, fontSize: 10, color: T.textDim }}>
              <span><span style={{ color: T.primary, fontWeight: 700 }}>●</span> root</span>
              <span><span style={{ color: T.secondary, fontWeight: 700 }}>●</span> scale</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
