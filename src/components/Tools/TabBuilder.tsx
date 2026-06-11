import React, { useState, useEffect, useCallback } from 'react';
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
const BASE_CH = 26;

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

  const [sel, setSel]   = useState<[number, number] | null>(null);
  const [hov, setHov]   = useState<number | null>(null);
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const { title, subtitle, grid, bars } = tab;
  const numCols = grid[0]?.length ?? 0;
  const numSys  = Math.ceil(numCols / COLS_PER_LINE);
  const barsSet = new Set(bars);
  const cw = (BASE_CW * zoom) / 100;
  const ch = (BASE_CH * zoom) / 100;
  const fs = Math.max(9, Math.round((13 * zoom) / 100));

  const setCell = useCallback((s: number, c: number, patch: Partial<Cell>) => {
    setTab(p => {
      const g = p.grid.map(r => [...r]);
      g[s][c] = { ...g[s][c], ...patch };
      return { ...p, grid: g };
    });
  }, []);

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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, grid, numCols, setCell]);

  const applyTech = (tech: Tech) => {
    if (!sel) return;
    const [s, c] = sel;
    setCell(s, c, { tech: grid[s][c].tech === tech ? undefined : tech });
  };

  const toggleBar = () => {
    if (!sel) return;
    const c = sel[1];
    setTab(p => ({
      ...p,
      bars: p.bars.includes(c) ? p.bars.filter(b => b !== c) : [...p.bars, c],
    }));
  };

  const addLine = () => {
    setTab(p => ({
      ...p,
      grid: p.grid.map(r => [
        ...r,
        ...Array.from({ length: COLS_PER_LINE }, () => ({ fret: '' })),
      ]),
    }));
  };

  const handleSave = () => {
    localStorage.setItem('scaleup_tab', JSON.stringify(tab));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleExport = async () => {
    setBusy(true);
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
          {/* Zoom */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: T.bgInput, borderRadius: 8, padding: '4px 8px',
          }}>
            <button onClick={() => setZoom(z => Math.max(60, z - 10))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text, fontSize: 16, lineHeight: 1, padding: '0 2px' }}>
              −
            </button>
            <span style={{ fontSize: 11, color: T.textMuted, minWidth: 36, textAlign: 'center' }}>
              {zoom}%
            </span>
            <button onClick={() => setZoom(z => Math.min(150, z + 10))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text, fontSize: 16, lineHeight: 1, padding: '0 2px' }}>
              +
            </button>
          </div>
          {/* PDF export */}
          <button
            onClick={handleExport}
            disabled={busy}
            style={{
              background: T.secondary, color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 13px', cursor: busy ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 700,
            }}>
            {busy ? '…' : 'PDF'}
          </button>
          {/* Save */}
          <button
            onClick={handleSave}
            style={{
              background: saved ? '#6bcf7f' : '#F5C842',
              color: '#1a1a1a', border: 'none', borderRadius: 8,
              padding: '7px 13px', cursor: 'pointer', fontSize: 13, fontWeight: 800,
              transition: 'background 0.3s',
            }}>
            {saved ? '✓ Saved' : '✓'}
          </button>
        </div>
      </div>

      {/* ── Tab grid ────────────────────────────────────── */}
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        {Array.from({ length: numSys }, (_, sys) => {
          const s0 = sys * COLS_PER_LINE;
          const s1 = Math.min(s0 + COLS_PER_LINE, numCols);

          return (
            <div key={sys} style={{ marginBottom: 28 }}
              onMouseLeave={() => setHov(null)}>
              {STRS.map((lbl, si) => (
                <div key={si} style={{ display: 'flex', alignItems: 'center', userSelect: 'none' }}>
                  {/* String label */}
                  <span style={{
                    width: 14, fontSize: fs, fontFamily: 'monospace',
                    color: T.textMuted, textAlign: 'right', paddingRight: 3,
                    flexShrink: 0,
                  }}>
                    {lbl}
                  </span>
                  {/* Opening bar */}
                  <span style={{ fontSize: fs, fontFamily: 'monospace', color: T.textMuted, flexShrink: 0 }}>|</span>

                  {/* Cells */}
                  {Array.from({ length: s1 - s0 }, (_, ci) => {
                    const c  = s0 + ci;
                    const cell = grid[si][c];
                    const isHov = hov === c;
                    const isBar = barsSet.has(c);
                    // Rounded ends on the hover column band (top of first string, bottom of last)
                    const hovRadius = !isHov ? 0
                      : si === 0 ? '10px 10px 0 0'
                      : si === STRS.length - 1 ? '0 0 10px 10px'
                      : 0;

                    return (
                      <React.Fragment key={c}>
                        <div
                          onClick={() => setSel([si, c])}
                          onMouseEnter={() => { setHov(c); setSel([si, c]); }}
                          style={{
                            width: cw, height: ch, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderBottom: `1px dashed ${T.border}`,
                            background: isHov ? 'rgba(255, 235, 130, 0.8)' : 'transparent',
                            cursor: 'pointer',
                            fontSize: fs, fontFamily: 'monospace', fontWeight: 700,
                            color: T.text,
                            position: 'relative',
                            transition: 'background 0.05s',
                            borderRadius: hovRadius,
                          }}>
                          {cell.fret}
                          {cell.tech && (
                            <span style={{
                              position: 'absolute', top: 1, right: 1,
                              fontSize: fs * 0.68, color: T.coral, lineHeight: 1,
                            }}>
                              {cell.tech}
                            </span>
                          )}
                        </div>
                        {/* Bar line after this column */}
                        {isBar && (
                          <div style={{
                            width: 2, height: ch, background: T.text,
                            flexShrink: 0, opacity: 0.7,
                          }} />
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Closing bar */}
                  <span style={{ fontSize: fs, fontFamily: 'monospace', color: T.textMuted, flexShrink: 0 }}>|</span>
                </div>
              ))}
            </div>
          );
        })}

        {/* Add line */}
        <div style={{ paddingLeft: 17, marginTop: 4 }}>
          <button
            onClick={addLine}
            style={{
              background: T.bgInput, border: `1px dashed ${T.border}`,
              borderRadius: 8, padding: '6px 22px', cursor: 'pointer',
              color: T.textMuted, fontSize: 12,
            }}>
            + Add line
          </button>
        </div>
      </div>

      {/* ── Bottom toolbar ───────────────────────────────── */}
      <div style={{
        display: 'flex', borderTop: `1px solid ${T.border}`,
        background: '#FFF8E1', borderRadius: '0 0 10px 10px', marginTop: 16,
      }}>
        {/* More (placeholder) */}
        <button style={{
          flex: 1, padding: '10px 0', border: 'none', background: 'none',
          cursor: 'pointer', fontSize: 18, color: T.textMuted,
          borderRight: `1px solid ${T.border}`,
        }}>
          •••
        </button>

        {TECH_BTNS.map(({ id, label, sym }) => (
          <button
            key={id}
            onClick={() => applyTech(id)}
            title={!sel ? 'Select a note first' : label}
            style={{
              flex: 2, padding: '8px 4px', border: 'none',
              borderRight: `1px solid ${T.border}`,
              background: selTech === id ? '#FFE040' : 'none',
              cursor: sel ? 'pointer' : 'default',
              fontSize: 11, fontWeight: 600, color: T.text,
              opacity: sel ? 1 : 0.45,
            }}>
            <div style={{ fontSize: 15, fontFamily: 'monospace', color: T.coral, marginBottom: 2 }}>
              {sym}
            </div>
            {label}
          </button>
        ))}

        <button
          onClick={toggleBar}
          title={!sel ? 'Select a note first' : 'Toggle bar line after this column'}
          style={{
            flex: 2, padding: '8px 4px', border: 'none',
            background: sel && barsSet.has(sel[1]) ? '#FFE040' : 'none',
            cursor: sel ? 'pointer' : 'default',
            fontSize: 11, fontWeight: 600, color: T.text,
            opacity: sel ? 1 : 0.45,
          }}>
          <div style={{ fontSize: 15, fontFamily: 'monospace', color: T.coral, marginBottom: 2 }}>|</div>
          Bar
        </button>
      </div>
    </div>
  );
};
