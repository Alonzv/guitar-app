import React from 'react';
import { T } from '../../theme';

const PANEL_TITLES = ['CHORDS', 'SCALES', 'VOICINGS', 'PRACTICE', 'STUDIO'];

interface Props {
  tab: number;
  onTabChange: (t: number) => void;
  darkMode: boolean;
  onToggleDark: () => void;
  userMenu?: React.ReactNode;
  sharedBanner?: React.ReactNode;
  children: React.ReactNode;
}

export function DesktopShell({
  tab, onTabChange,
  darkMode, onToggleDark,
  userMenu, sharedBanner,
  children,
}: Props) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: T.bgDeep, color: T.text, fontFamily: 'var(--gc-font)',
    }}>
      {sharedBanner}

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header style={{
        padding: '15px 30px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: T.bgDeep, flexShrink: 0,
      }}>

        {/* Left: wordmark */}
        <span style={{ fontFamily: 'var(--gc-font)', fontWeight: 600, fontSize: 19, lineHeight: 1 }}>
          <span style={{ color: T.text }}>Scale</span>
          <span style={{ color: T.brandAccent }}>Up</span>
        </span>

        {/* Center: horizontal tab nav */}
        <nav>
          <div style={{ display: 'flex', gap: 34, alignItems: 'flex-end' }}>
            {PANEL_TITLES.map((title, i) => {
              const active = i === tab;
              return (
                <button
                  key={i}
                  onClick={() => onTabChange(i)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    background: 'transparent', cursor: 'pointer', padding: '0 2px',
                    fontSize: active ? 15 : 14,
                    fontWeight: active ? 600 : 400,
                    color: active ? T.text : T.textMuted,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    border: 'none',
                    transition: 'color 0.15s',
                  }}
                >
                  {title}
                  <span style={{
                    display: 'block',
                    width: active ? 22 : 4,
                    height: active ? 3 : 4,
                    background: active ? T.primary : T.border,
                    transition: 'width 0.2s ease, background 0.2s ease',
                  }} />
                </button>
              );
            })}
          </div>
        </nav>

        {/* Right: ghost icon buttons + user menu */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={onToggleDark}
            title={darkMode ? 'Light mode' : 'Dark mode'}
            className="gc-icon-btn"
            style={{
              width: 34, height: 34, borderRadius: 0,
              border: `1px solid ${T.border}`,
              background: 'transparent',
              color: T.textDim, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {darkMode ? 'L' : 'D'}
          </button>
          {userMenu}
        </div>
      </header>

      {/* ── Workspace ────────────────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        maxWidth: 1240, width: '100%',
        margin: '0 auto',
        padding: '28px 40px 40px',
        boxSizing: 'border-box',
      }}>
        {children}
      </main>
    </div>
  );
}
