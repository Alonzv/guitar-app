import type { CSSProperties } from 'react';
import { T } from '../../theme';

// Style objects behind the Transit parts (parts.tsx), for elements that
// can't be one of those components (a <select>, a link, a label).

export const pillStyle = (active = false, size: 'sm' | 'md' = 'md'): CSSProperties => ({
  height: 44, minWidth: 44, padding: size === 'sm' ? '0 13px' : '0 16px', flexShrink: 0,
  borderRadius: 22, border: 'none', cursor: 'pointer',
  background: active ? T.text : 'rgba(255,255,255,0.08)', color: active ? '#000' : T.text,
  fontFamily: 'var(--gc-font)', fontSize: 15, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
});

export const ctaStyle = (disabled = false): CSSProperties => ({
  ...pillStyle(false), border: 'none', padding: '0 24px', height: 50, borderRadius: 25, fontSize: 17,
  background: T.text, color: '#000', opacity: disabled ? 0.35 : 1,
  cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600,
});

export const keyStyle = (active = false, mark = false): CSSProperties => ({
  minHeight: 44, minWidth: 0, borderRadius: 14, border: 'none', cursor: 'pointer', padding: '0 4px',
  background: mark ? T.success : active ? T.text : 'rgba(255,255,255,0.08)',
  color: mark ? T.white : active ? '#000' : T.text,
  fontFamily: 'var(--su-display)', fontWeight: 600, fontSize: 17,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});

