import type { CSSProperties } from 'react';
import { T } from '../../theme';
import { pillStyle } from '../Transit/styles';

// Small shared styles for the voicing stops (Voice Leading, Harmonize,
// Reharmonize): a <select> drawn as an outlined pill (SelectPill adds the ▾), a raised number field,
// the AI pick tag and the busy spinner.

export const selectPill = (extra?: CSSProperties): CSSProperties => ({
  ...pillStyle(false, 'md'), appearance: 'none', WebkitAppearance: 'none',
  padding: '0 30px', cursor: 'pointer', textTransform: 'none', letterSpacing: '0.02em', fontSize: 12.5,
  ...extra,
});

export const field: CSSProperties = {
  height: 44, padding: '0 10px', boxSizing: 'border-box', background: T.bgCard, border: `2px solid ${T.text}`,
  color: T.text, fontFamily: 'var(--gc-mono)', fontSize: 13, fontWeight: 700, textAlign: 'center', borderRadius: 0,
};

/** The small ink tag on the AI's pick. */
export const pickTag: CSSProperties = {
  display: 'inline-block', padding: '2px 6px', background: T.text, color: T.bgDeep,
  fontFamily: 'var(--gc-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', lineHeight: 1.4,
};

export const spinner = (color: string): CSSProperties => ({
  display: 'inline-block', width: 12, height: 12, border: `2px solid ${color}`, borderTopColor: 'transparent',
  borderRadius: '50%', animation: 'spin 0.7s linear infinite', boxSizing: 'border-box',
});
