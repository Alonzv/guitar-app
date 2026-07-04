import React, { useState, useEffect, useRef, useCallback } from 'react';
import { T } from '../theme';
import { BrandMark } from './BrandMark';

// ── Segment control ──────────────────────────────────────────────────────────

interface SegItem { id: string; label: string }

interface SegmentProps {
  items: SegItem[];
  active: string;
  onChange: (id: string) => void;
}

export function Segment({ items, active, onChange }: SegmentProps) {
  return (
    <div style={{ display: 'flex', border: `1px solid ${T.border}`, marginBottom: 18, flexShrink: 0 }}>
      {items.map((it, i) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          style={{
            flex: 1, textAlign: 'center',
            padding: '10px 4px', minHeight: 44,
            fontFamily: 'var(--gc-font)',
            fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase',
            cursor: 'pointer', borderRadius: 0,
            borderLeft: i > 0 ? `1px solid ${T.border}` : 'none',
            background: it.id === active ? T.secondary : 'transparent',
            color: it.id === active ? '#fff' : T.textDim,
            fontWeight: it.id === active ? 500 : 400,
            transition: 'background .12s ease, color .12s ease',
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ── SwipePager ───────────────────────────────────────────────────────────────

interface SwipePagerProps {
  tab: number;
  onTabChange: (t: number) => void;
  tabTitles: string[];
  darkMode: boolean;
  onToggleDark: () => void;
  userMenu?: React.ReactNode;
  sharedBanner?: React.ReactNode;
  children: React.ReactNode;
}

const N_TABS = 5;
const TITLE_W = 150; // px per title cell

export function SwipePager({
  tab, onTabChange, tabTitles,
  darkMode, onToggleDark,
  userMenu, sharedBanner, children,
}: SwipePagerProps) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [W, setW] = useState(0);

  // areaRef measures the content width — nav strip has the same width
  const areaRef  = useRef<HTMLDivElement>(null);
  const axisRef  = useRef<null | 'h' | 'v'>(null);
  const sxRef    = useRef(0);
  const syRef    = useRef(0);
  const pidRef   = useRef(0);
  const capRef   = useRef(false);
  const dragRef  = useRef(false);

  const measure = useCallback(() => {
    if (areaRef.current) {
      const w = areaRef.current.clientWidth;
      if (w > 0) setW(w);
    }
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // ── Pointer handlers (placed on the full swipe zone) ──────────────────────
  const onDown = (e: React.PointerEvent) => {
    sxRef.current  = e.clientX;
    syRef.current  = e.clientY;
    axisRef.current = null;
    pidRef.current  = e.pointerId;
    capRef.current  = false;
    dragRef.current = true;
    setDragging(true);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const cdx = e.clientX - sxRef.current;
    const cdy = e.clientY - syRef.current;

    if (axisRef.current === null) {
      if (Math.abs(cdx) > 6 || Math.abs(cdy) > 6) {
        axisRef.current = Math.abs(cdx) > Math.abs(cdy) ? 'h' : 'v';
      } else return;
    }
    if (axisRef.current !== 'h') return;

    // Capture only after axis confirmed — preserves taps on inner controls
    if (!capRef.current) {
      try { e.currentTarget.setPointerCapture(pidRef.current); } catch (_) {}
      capRef.current = true;
    }

    let d = cdx;
    if ((tab === 0 && d > 0) || (tab === N_TABS - 1 && d < 0)) d *= 0.35;
    setDx(d);
  };

  const onUp = () => {
    if (!dragRef.current) return;
    dragRef.current = false;
    const ww = W || 400;
    const threshold = ww * 0.2;
    let t = tab;
    if (axisRef.current === 'h') {
      if (dx <= -threshold) t = Math.min(N_TABS - 1, t + 1);
      else if (dx >= threshold) t = Math.max(0, t - 1);
    }
    axisRef.current = null;
    setDragging(false);
    setDx(0);
    if (t !== tab) onTabChange(t);
  };

  const ww    = W || 400;
  const trans = dragging ? 'none' : 'transform .36s cubic-bezier(0.22,1,0.36,1)';
  const contentX = -tab * ww + (dragging ? dx : 0);
  const titleX   = (ww - TITLE_W) / 2 - tab * TITLE_W + (dragging ? dx * 0.45 : 0);

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      backgroundColor: T.bgDeep, color: T.text, fontFamily: 'var(--gc-font)',
      overflow: 'hidden',
    }}>
      {/* ── Shared progression banner (optional) ─────────────────────────── */}
      {sharedBanner}

      {/* ── Header: wordmark + ghost icon buttons ─────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 18px 12px',
        backgroundColor: T.bgDeep,
        flexShrink: 0,
      }}>
        <BrandMark size={24} />

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={onToggleDark}
            title={darkMode ? 'Light mode' : 'Dark mode'}
            className="gc-icon-btn"
            style={{
              width: 30, height: 30, borderRadius: 0,
              border: `1px solid ${T.border}`,
              background: 'transparent',
              color: T.textDim, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {darkMode ? '☀' : '☾'}
          </button>

          {userMenu}
        </div>
      </div>

      {/* ── Swipe zone: nav strip + content (full-width swipe capture) ────── */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          touchAction: 'pan-y',
          cursor: dragging ? 'grabbing' : 'default',
        }}
      >
        {/* ── Nav strip: title carousel + dots + hint ───────────────────── */}
        <div style={{
          borderTop: `1px solid ${T.border}`,
          borderBottom: `1px solid ${T.border}`,
          padding: '14px 0 11px',
          flexShrink: 0,
        }}>
          {/* Title carousel */}
          <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: 30 }}>
            <div style={{
              display: 'flex', alignItems: 'center', height: 30,
              transform: `translate3d(${titleX}px,0,0)`,
              transition: trans,
              willChange: 'transform',
            }}>
              {tabTitles.map((t, i) => (
                <span
                  key={i}
                  onClick={() => onTabChange(i)}
                  style={{
                    flex: `0 0 ${TITLE_W}px`,
                    textAlign: 'center',
                    cursor: 'pointer',
                    fontFamily: 'var(--gc-font)',
                    letterSpacing: '0.05em',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                    fontSize:   i === tab ? 22 : 13,
                    fontWeight: i === tab ? 600 : 400,
                    color:      i === tab ? T.text : 'var(--gc-peek)',
                    transition: trans,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Dots */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 7, marginTop: 12,
          }}>
            {tabTitles.map((_, i) => (
              <span
                key={i}
                onClick={() => onTabChange(i)}
                style={{
                  display: 'inline-block',
                  cursor: 'pointer',
                  ...(i === tab
                    ? { width: 16, height: 5, background: T.primary }
                    : { width: 5,  height: 5, background: T.border }),
                  transition: trans,
                }}
              />
            ))}
          </div>

        </div>

        {/* ── Content track ─────────────────────────────────────────────── */}
        <div ref={areaRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            display: 'flex',
            width: `${N_TABS * (ww || 400)}px`,
            height: '100%',
            transform: `translate3d(${contentX}px,0,0)`,
            transition: trans,
            willChange: 'transform',
          }}>
            {React.Children.map(children, (child, i) => (
              <div
                key={i}
                style={{
                  width: ww || 400,
                  flexShrink: 0,
                  height: '100%',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  padding: 18,
                  boxSizing: 'border-box',
                }}
              >
                {child}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
