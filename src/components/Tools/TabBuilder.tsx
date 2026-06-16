import React, { useState, useEffect, useCallback, useRef } from 'react';
import { T } from '../../theme';

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sel) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const [s, c] = sel;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        const cur = grid[s][c].fret;
        if (cur.length === 1 && parseInt(cur + e.key) <= 24)
          setCell(s, c, { fret: cur + e.key });
        else
          setCell(s, c, { fret: e.key });
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
      } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, grid, numCols, setCell, undo]);

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

  const handleExport = async () => {
    setBusy(true);
    // Auto-save before export
    localStorage.setItem('scaleup_tab', JSON.stringify(tab));
    try {
      const { exportTabPDF } = await import('../../utils/pdfExport');
      await exportTabPDF(title, subtitle, grid, bars, STRS, COLS_PER_LINE);
    } finally {
      setBusy(false);
    }
  };

  const selTech = sel ? grid[sel[0]][sel[1]].tech : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'inherit' }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: '12px 2px 16px', gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: T.bgInput, borderRadius: 8, padding: '4px 8px',
          }}>
            <button onClick={() => setZoom(z => Math.max(60, z - 10))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text, fontSize: 16, lineHeight: 1, padding: '0 2px' }}>
              −
            </button>
            <span style={{ fontSize: 11, color: T.textMuted, minWidth: 36, textAlign: 'center' }}>{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(150, z + 10))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text, fontSize: 16, lineHeight: 1, padding: '0 2px' }}>
              +
            </button>
          </div>
          <button onClick={handleExport} disabled={busy}
            style={{
              background: T.secondary, color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 13px', cursor: busy ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 700,
            }}>
            {busy ? '…' : 'PDF'}
          </button>
          <button
            onClick={clearGrid}
            title="Clear all notes"
            style={{
              background: 'transparent',
              color: T.textMuted,
              border: `1px solid ${T.border}`,
              borderRadius: 8, padding: '7px 11px',
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
            }}>
            Clear
          </button>
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            style={{
              background: T.bgInput,
              color: canUndo ? T.text : T.textMuted,
              border: `1px solid ${T.border}`,
              borderRadius: 8, padding: '7px 11px',
              cursor: canUndo ? 'pointer' : 'default',
              fontSize: 16, lineHeight: 1,
              opacity: canUndo ? 1 : 0.35,
              transition: 'opacity 0.2s',
            }}>
            ↩
          </button>
        </div>
      </div>

      {/* ── Techniques toolbar — top, always visible ─────── */}
      <div style={{
        display: 'flex',
        marginBottom: 18,
        borderRadius: 10,
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
            <div key={sys} style={{ marginBottom: 28 }}
              onMouseLeave={() => setHov(null)}>
              {STRS.map((lbl, si) => (
                <div key={si} style={{ display: 'flex', alignItems: 'center', userSelect: 'none' }}>
                  {/* String label */}
                  <span style={{
                    width: 14, fontSize: fs, fontFamily: 'monospace',
                    color: T.textMuted, textAlign: 'right', paddingRight: 3, flexShrink: 0,
                  }}>
                    {lbl}
                  </span>
                  <span style={{ fontSize: fs, fontFamily: 'monospace', color: T.textMuted, flexShrink: 0 }}>|</span>

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
                          onClick={() => setSel([si, c])}
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
                            borderTop: `1px dashed ${T.border}`,
                            transform: 'translateY(-0.5px)',
                            pointerEvents: 'none',
                          }} />

                          {/* ── Hover circle (light) ── */}
                          {isHov && !isSel && (
                            <div style={{
                              position: 'absolute',
                              width: circleD, height: circleD,
                              borderRadius: '50%',
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
                              borderRadius: '50%',
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
                              fontWeight: 700, color: T.text,
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
                            width: 2, height: ch, background: T.text,
                            flexShrink: 0, opacity: 0.6,
                          }} />
                        )}
                      </React.Fragment>
                    );
                  })}

                  <span style={{ fontSize: fs, fontFamily: 'monospace', color: T.textMuted, flexShrink: 0 }}>|</span>
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
              borderRadius: 8, padding: '6px 22px', cursor: 'pointer',
              color: T.textMuted, fontSize: 12,
            }}>
            + Add line
          </button>
        </div>
      </div>

    </div>
  );
};
