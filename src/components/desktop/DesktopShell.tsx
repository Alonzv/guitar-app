import React from 'react';
import { T } from '../../theme';
import { BrandMark } from '../BrandMark';
import { PANEL_TITLES } from '../../constants/panels';
import { LangToggle } from '../LangToggle';
import { SoundToggle } from '../SoundToggle';
import { useSlider } from '../../motion/useSlider';



interface Props {
  tab: number;
  onTabChange: (t: number) => void;
  darkMode: boolean;
  onToggleDark: () => void;
  userMenu?: React.ReactNode;
  sharedBanner?: React.ReactNode;
  onLogoClick?: () => void;
  children: React.ReactNode;
}

export function DesktopShell({
  tab, onTabChange,
  darkMode, onToggleDark,
  userMenu, sharedBanner,
  onLogoClick,
  children,
}: Props) {
  const slider = useSlider(tab);
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

        {/* Left: mark + wordmark lockup. Clickable → Chords / By Name.
            Kept a <span> (not <button>) so the global uppercase button style
            doesn't turn "ScaleUp" into "SCALEUP". */}
        <span
          onClick={onLogoClick}
          role={onLogoClick ? 'button' : undefined}
          className="gc-no-bar"
          tabIndex={onLogoClick ? 0 : undefined}
          aria-label={onLogoClick ? 'ScaleUp — go to Chords, By Name' : undefined}
          onKeyDown={onLogoClick ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLogoClick(); } }) : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: onLogoClick ? 'pointer' : 'default' }}
        >
          <BrandMark size={18} />
          <span style={{ fontFamily: 'var(--gc-font)', fontWeight: 600, fontSize: 19, letterSpacing: '-0.045em', lineHeight: 1 }}>
            <span style={{ color: T.text }}>Scale</span>
            <span style={{ color: T.brandAccent }}>Up</span>
          </span>
        </span>

        {/* Center: horizontal tab nav */}
        <nav>
          {/* Inactive tabs keep a small dot; the active underline is one bar that
              slides from tab to tab. */}
          <div style={{ display: 'flex', gap: 34, alignItems: 'flex-end', position: 'relative' }}>
            {PANEL_TITLES.map((title, i) => {
              const active = i === tab;
              return (
                <button
                  key={i}
                  ref={slider.itemRef(i)}
                  onClick={() => onTabChange(i)}
                  className="gc-no-bar"
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    background: 'transparent', cursor: 'pointer', padding: '0 2px',
                    fontSize: active ? 15 : 14,
                    fontWeight: active ? 600 : 400,
                    color: active ? T.text : T.textMuted,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    border: 'none',
                  }}
                >
                  {title}
                  <span style={{
                    display: 'block', width: 4, height: 4,
                    background: T.border, opacity: active ? 0 : 1,
                    transition: 'opacity var(--gc-dur-base) var(--gc-ease-out)',
                  }} />
                </button>
              );
            })}
            <div className="gc-slide" style={{ ...slider.style, bottom: 0, height: 3, display: 'flex', justifyContent: 'center' }}>
              <span style={{ width: 22, height: 3, background: T.primary }} />
            </div>
          </div>
        </nav>

        {/* Right: ghost icon buttons + user menu */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SoundToggle />
          <LangToggle />
          <button
            onClick={onToggleDark}
            title={darkMode ? 'Light mode' : 'Dark mode'}
            className="gc-icon-btn"
            style={{
              width: 34, height: 34, borderRadius: 0,
              border: `1px solid ${T.border}`,
              background: 'transparent',
              color: T.textDim, fontSize: 12, fontWeight: 600, fontFamily: 'var(--gc-mono)',
              letterSpacing: '0.04em', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {darkMode ? 'D' : 'L'}
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
