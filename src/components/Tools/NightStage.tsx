import type { ReactNode } from 'react';
import { useLang } from '../../contexts/LanguageContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { Pill } from '../Transit/parts';

// ── Night stage ──────────────────────────────────────────────────────────────
// The tuner and the metronome are read from a metre away, so they run on the
// night surface even in light mode (.su-night scopes the dark tokens). It
// fills the stop area edge to edge; a pill in the tool turns it off, and
// that choice is kept per tool.

const HIDE_NIGHT = true;

export function NightToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const { lang } = useLang();
  // The whole app is dark now, so the per-tool night switch has nothing to do.
  if (HIDE_NIGHT) return null;
  return (
    <Pill size="sm" active={on} onClick={onToggle} title={lang === 'he' ? 'מצב לילה לכלי הזה' : 'Night mode for this tool'}>
      {lang === 'he' ? 'לילה' : 'Night'}
    </Pill>
  );
}

export function NightStage({ on, wide, children }: { on: boolean; wide?: boolean; children: ReactNode }) {
  const desktop = useIsDesktop();
  return (
    <div className={on ? 'su-night' : undefined} style={{
      // Cancel the stop's own padding so the surface meets the header and dock.
      margin: desktop ? '-28px -32px -40px' : '-14px -20px -24px',
      padding: desktop ? '28px 32px 40px' : '16px 20px 28px',
      minHeight: desktop ? 'calc(100vh - 64px - 62px)' : 'calc(100dvh - 66px - 58px)',
      boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ width: '100%', maxWidth: wide ? 1080 : 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: desktop ? 22 : 18, flex: 1 }}>
        {children}
      </div>
    </div>
  );
}
