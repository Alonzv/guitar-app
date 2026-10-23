import type { CSSProperties } from 'react';
import { T } from '../../theme';

// A pill-shaped native select (tuning, capo) and its caret.
export const SELECT_PILL: CSSProperties = {
  appearance: 'none', WebkitAppearance: 'none', width: '100%', minHeight: 44,
  padding: '0 34px 0 16px', borderRadius: 'var(--su-pill)', border: `1.5px solid ${T.text}`,
  background: 'transparent', color: T.text, fontFamily: 'var(--gc-font)', fontSize: 12, fontWeight: 700,
  cursor: 'pointer', outline: 'none',
};

export const CARET: CSSProperties = {
  position: 'absolute', insetInlineEnd: 14, pointerEvents: 'none', fontSize: 9, color: T.text,
};
